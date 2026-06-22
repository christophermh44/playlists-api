import { CronExpressionParser } from 'https://esm.sh/cron-parser@5.5.0'
import './juration.js'
import yaml from './js-yaml.js'

let context 

function createContext() {
    return {
        database: [ ],
        script: '',
        from: null,
        duration: null,
        currentRotation: null,
        currentRotationIndex: 0,
        currentTime: null,
        queue: [ ],
        history: [ ],
        actions: [ ],
        onPlaylistUpdated: context => { }
    }
}

export function rebuildString(string, ...vars) {
    let index = 1
    let [ output ] = string
    for (const v of vars) {
        output += String(v)
        output += String(string[index++])
    }
    return output
}

function matches(file, params) {
    return Object.entries(params).every(([ key, value ]) => {
        if (Array.isArray(file[key])) {
            if (!(Array.isArray(value))) {
                value = [ value ]
            }
            return value.every(v => file[key].includes(v))
        } else {
            return file[key] === value
        }
    })
}

export function buildParams(query, ...vars) {
    return yaml.load(rebuildString(query, ...vars))
}

function file() {
    const params = buildParams(arguments)
    const found = context.database.find(file => matches(file, params))
    const file = () => found
    file.entries = [ found ]
    return file
}

function collection() {
    const params = buildParams(arguments)
    const found = context.database.filter(file => matches(file, params))
    const collection = () => found[Math.floor(Math.random() * found.length)]
    collection.entries = found
    return collection
}

function toSeconds(hrTime) {
    return juration.parse(hrTime)
}

function picker() {
    const params = buildParams(arguments)
    return (...entities) => {
        return context => {
            const rules = Object.assign({
                delay_before_same_artist: null,
                delay_before_same_file: null
            }, params)
            
            const sameArtistDelay = rules.delay_before_same_artist ? toSeconds(rules.delay_before_same_artist) : 0
            const sameFileDelay = rules.delay_before_same_file ? toSeconds(rules.delay_before_same_file) : 0

            const maxArtistsSafeTime = context.currentTime.add({ seconds: -1 * sameArtistDelay })
            const maxFileSafeTime = context.currentTime.add({ seconds: -1 * sameFileDelay })

            const artistsBlackList = new Set
            const filesBlackList = new Set

            let time = context.from

            for (const item of context.queue) {
                if (Temporal.PlainDateTime.compare(time, maxArtistsSafeTime) > 0) {
                    for (const artist of item.artists) {
                        artistsBlackList.add(artist)
                    }
                }
                if (Temporal.PlainDateTime.compare(time, maxFileSafeTime) > 0) {
                    filesBlackList.add(item.id)
                }

                time = time.add({ seconds: item.duration })
            }

            const allCandidates = Array.from(
                entities.reduce((acc, curr) => {
                    return (new Set(curr.entries)).union(acc)
                }, new Set)
            )
            
            let candidates = Array.from(
                allCandidates.reduce((acc, curr) => {
                    if (
                        !(filesBlackList.has(curr.id)) &&
                        !(artistsBlackList.intersection(new Set(curr.artists)).size)
                    ) {
                        acc.add(curr)
                    }
                    return acc
                }, new Set)
            )

            
            if (!(candidates.length)) {
                candidates = allCandidates
            }
            
            return candidates.at(Math.floor(Math.random() * candidates.length))
        }
    }
}

function buildCron(cronObject) {
    const { seconds = '*', minutes = '*', hours = '*', days_of_month = '*', months = '*', days_of_week = '*' } = cronObject
    return `${seconds} ${minutes} ${hours} ${days_of_month} ${months} ${days_of_week}`
}

function when() {
    const params = buildParams(arguments)
    const cron = buildCron(params)
    return action => {
        context.actions.push({ cron, action })
    }
}

function endReached() {
    const to = context.from.add(context.duration)
    return Temporal.PlainDateTime.compare(context.currentTime, to) >= 0
}

function sendUpdate() {
    context.onPlaylistUpdated(context)
}

function runEntities(entity) {
    if (typeof entity === typeof Function) {
        return entity(context)
    } else if (Array.isArray(entity)) {
        const result = [ ]
        for (const e of entity) {
            if (Array.isArray(e)) {
                result.push(...runEntities(e))
            } else {
                const entityResult = e(context)
                result.push(entityResult)
            }
        }
        return result
    } else {
        return entity
    }
}

function replace(queue, index, ...entities) {
    context.queue = context.queue.toSpliced(index, 1, ...runEntities(entities))
}

function playNext(queue, ...entities) {
    context.queue = [ ...(context.queue), ...runEntities(entities) ]
}

function execActions(from, to) {
    for (const { cron, action } of context.actions) {
        const interval = CronExpressionParser.parse(cron, {
            startDate: from.toString(),
            endDate: to.toString()
        })
        if (interval.hasNext()) {
            interval.next()
            const actionContext = {
                ...context,
                next: context.queue.at(-1),
                currentRotation: {
                    ...context.currentRotation,
                    get index() {
                        return context.currentRotationIndex
                    },
                    set index(value) {
                        context.currentRotationIndex = value
                    }
                }
            }
            action(actionContext)
        }
    }
}

function execute(context) {
    while (!endReached()) {
        const entity = context.currentRotation[context.currentRotationIndex]
        context.currentRotationIndex = (context.currentRotationIndex + 1) % context.currentRotation.length
        const pick = runEntities(entity)
        context.queue.push(pick)
        const from = context.currentTime.add({ seconds: 0 })
        const to = context.currentTime.add({ seconds: pick.duration })
        execActions(from, to)
        sendUpdate()
        context.currentTime = context.queue.reduce((acc, curr) => {
            return acc.add({ seconds: curr.duration })
        }, context.from)
    }
}

function run(rotation) {
    context.currentRotation = rotation
    context.currentTime = context.from
    execute(context)
}

const Api = { file, collection, picker, when, run, replace, playNext }

export function generatePlaylist({ database, script, from, duration }, onPlaylistUpdated = context => { }) {
    const executable = new Function(
        'file',
        'collection',
        'picker',
        'when',
        'run',
        'replace',
        'playNext',
        script
    )

    context = createContext()

    context.database = database
    context.script = script
    context.from = from
    context.duration = duration
    context.onPlaylistUpdated = onPlaylistUpdated

    executable(
        Api.file,
        Api.collection,
        Api.picker,
        Api.when,
        Api.run,
        Api.replace,
        Api.playNext
    )
}