/********************************************************\
 *                                                      *
 * This examples creates a playlist that plays a jingle *
 * followed by a music, repeatedly.                     *
 *                                                      *
 * Each hour, at hh:58, the "Top of the hour" is        *
 * inserted at the top of the following files to be     *
 * played.                                              *
 *                                                      *
 * Each hour, at hh:13 and hh:43, the ads sequence is   *
 * inserted at the top of the following files to be     *
 * played.                                              *
 *                                                      *
\********************************************************/

// Audio library requests

toth       = file`alias: toth`
ad_starter = file`alias: adstarter`
ad_ender   = file`alias: adender`

jingles    = collection`category: jingles`
songs      = collection`category: musics`
ads        = collection`category: ads`

// Repeat rules

songs_picker = picker`
    delay_before_same_artist: 45 minutes
    delay_before_same_file: 90 minutes
    on_no_candidates: pick_oldest #NYI
`

jingles_picker = picker`
    delay_before_same_file: 30 minutes
    on_no_candidates: pick_random #NYI
`

ads_picker = picker`
    delay_before_same_file: 30 minutes
    on_no_candidates: pick_oldest #NYI
`

// Loops

music_rotation = [
    jingles_picker(jingles),
    songs_picker(songs)
]

ads_rotation = [
    ads_picker(ads),
    ads_picker(ads),
    ads_picker(ads),
    ads_picker(ads),
    ads_picker(ads)
]

// Interruptions

prepare_toth = ({ currentRotation, queue, next }) => {
    if (next.belongsTo`category: jingles`)
        replace(queue, -1, toth)
    else
        playNext(queue, toth)
    currentRotation.index = 1
}

prepare_ads = ({ currentRotation, queue, next }) => {
    if (next.belongsTo`category: jingles`)
        replace(queue, -1, ad_starter, ads_rotation, ad_ender)
    else
        playNext(queue, ad_starter, ads_rotation, ad_ender)
    currentRotation.index = 0
}

when`
    seconds: 0
    minutes: 58`
(prepare_toth)

when`
    seconds: 0
    minutes: 13,43`
(prepare_ads)

// Generate playlist

run(music_rotation)