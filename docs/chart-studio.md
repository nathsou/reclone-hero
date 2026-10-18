# Chart Studio

Studio creates guitar charts from recorded music entirely in the browser. The audio never leaves the
device. The metadata reader is bundled into the single HTML build; it requires no network service.

## Authoring workflow

1. Choose **Chart Studio** from the library toolbar. Drop a song or Studio ZIP into the workspace, or
   use **Choose song file** / the **Project** menu. MP3, WAV, OGG, Opus, and M4A are supported (100 MB / 20
   minutes maximum). **Cancel analysis** terminates the worker; an unsuccessful import leaves the previous
   project intact. The Project menu also holds saved projects, song metadata, manual save and deletion.
2. Audition the draft with **Hear chart notes**, then use **Hear beat grid** to check the estimated tempo
   and first beat. Half/double BPM controls handle common octave ambiguity. Add a tempo point at the
   playhead for a change in tempo. Grid corrections do not move existing notes.
3. Pick Easy, Medium, Hard, or Expert. In **Select**, click gems or Shift-click several; drag to
   move time and lane. **Add notes** and **Erase notes** work with mouse or touch. The inspector edits
   seconds, sustain lengths, lanes and taps. Quarter/eighth/sixteenth/triplet snapping and free timing
   are available. The **Notes** inspector stays beside the timeline on desktop, with separate **Grid**
   and **Passage** tabs; phones stack the inspector below the editor. **Previous/Next note** provides an
   alternative to canvas selection. Use the compact play/pause, speed and click controls to listen.
4. In **Passage**, set a range to loop, select its notes, or regenerate it. Locks protect notes from regeneration
   in that difficulty, including sustains extending beyond the protected boundary. Manual edits remain
   allowed inside a lock. Other difficulties are independent. Undo/redo covers notes, locks and timing.
5. **Playtest** uses the existing guitar engine and the original recording or saved separated tracks. **Watch bot** previews the
   selected difficulty with automatic note playing. Pause → **Return to Chart Studio** or finishing
   either preview returns to the same editing position, zoom, inspector tab, selection and undo history;
   neither enters score history. The library also offers
   **Edit chart** on saved studio songs.
6. **Export song ZIP** is both a playable song folder and a portable project. It contains `notes.chart`,
   `song.ini`, the unchanged recording, and `studio.json`. If separated, it also includes guitar and
   backing tracks; the original is named `original.*` to avoid playing the mix twice. Extract it for Clone Hero/reclone hero, or
   choose **Open Studio ZIP** to restore a new editable copy with analysis, all difficulties and locks.
   ZIP imports currently accept unchanged, uncompressed Studio exports, not arbitrary chart archives.

Keyboard shortcuts outside text/select fields: Space previews, 1–5 adds a fret at the playhead, Delete
removes selected notes, Ctrl/Cmd+C/V copies/pastes at the playhead, Ctrl/Cmd+Z undoes, Shift+Z or Y redoes,
and Ctrl/Cmd+S saves. Left/right arrows nudge selected notes (or seek when nothing is selected), and
plus/minus zoom around the playhead. Shift+wheel or the view arrows pan without seeking; **Follow
playhead** restores automatic following. The whole-song slider seeks beyond the visible passage. A
selected passage can be shifted together through the inspector's time field. **?** shows the shortcuts.

Autosave uses a separate IndexedDB database, with serialized writes and visible failures. Exported
projects are not included in the existing settings/score backup. If storage is full/unavailable, export
before leaving; Studio never silently reports a failed write as saved. Playtesting requires a saved
project. Storage is scoped to the site/browser/device; clearing site data removes its local projects.

M4A imports use the browser's native decoder. AAC is widely supported; Apple Lossless (ALAC) support
depends on the browser and operating system. Protected recordings cannot be imported. If decoding
fails, Studio offers conversion guidance and retains the previous project. Original M4A bytes are
preserved in saves and ZIPs. Other chart players may require conversion to MP3/WAV/OGG; separated
projects already include portable OGG guitar/backing tracks.

## Artwork and lyrics

