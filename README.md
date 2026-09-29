# reclone hero

**Play it:** https://nathsou.github.io/reclone-hero/

A Clone Hero–compatible rhythm game that runs in the browser. It reads your existing song folders
(`notes.chart` / `notes.mid` + `song.ini` + audio stems), plays them on a WebGL2 highway, and is built with
nothing but TypeScript 7 and Vite: no runtime dependencies. No songs and no guitar? It comes with 23
built-in songs and plays on the keyboard.

## Running it

```bash
npm install
npm run dev
```

Open the printed URL in a Chromium-based browser (Chrome, Edge, Arc, Brave).

- **Built-in songs:** on a first visit the song list opens straight away with the 43 songs that ship with
  the game (see [Built-in songs](#built-in-songs)).
- **Your library:** click the folder button (or **Open charts folder…**) and pick the folder that holds your songs. The browser
  remembers it, so next time you only confirm access. Songs are read straight from disk; nothing is uploaded.
- **Dev shortcut:** the dev server also serves a folder directly (default `/Volumes/S/charts`, override with
  `CHARTS_DIR=/path/to/songs npm run dev`), so the song list appears without a picker.

### Without any server

`npm run build` produces a single self-contained file, `dist/index.html` (about 570 KB, all scripts, fonts,
styles and the built-in songs inlined). Double-click it to play from disk (`file://`), or put it on any static host (GitHub Pages,
Netlify, a USB stick). Pushing to `main` deploys it to GitHub Pages (`.github/workflows/pages.yml`). Nothing runs server-side: songs are read in the browser.

- **Chrome / Edge / Brave / Arc:** uses the File System Access API; the folder is remembered between visits.
- **Firefox / Safari:** falls back to a directory `<input>` (the File API); works the same, but you pick the
  folder again each visit.

## Guitar setup

Plug in the guitar (e.g. a Santroller/V3 Wii-USB adapter) and press any fret: browsers only reveal
controllers after a button press. Then open **Settings › Controls › Set up** and press each input when asked
(frets, strum up/down, select, tilt, start, whammy). The wizard handles buttons, D-pad/hat strums and analog
tilt/whammy axes, and the mapping is saved per device.

## Playing on the keyboard

`A S D F G` (or `1`–`5`) are the frets and, by default, **pressing a fret key plays the note**: no separate
strum key is needed, and keys pressed together within 40 ms count as one chord. Hold keys through sustains.
Turn **Settings › Controls › Fret keys strum** off to strum with `↑`/`↓`/`Enter` instead, like a guitar.
`Space` is Star Power, `W` whammy, `Esc` pause (the pause menu can also switch difficulty). While you play on the keyboard, the key for each fret is shown
under it. All keys can be remapped in Settings › Controls. Easy (three frets) and Medium (four) are good places
to start.
The whole menu works from the guitar or the keyboard: strum or arrows move, green or `Enter` confirms, red or
`Esc` goes back, yellow opens practice, blue/orange (or `←`/`→`) change difficulty and adjust settings. In the
song list the guitar's select button (or `Space`) opens the song options: play, practise or watch the bot,
favourite, instrument and difficulty, sort, filters, view, search and settings. `*` stars a song.
On the results screen `Enter` returns to the song list, `R` retries and `P` practises the weakest section.

## What's in it

- **Charts:** `.chart` and `.mid` for guitar, bass, rhythm, keys and guitar co-op on all four difficulties:
  chords, sustains (including extended sustains), natural and forced HOPOs, tap notes, open notes, star power
  phrases, solos, sections, tempo and time-signature changes, and `song.ini` options (`hopo_frequency`,
  `eighthnote_hopo`, `sustain_cutoff_threshold`, `multiplier_note`, `delay`).
- **Gameplay:** Clone Hero–style rules. ±90 ms window (adjustable), strum leniency, anchoring, HOPO/tap hammer-ons and
  pull-offs, overstrums, sustain drops, 1–4× multiplier, star power (tilt or select, whammy fills the bar),
  solo bonuses, stars and best scores.
- **Audio:** stems are decoded and the non-player parts are pre-mixed, so playback is sample-accurate. A
  smoothed audio clock drives both judgement and rendering, and input is judged at the device's own
  timestamp, not the frame's.
- **Practice:** loop any range of sections at 40–100% speed. Audio is time-stretched without changing pitch
  (WSOLA), and each loop reports its accuracy.
- **Calibration:** tap along to clicks (audio offset) and flashes (video offset).
- **Song list** (scroll with the mouse wheel; in the cover view the wheel or a trackpad swipe moves through
  the covers) grouped the way Clone Hero does it (by artist, title letter, difficulty, length, year,
  genre, charter, folder, most played or recently played), ascending or descending, with a sticky group
  header, `PgUp`/`PgDn` to jump between groups, `R` for a random song and `/` to search. `V` switches
  between the list (with the song's details beside it) and a cover-flow view with an A–Z scrubber.
- **Favourites:** star songs (`*`, the ☆ button or the song options) and show only your favourites.
  Favourites are kept in backups.
- **Genre filter:** show only, or hide, whole genre families (hiding *Metal* also hides metalcore, djent,
  deathcore…) or exact genres.
- **Themes:** Classic dark (the default: a textured board, steel rails, domed gems and wheel frets) and
  Daylight ink (a paper highway with inked outlines). "Match system" switches between the two. The earlier
  colour schemes (Swiss, Baroque, Synthwave, Terminal, Paper, Midnight) are still there under Settings › Display.
- **Note styles**, independent of the theme: Classic dome (the default), Studio (glass lenses in chrome
  bezels on a lacquered board, with ray-traced reflections), Crystal (glass beads, tubes and a flowing glass
  highway that refract what is behind them; see [Graphics](#graphics)), Neon (glowing pucks), Baroque (faceted
  jewels in gold, pearls for HOPOs) and Pixel (8-bit blocks). Each keeps the same strum / HOPO / tap language and has its own sustains, fret buttons and
  hit particles.
- **Backups:** Settings › Data exports settings, key and controller mappings, favourites and best scores to a
  file, to import on another computer (scores merge, keeping the best; favourites are combined).
- **Controls:** remap any single guitar input (Settings › Controls › Change) without redoing the rest.
- **Video backgrounds**, album-art backgrounds, fullscreen (`Shift+F`, `Esc` to leave), lefty flip, quality levels.

## Built-in songs

Forty-three songs ship inside the game, so there is always something to play. They are not recordings: each is a
score written in TypeScript (`src/starter/songs`), synthesized in the browser when you pick it (a Web Worker
renders the stems in 2–6 s) and charted from the same score, so notes and audio cannot drift apart. They add
about 390 KB to the build, need no download, and carry no licensing strings.

| Song | Credit | Style | Expert |
| --- | --- | --- | --- |
| Ode to Joy | Beethoven, Symphony No. 9 (1824) | pop-punk, key change | gentle, quarter notes |
| Midnight Drive | original | synthwave, 100 BPM | held chords, arpeggios |
| Ignition | original | rock, 140 BPM | palm-muted riffs, a solo |
| Neon Skyline | original | electro house, 126 BPM | long hammer-on arpeggios |
| Für Elise | Beethoven, WoO 59 (1810) | electro in 3/8 | sixteenth-note melody |
| Canon in D | Pachelbel (c. 1700) | rock | busier each variation, shred section |
| In the Hall of the Mountain King | Grieg, Peer Gynt (1875) | metal, 100 → 185 BPM | speeds up all the way |
| Redline | original | punk-metal, 176 BPM | gallops, fills, twin leads |
| Minuet in G | Petzold (1725) | chiptune waltz | gentle, quarter and eighth notes |
| Morning Mood | Grieg, Peer Gynt (1875) | chill 6/8 | gentle eighth notes |
| Swan Lake | Tchaikovsky (1876) | dark synthwave | long held notes, harp arpeggios |
| The Blue Danube | Strauss II (1866) | electro waltz in 3/4 | waltz melody, arpeggios |
| Funeral March | Chopin, Sonata No. 2 (1839) | doom metal | heavy chords, a clean trio |
| The Entertainer | Joplin (1902) | electro swing | syncopated rag |
| Eine kleine Nachtmusik | Mozart (1787) | electro house | Alberti arpeggios, big hook |
| Prelude in C | Bach, WTC I (1722) | synthwave | 35 bars of hammer-on arpeggios |
| Symphony No. 40 | Mozart (1788) | drum & bass, 174 BPM | fast sighing theme |
| Carol of the Bells | Leontovych (1916) | metal waltz | the ostinato, then everything on top |
| Symphony No. 5 | Beethoven (1808) | metal | the motif everywhere, a development solo |
| Toccata and Fugue in D minor | Bach (c. 1704) | organ metal | pedal-point flurries, a sweep solo |
| William Tell Overture | Rossini (1829) | gallop punk | sixteenth-sixteenth-eighth, all the way |
| Ride of the Valkyries | Wagner (1856) | symphonic metal in 9/8 | triplet chugs, the horn call |
| Moonlight Sonata | Beethoven (1801) | Adagio, then Presto as metal | storms of rising arpeggios |
| Spring | Vivaldi, The Four Seasons (1725) | played straight: solo violin and strings | birdsong trills, the storm |
| Little Fugue in G minor | Bach, BWV 578 (c. 1707) | played straight on organ, two voices | a fugue subject in sixteenths |
| Pomp and Circumstance | Elgar, March No. 1 (1901) | played straight: strings, then brass and timpani | stately, in harmony |
| Can-Can | Offenbach (1858) | played straight: pit orchestra galop | fast, twice round, faster |
| Gymnopédie No. 1 | Satie (1888) | played straight on piano | slow melody and left-hand chords |
| Caprice No. 24 | Paganini (1817) | neoclassical metal | the theme, then triplet sweeps |
| Korobeiniki | Russian folk song (1861) | chiptune into metal | three levels, each faster |
| Drunken Sailor | sea shanty | shanty punk with accordion and fiddle | chugs, a fiddle break, double stops |
| Greensleeves | English ballad (16th c.) | Renaissance consort: lute, fiddle, viols | melody, then in thirds |
| The Irish Washerwoman | Irish jig | session into Celtic rock, 6/8 | fiddle, banjo, then electric |
| Hava Nagila | Hebrew folk song (1918) | slow hora into surf rock | faster each time, in thirds |
| When the Saints Go Marching In | spiritual | New Orleans brass band | a dirge, then a swinging banjo chorus |
| Glass Elevator | original | funk, 104 BPM | scratchy sixteenth-note chords, a unison riff |
| Pocket Change | original | ska punk, 184 BPM | off-beat upstrokes, power chords, horns |
| Switchback Breakdown | original | bluegrass, no drums | banjo rolls, a flatpicked guitar break |
| Rust Belt Shuffle | original | 12-bar blues in 12/8 | a boogie riff, two choruses of bends |
| Low Orbit | original | post-rock | clean arpeggios, then tremolo picking |
| Seventh Gear | original | progressive metal in 7/8 | 2+2+3 riffs, a clean interlude, a solo |
| Afterglow Protocol | original | trance, 138 BPM | plucked arpeggios, a supersaw drop |
| Sunday Tape | original | lo-fi neo-soul, swung | chord stabs, fills, double stops |

The classical and traditional pieces are public-domain compositions. Some are played straight, as written
(Spring, the Little Fugue, Pomp and Circumstance, the Can-Can, the Gymnopédie); the others are new
arrangements (melodies as written, with new bass lines, drums and some new passages). The originals were
written for the game. Many of the older melodies are quoted note for note from public ABC transcriptions,
read by a small ABC reader (`src/starter/abc.ts`, checked bar by bar by a test): thesession.org (Korobeiniki,
Drunken Sailor, The Irish Washerwoman), John Chambers' collection at trillian.mit.edu (Hava Nagila, the
Can-Can, Pomp and Circumstance; Frank Nordberg's Spring, Jeff Bigler's two-voice Little Fugue, and the Paganini
caprice from Lester Bailey's collection), Chris Spencer's abc-music (Greensleeves) and Colin Hume
(Gymnopédie No. 1). Instruments are synthesized from scratch: Karplus–Strong strings through an amp and cabinet
model for guitars, bass and banjo, band-limited supersaws, pulse, brass, reed and bowed-string oscillators
(chiptune, horns, accordion, fiddle), FM electric piano and bells, additive organ, tuned timpani and a
synthesized drum kit, mixed with a Freeverb reverb, tempo-synced echo and a limiter shared by both stems.

Charts are generated for all four difficulties. Expert plays every note of the guitar part. Lower difficulties
keep the metrically strongest notes within a note budget (about 40 / 60 / 80 % of Expert), a minimum spacing and
a density cap, drop to three frets on Easy and four on Medium, and simplify chords. Frets are chosen by a
second-order Viterbi search that follows the melody's contour (higher pitch, further right; bigger leaps,
bigger moves; repeated notes stay put) and saves hand-position resets for rests. Star power phrases, solos and
sections are placed too. Hide the built-in songs under Settings › Data › Built-in songs.

`node tests/tools/starter-dev.ts <song-id> <out-dir>` renders a song to WAV, prints per-instrument levels and
writes its `.chart`; add `--chart expert --bars 8-12` for a text view of the notes.

## Feedback when you make a mistake

| Mistake | You hear | You see |
| --- | --- | --- |
| Note not played | Your instrument's stem mutes until your next hit (songs without a separate stem get a brief muffle of the whole mix) | The gem turns grey and keeps sliding past the strike line; a light red pulse |
| Wrong fret | A muted string clank | The frets you held wrongly shake with a red outline, the frets you needed light up, red edge pulse, desaturation |
| Overstrum | Clank | Held frets flash red, red edge pulse |
| Sustain released early | Stem mutes | The rest of the tail turns grey |
| Streak of 25+ lost | Heavier "thud" clank | The streak number shatters, **STREAK LOST** toast |
| Star power phrase broken | — | The phrase's gems lose their silver star colour |

Every hit also adds an early/late tick to the timing bar under the strike line. The results screen
breaks down wrong frets vs. unplayed notes vs. overstrums, misses per fret colour and note type
(strum/HOPO/tap/chord/open), a timing histogram with offset advice, and per-section accuracy. Click a section
to practise it.

## Graphics

Raw WebGL2, no engine. There is one instanced draw call per kind of object (gems, open notes, sustains,
beat lines, fret buttons, particles), so the CPU only uploads the handful of notes on screen each frame. The
scene renders to an HDR (half-float), multisampled target, then goes through a bloom chain and an ACES tonemap.
The look is neon-on-dark, emissive shapes carry most of the meaning, and a miss reads as missing light.

The **Studio** note style is lit like a product shot: a procedural studio environment (a large softbox over
the far end of the highway, strip lights at the sides, a warm kicker behind the player) with Fresnel
reflections on glass lenses, polished and anodised metal, and clear-coated bodies. Reflections are ray-traced in
the fragment shaders: each frame the 32 nearest gems are uploaded as spheres, reflection rays from gems and fret
buttons are traced against them and against the highway plane, and the highway itself becomes lacquer that
traces the mirror images of the approaching gems and darkens under them with soft contact shadows.

**Crystal** refracts for real, in screen space: the frame is copied just before the highway is drawn and
again just before the gems, and each glass surface samples the copy of what is behind it, offset by its
surface normal. The three colour channels are offset by slightly different amounts, so edges split into
rainbow fringes (dispersion). The highway is a glass slab with slow swells that travel with the chart, lens-like
bevelled edges and a light frost; the beads magnify the lane lines under them, reflect the room and each other,
glow at the rim and cast coloured caustics on the glass below; sustains are clear tubes and the fret buttons
are glass rings that fill with colour.

`visual-test.html` (dev server only) shows every gem and sustain state in a frozen scene for tuning.

## Performance

The frame loop is built to avoid garbage-collection stutter:
- Render state, HUD state, matrices, uniform arrays, particles, input events, judgement events and
  sustain records are all preallocated or pooled.
- The HUD only touches the DOM when a displayed value changes, and restarts CSS animations without
  forcing layout.
- The canvas size comes from a `ResizeObserver` rather than per-frame layout reads.
- Charts are stored as flat typed arrays (about 30 bytes per note, no object per note). Tracks are
  built only when played: until then a chart keeps packed raw gems (the densest chart in the test library
  costs 84 KB while browsing; the largest, 46,748 notes over four instruments, 0.6 MB). The song list
  caches the last 6 parsed charts.
- Audio is the real memory cost (≈ 92 MB per 4-minute stereo track, as Web Audio stores decoded
  float PCM), so stems are mixed into at most two buffers per song: your part and everything else,
  crowd included.
- Every shader pipeline is warmed up during loading, and video backgrounds update their texture in place.

`npm run bench` runs the real game loop (engine, renderer, HUD, audio clock) against mock WebGL/DOM/audio in
Node and reports JS time and heap garbage per frame on the densest chart. With `--profile` it attributes
allocations to source lines. **Settings › Video › Show FPS** displays fps, CPU time and the worst frame of the
last half second in-game.

## Development

```bash
npm test          # parser + engine tests; also parses every chart in CHARTS_DIR and has a bot full-combo each one
npm run typecheck
```

Layout: `src/chart` (parsers → normalised chart), `src/engine` (pure judge + autoplay bot), `src/audio`
(mixer, clock, synthesized SFX, time-stretch), `src/input`, `src/render` (WebGL2), `src/game` (game loop that
wires it together), `src/ui` (screens).
