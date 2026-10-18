# Chart Studio

Studio creates guitar charts from recorded music entirely in the browser. The audio never leaves the
device. The implementation adds no runtime dependencies and remains part of the single HTML build.

## Authoring workflow

1. Choose **Chart Studio** from the library toolbar. Import MP3, WAV, OGG, or Opus audio supported by the
   browser (100 MB / 20 minutes maximum). **Cancel analysis** terminates the worker; an unsuccessful
   import leaves the previous project intact.
2. Audition the draft with **Hear chart notes**, then use **Hear beat grid** to check the estimated tempo
   and first beat. Half/double BPM controls handle common octave ambiguity. Add a tempo point at the
   playhead for a change in tempo. Grid corrections do not move existing notes.
3. Pick Easy, Medium, Hard, or Expert. In **Select / drag**, click gems or Shift-click several; drag to
   move time and lane. **Add notes** and **Erase notes** work with mouse or touch. The inspector edits
   seconds, sustain lengths, lanes and taps. Quarter/eighth/sixteenth/triplet snapping and free timing
   are available. **Previous/Next note** provides an alternative to canvas selection.
4. Set a passage to loop it, select its notes, or regenerate it. Locks protect notes from regeneration
   in that difficulty, including sustains extending beyond the protected boundary. Manual edits remain
   allowed inside a lock. Other difficulties are independent. Undo/redo covers notes, locks and timing.
5. **Playtest** uses the existing guitar engine and original recording. **Watch bot** previews the
   selected difficulty with automatic note playing. Pause → **Return to Chart Studio** or finishing
   either preview returns to the saved editor; neither enters score history. The library also offers
   **Edit chart** on saved studio songs.
6. **Export song ZIP** is both a playable song folder and a portable project. It contains `notes.chart`,
   `song.ini`, the unchanged recording, and `studio.json`. Extract it for Clone Hero/reclone hero, or
   choose **Open Studio ZIP** to restore a new editable copy with analysis, all difficulties and locks.
   ZIP imports currently accept unchanged, uncompressed Studio exports, not arbitrary chart archives.

Keyboard shortcuts outside text/select fields: Space previews, 1–5 adds a fret at the playhead, Delete
removes selected notes, Ctrl/Cmd+C/V copies/pastes at the playhead, Ctrl/Cmd+Z undoes, Shift+Z or Y redoes,
and Ctrl/Cmd+S saves. A selected passage can be shifted together through the inspector's time field.

Autosave uses a separate IndexedDB database, with serialized writes and visible failures. Exported
projects are not included in the existing settings/score backup. If storage is full/unavailable, export
before leaving; Studio never silently reports a failed write as saved. Playtesting requires a saved
project. Storage is scoped to the site/browser/device; clearing site data removes its local projects.

## Audio and chart generation

- Decode at 22,050 Hz. Analyze the louder channel rather than summing anti-phase stereo. Retain the
  original file for preview, gameplay and export.
- A 1,024-sample Hann-windowed FFT at roughly 10 ms hops produces log spectral flux. Adaptive thresholds,
  energy gating and 65 ms peak suppression distinguish attacks from silence, decays and note releases.
  Gain normalization keeps quiet masters consistent. The envelope also supplies the editor waveform.
- Autocorrelation estimates a global tempo, using a mild preference near 120 BPM to reduce half-time
  choices; phase coherence refines the estimate and first beat. Confidence is a heuristic, not a
  calibrated probability. Very short clips are explicitly low confidence. There is no automatic
  variable-tempo tracking or downbeat/time-signature inference; these remain author corrections.
- Rank attacks by strength and proximity to strong beats, then select nested difficulty timings.
  Minimum inter-attack gaps are 380/240/145/85 ms, with at most 3/4/6/9 attacks in any rolling second.
  Easy uses three frets, Medium four, Hard/Expert five. Spectral colour changes guide small fret moves;
  strong, sufficiently spaced Hard/Expert attacks can receive conservative two-fret accents.
- The generator deliberately does not claim pitch/instrument transcription. It does not guess sustain
  lengths from a full mix or automatically add drum/vocal parts or star-power phrases. Sustains/taps
  are authored in the editor. Generated sections are generic eight-bar passages for practice.
- Notes retain seconds as their authoritative position, which avoids stretching them to an incorrect
  beat estimate. Export converts through a 480-tick tempo map with a shared `song.ini` delay. It preserves
  note timing to tick resolution and bounds rounding at the start/end of the recording. Same-lane
  overlaps and duplicate gems are normalized. The existing parsers derive natural HOPOs and Touch parts.

The analyzer runs in an inline worker with progress and cancellation. A time-sliced fallback handles
blocked workers. The canvas only draws the visible passage; undo stores chart state, not decoded audio.
No model training or model-hosting infrastructure is involved.

## Verification (2026-10-17)

The unit suite covers controlled 72/120/150 BPM recordings (all attacks within 20 ms, no release
false positives), quiet/loud invariance, silence, difficulty spacing/burst limits, protected edits,
undo/redo, tempo-map round trips, edge rounding, sustain/tap playback, ZIP CRCs, and project restoration.