Song import reads embedded title, artist, album, front-cover artwork and lyrics locally with
[`music-metadata`](https://github.com/Borewit/music-metadata) (MIT). MP4/M4A tags, MP3 ID3, OGG/Opus
Vorbis comments, and WAV INFO/ID3 are supported when present. Tag failures are nonfatal: audio and chart
generation remain usable, with a notice if metadata could not be read. Front-cover pictures are preferred
over other embedded images. PNG, JPEG and WebP covers are limited to 5 MB and checked before display.
Use **Song** (or Project → **Artwork & lyrics**) to replace/remove the cover and edit the album name.

The Song inspector also imports UTF-8 `.lrc` / `.txt` files (up to 128 KB) and edits lyrics directly.
Select a lyric line, seek to its start, then choose **Time line at playhead** to add an LRC timestamp.
Lyrics edits autosave as you type. LRC supports repeated timestamps, milliseconds, empty lines that
clear the display, and a global offset (positive values advance the lyrics). Synchronized ID3 lyrics
with millisecond timestamps are imported as LRC. Word timestamps in enhanced LRC are displayed at
line precision. Plain lyrics remain editable/exportable; timing is added by the author.

Timed lines preview in Song while seeking/listening and become standard lyric/phrase events in
`notes.chart` for bot previews, playtests and other chart players. The game's existing Lyrics setting
controls its HUD. Lyric times remain in recording seconds when the beat grid changes. The library and
game use the cover automatically. Changing notes or separated tracks preserves artwork and lyrics.

Saves retain artwork separately from chart undo history. ZIPs include `album.png` / `album.jpg` /
`album.webp`, `lyrics.lrc` or `lyrics.txt`, and editable metadata in `studio.json`; original audio bytes
are unchanged. Previous Studio projects without these optional fields still open. Full dependency
notices are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and embedded in the production HTML.

## Optional instrument audio

The **Audio** inspector can connect to an [optional local helper](../tools/stem-helper/README.md), using
a pairing code and exact page origin. Demucs `htdemucs_6s` estimates guitar; the helper computes backing
as the original minus that estimate, applies one shared headroom gain, and encodes aligned Vorbis tracks.
The audio/model inference stays on the user's computer. Python/ffmpeg and a first-use model download
are optional; normal chart generation stays entirely in the browser.

Progress and cancellation live in the Audio inspector. **Audition tracks** changes the studio preview
between original, guitar, and backing without changing the timeline or notes. Separate audio is stored
outside chart undo history, survives ordinary edits/autosaves and bot/playtest returns, and travels in
Studio ZIPs. **Use original mix** removes the estimates. A failed/cancelled job retains existing audio.
The original recording remains available for export and analysis. The virtual song source exposes only
`guitar.ogg` and backing `song.ogg` after separation, so the existing audio engine mutes the player part
on misses and library warnings reflect the presence of a guitar stem.

Validation for this addition: TypeScript tests cover separated ZIP round trips and incomplete metadata;
Python tests cover Host/Origin/token checks, upload limits, single-job ownership, worker cancellation,
output retrieval and cleanup. A live browser-to-helper audit also checks CORS, pairing, real ffmpeg
decode rejection and retry/cleanup without requiring weights. With helper dependencies installed, a deterministic model substitute
exercises the actual Torch overlap-add/residual path, stereo sample alignment, shared headroom and
ffmpeg/Vorbis reconstruction for short and multi-segment recordings. The browser audit imports an
excerpt of **Let's Go Fishin'**, uses deterministic helper audio fixtures, and checks audition, storage,
ZIPs, player-only muting, bot preview, cancellation/error retention, original restore, and phone layouts.

**Validation limitation:** the development workspace blocks `dl.fbaipublicfiles.com`, the official model
host (HTTP 403). Pretrained guitar separation and its isolation quality on recorded music have **not**
been verified here. The deterministic tests establish the integration and audio mechanics, not model
quality. To perform that remaining check on a machine with model access:

```sh
# Activate the helper venv first; MUSIC_DIR points at the external dataset credited below.
python tests/tools/stem-music-audit.py --music-dir /tmp/studio-music-data/audio
# Inspect the generated report and listen to guitar/backing outputs in /tmp/stem-music-audit.
# Start the helper with --origin http://127.0.0.1:5230, then use its pairing code:
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/path/to/chromium \
  MUSIC_DIR=/tmp/studio-music-data/audio STEM_HELPER_CODE='<pairing code>' \
  node tests/tools/studio-stems-audit.mjs
```

The model audit uses acoustic guitar/vocals, a jazz ensemble, and a trumpet-only control. It verifies
sample counts, finite audio and reconstruction SNR, and saves outputs for listening. Without isolated
reference stems, those metrics cannot prove guitar isolation. Leakage remains an expected model limit.

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

M4A verification (2026-10-18) used an AAC conversion of **Vibe Ace** through the full browser audit,
including edits, preview, ZIP restoration, browser persistence, playtest and bot preview. The production
HTML audit also imports AAC M4A. Chromium 154.0.8037.57 in this environment rejects ALAC; the audit
checks that ALAC and corrupt M4A inputs show conversion guidance without losing the current project.
The helper's DSP test decodes both AAC and ALAC M4A bytes with the production FFmpeg allowlist and a
deterministic model substitute, checking stereo alignment and reconstruction. A separate browser audit
uses an AAC M4A excerpt of **Let's Go Fishin'** with deterministic helper tracks to verify unchanged
upload bytes, audition, persistence/ZIPs, bot preview and original restoration. These codec/integration
checks do not validate pretrained separation quality; the model-download limitation above still applies.

Artwork/lyrics verification uses a 16-second **Let's Go Fishin'** excerpt in all five formats, with
synthetic cover art and fixture lyrics in actual MP4, ID3 and Vorbis tags. The browser audit checks
native decoding, imported fields and cover pixels, timed preview, saved-source artwork, ZIP round trips,
manual replacement/rejection, plain text import, manual line timing, phone layouts, the bot lyric HUD,
return and reload persistence. The same tagged M4A imports in the production single-file HTML, with
its embedded dependency notices and timed bot HUD. Unit tests cover LRC edge cases, timing through
tempo changes, safe image types, metadata limits, corrupt tags, cancellation and eight-file stem ZIPs.

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

# Native M4A workflow (Vite running on the browser audit's default port 5230):
ffmpeg -v error -y -i /tmp/studio-music-data/audio/Kevin_MacLeod_-_Vibe_Ace.ogg \
  -vn -c:a aac -b:a 192k /tmp/vibe-aac.m4a
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/path/to/chromium \
  MUSIC_DIR=/tmp/studio-music-data/audio AUDIT_AUDIO=/tmp/vibe-aac.m4a \
  node tests/tools/studio-browser-audit.mjs
# Optional: set AUDIT_REJECTED_AUDIO to an ALAC M4A on a browser without ALAC support.
# The stems audit accepts AUDIT_AUDIO too; supply a 16-second recording for its fixtures.

# Embedded metadata across M4A/MP3/OGG/Opus/WAV, plus the production build:
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/path/to/chromium \
  MUSIC_DIR=/tmp/studio-music-data/audio PRODUCTION_URL=http://127.0.0.1:5231 \
  node tests/tools/studio-media-audit.mjs
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
