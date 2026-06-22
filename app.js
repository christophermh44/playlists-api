import yaml from './js-yaml.js'
import { generatePlaylist, buildParams } from './playlist-api.js'

import { EditorView } from 'https://esm.sh/@codemirror/view'
import { basicSetup } from 'https://esm.sh/codemirror'
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript'
import { monokai } from 'https://esm.sh/@uiw/codemirror-theme-monokai'

import './md5.js'

const duration = document.getElementById('duration')
const playlist = document.getElementById('preview')
const editor = document.querySelector('#editor textarea')
const richEditor = document.querySelector('.rich-editor')
const explorer = document.querySelector('#explorer tbody')
const playlistItem = document.getElementById('playlist-item')

let database = [ ]

async function loadExampleDatabase() {
    const response = await fetch('example.yml')
    const content = await response.text()
    database = yaml.load(content).map(item => {
        item.belongsTo = (string, ...values) => {
            const params = buildParams(string, ...values)
            return Object.entries(params).every(([ key, value ]) => item[key] === value)
        }
        return item
    })

    for (const item of database) {
        const color = '#' + md5(item.category).substring(4, 4 + 6)
        explorer.innerHTML += `
            <tr style="--cat-color: ${color};">
                <td>${item.id}</td>
                <td>${item.category ?? ''}</td>
                <td>${item.alias ?? ''}</td>
                <td>${item.title ?? ''}</td>
                <td>${(item.artists ?? [ ]).join(', ')}</td>
                <td>${item.duration ?? 0}</td>
                <td>${(item.tags ?? [ ]).join(', ')}</td>
            </tr>
        `
    }
}

async function loadExampleScript() {
    const response = await fetch('example.js')
    const script = await response.text()
    editor.innerHTML = script
}

function hhmmssToDuration(hhmmss) {
    const [ hh, mm, ss ] = hhmmss.split(':')
    return `PT${Number(hh)}H${Number(mm)}M${Number(ss)}S`
}

function toMMSS(seconds) {
    const mm = Math.floor(seconds / 60)
    const ss = seconds % 60
    return `${mm}:${String(ss).padStart(2, 0)}`
}

function toHHMMSS(time) {
    return time.toPlainTime().toString({ smallestUnit: 'seconds' })
}

playlist.addEventListener('command', ({ command }) => {
    switch (command) {
        case '--generate': {
            generatePlaylist({
                database: database,
                script: editor.value,
                from: Temporal.Now.plainDateTimeISO(),
                duration: Temporal.Duration.from(hhmmssToDuration(duration.value))
            }, context => {
                playlist.innerHTML = ''
                const ol = document.createElement('ol')
                let time = context.from
                for (const item of context.queue) {
                    const li = playlistItem.cloneNode(true).content
                    li.firstElementChild.style.setProperty('--cat-color', '#' + md5(item.category).substring(4, 4 + 6))
                    li.querySelector('[part="title"]').innerText = item.title ?? ''
                    li.querySelector('[part="artists"]').innerText = (item.artists ?? [ ]).join(', ')
                    li.querySelector('[part="duration"]').innerText = toMMSS(item.duration ?? 0)
                    li.querySelector('[part="time"]').innerText = toHHMMSS(time)
                    ol.appendChild(li)
                    time = time.add({ seconds: item.duration })
                }
                playlist.appendChild(ol)
            })
            break
        }
    }
})

loadExampleDatabase()
loadExampleScript().then(() => {
    const richEditorView = new EditorView({
        doc: editor.value,
        extensions: [
            basicSetup,
            javascript(),
            monokai,
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    editor.value = update.state.doc.toString()
                }
            })
        ],
        parent: richEditor
    })

    richEditor.addEventListener('click', () => {
        richEditorView.focus()
    })
})