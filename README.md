# reclone hero

**Play it:** https://nathsou.github.io/reclone-hero/

A Clone Hero–compatible rhythm game that runs in the browser. It reads your existing song folders
(`notes.chart` / `notes.mid` + `song.ini` + audio stems), plays them on a WebGL2 highway, and is built with
nothing but TypeScript 7 and Vite: no runtime dependencies.

## Running it

```bash
npm install
npm run dev
```

Open the printed URL in a Chromium-based browser (Chrome, Edge, Arc, Brave).

- **Your library:** click **Open charts folder…** and pick the folder that holds your songs. The browser
  remembers it, so next time you only confirm access. Songs are read straight from disk; nothing is uploaded.
- **Dev shortcut:** the dev server also serves a folder directly (default `/Volumes/S/charts`, override with
  `CHARTS_DIR=/path/to/songs npm run dev`), so the song list appears without a picker.

### Without any server

`npm run build` produces a single self-contained file, `dist/index.html` (about 170 KB, all scripts and
styles inlined). Double-click it to play from disk (`file://`), or put it on any static host (GitHub Pages,
Netlify, a USB stick). Pushing to `main` deploys it to GitHub Pages (`.github/workflows/pages.yml`). Nothing runs server-side: songs are read in the browser.

- **Chrome / Edge / Brave / Arc:** uses the File System Access API; the folder is remembered between visits.
- **Firefox / Safari:** falls back to a directory `<input>` (the File API); works the same, but you pick the
  folder again each visit.

## Guitar setup

Plug in the guitar (e.g. a Santroller/V3 Wii-USB adapter) and press any fret: browsers only reveal
controllers after a button press. Then open **Settings › Controls › Set up** and press each input when asked
(frets, strum up/down, select, tilt, start, whammy). The wizard handles buttons, D-pad/hat strums and analog
tilt/whammy axes, and the mapping is saved per device.

Keyboard: `A S D F G` (or `1`–`5`) frets, `↑`/`↓`/`Enter` strum, `Space` Star Power, `W` whammy, `Esc` pause.
In menus, strum moves, green confirms, red goes back, yellow opens practice, blue/orange change difficulty.

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
- **Video backgrounds**, album-art backgrounds, light / dark / system theme, fullscreen (`F`), lefty flip,
  quality levels.

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

`visual-test.html` (dev server only) shows every gem and sustain state in a frozen scene for tuning.

## Performance

The frame loop is built to avoid garbage-collection stutter:
- Render state, HUD state, matrices, uniform arrays, particles, input events, judgement events and
  sustain records are all preallocated or pooled.
- The HUD only touches the DOM when a displayed value changes, and restarts CSS animations without
  forcing layout.
- The canvas size comes from a `ResizeObserver` rather than per-frame layout reads.
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