Actual recorded examples came from [librosa/data](https://github.com/librosa/data), revision
`38f4b06556fa0ff1acda5e677d8ba05d1bc0fff0`. Audio remains outside this repository. Full recordings were
decoded with FFmpeg and passed through the production analyzer, generator, `.chart` parser and judge.
All **24 charts** passed timing round trips (under 3 ms), spacing/burst checks and bot full combos.

| Recording | Seconds | Estimated BPM | Detected attacks | Easy / Medium / Hard / Expert attacks |
| --- | ---: | ---: | ---: | --- |
| Kevin MacLeod — Vibe Ace | 61.46 | 129.94 | 332 | 61 / 134 / 210 / 311 |
| Admiral Bob — Choice (drum/bass excerpt) | 25.03 | 136.06 | 120 | 25 / 54 / 90 / 109 |
| Karissa Hobbs — Let's Go Fishin' | 132.99 | 117.83 | 582 | 138 / 305 / 469 / 571 |
| Brahms / US Army Strings — Hungarian Dance No. 5 | 45.84 | 120.17 | 77 | 18 / 40 / 61 / 74 |
| Lena Orsa — Pistachio Ice Cream Ragtime | 70.77 | 144.01 | 265 | 63 / 140 / 214 / 260 |
| Mihai Sorohan — solo trumpet loop | 5.33 | 123.12 | 12 | 4 / 7 / 10 / 11 |

Analysis plus all four chart generations took roughly 25–510 ms per example on this cloud CPU, excluding
decode. These are measurements, not browser performance guarantees or evidence of human-rated chart fun.

An independent librosa 1.0.0 beat tracker estimated 64.60, 136.00, 117.45, 152.00, 143.55 and 184.57 BPM,
respectively. The first is a half/double interpretation; the two orchestral/short-clip disagreements
illustrate why BPM must remain editable. The trumpet source is explicitly a **90 BPM** loop, so Studio's
123.12 BPM estimate is incorrect (librosa also chooses an approximately double-time interpretation).
Its detected attacks still preserve the recording's times. This is a known limitation, not an automated
tempo-accuracy claim. Variable-tempo classical music and short/syncopated clips need manual grid work.

As another diagnostic, matching Studio onsets against librosa's onset detector within 50 ms covered
93–100% of the reference events on the jazz, drum/bass, vocal and ragtime examples; orchestral coverage
was 76%. The detectors disagree on which soft/legato events count, and the reference is not ground truth.
Controlled fixtures provide the timing ground truth; human musical-quality review remains subjective.

Real-Chromium integration verified OGG import, invalid-file recovery, four difficulties, edits,
undo/redo, locked regeneration, tempo changes, click preview, ZIP export/re-import, reload persistence,
320/390 px layouts, gameplay return, and library editing. A separate context verified the workerless
fallback. The production HTML served locally also imported recorded music transcoded to MP3, WAV and
Opus, and recovered from an injected storage quota failure without losing edits. This environment's
browser policy blocks `file://` navigation, so direct-from-disk operation was not reverified here.

### Reproduce

```bash
npm test
npm run build
git clone https://github.com/librosa/data /tmp/studio-music-data
git -C /tmp/studio-music-data checkout 38f4b06556fa0ff1acda5e677d8ba05d1bc0fff0
MUSIC_DIR=/tmp/studio-music-data/audio node tests/tools/studio-music-audit.mjs

# In another terminal: npm run dev
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/path/to/chromium \
  MUSIC_DIR=/tmp/studio-music-data/audio node tests/tools/studio-browser-audit.mjs

# In another terminal: npm run preview -- --port 5231
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/path/to/chromium \
  MUSIC_DIR=/tmp/studio-music-data/audio node tests/tools/studio-built-audit.mjs
```

FFmpeg and Playwright/Chromium are optional external audit tools; normal tests/builds need neither.
The music audit writes hashes, measurements and onset timestamps to `/tmp/studio-music-audit`, and the
browser audit writes screenshots and a song ZIP to `/tmp/studio-audit` (override `AUDIT_OUTPUT`).

### Recording credits

Source links and complete attribution accompany each file in the external dataset:

- [Vibe Ace](https://freemusicarchive.org/music/Kevin_MacLeod/Jazz_Sampler/Vibe_Ace), Kevin MacLeod — CC BY 3.0.
- [Choice](http://dig.ccmixter.org/files/admiralbob77/61638), Admiral Bob featuring Snowflake; drum/bass
  excerpt prepared by Brian McFee — CC BY-NC 3.0.
- [Let's Go Fishin'](https://freemusicarchive.org/music/Karissa_Hobbs/Age_of_Flowers/09_Lets_Go_Fishin), Karissa Hobbs — CC BY 3.0.
- [Hungarian Dance No. 5](https://musopen.org/music/43805-hungarian-dance-no-5-in-f-sharp-minor-woo-1-string-orchestra-arr/), Brahms / US Army Strings — public domain.
- [Pistachio Ice Cream Ragtime](https://freesound.org/people/lena_orsa/sounds/442789/), The Piano Lady (Lena Orsa) — CC BY-NC 3.0.
- [Jazz trumpet loop](https://freesound.org/s/77711/), Mihai Sorohan — CC BY 3.0.
