# Performance audit — 29 September 2026

The measured frame-loop JavaScript cost is small. The most useful changes in this PR are a lighter
initial graphics preset and moving touch layout before GPU warm-up. A Rust/WASM rewrite of the game
loop is not justified by these measurements. Offline audio synthesis is a more plausible future
WASM target if mobile loading time becomes a bottleneck.

## Measurements and limits

Measurements were taken on the local macOS development machine using Node 24.3.0 and Chrome
154.0.8037.58. They are observations, not budgets or claims about every phone.

The existing `npm run bench` exercises the actual engine, renderer, input, audio clock and HUD on
Madness March Kamikaze 2 (3,563 Expert notes). It uses mock WebGL/DOM/audio and measures JS only:

| Case | Before p50 / p99 / max | After p50 / p99 / max | Heap allocation before → after |
| --- | --- | --- | --- |
| Perfect bot | 0.008 / 0.042 / 0.090 ms | 0.008 / 0.034 / 0.066 ms | 2,164 → 2,148 B/frame |
| Sloppy bot | 0.005 / 0.013 / 0.041 ms | 0.005 / 0.010 / 0.047 ms | 1,188 → 1,192 B/frame |

These small differences are run-to-run noise: the PR does not claim a frame-loop CPU speedup.
Mock results exclude GPU work, browser painting/layout and real audio decoding. They cannot establish
mobile FPS or the absence of all stutter. Allocation sampling (`npm run bench -- --profile`) puts hit
bursts, frame bookkeeping and HUD updates at the top, but the total remains about 140–250 KB/s.

Real Chrome tests check the actual WebGL renderer and phone layout. Replaying the old startup order
(warm-up before enabling touch pads) reproduces GPU target reallocation after warm-up. Preparing the
pads, waiting for layout/ResizeObserver, and then warming removes that allocation in the first frames.
The audio clock starts after this work. This addresses one concrete source of first-note hitches;
it does not imply every device/driver cause has been eliminated.

Graphics cost is much more sensitive to quality than the measured JS cost. At DPR 2, High caps the
render scale at 2 and Medium at 1.25: `(1.25 / 2)² = 0.390625`, or 60.9% fewer scene pixels. MSAA also
falls from up to four samples to two. The nominal multisample color/depth storage is therefore 80.5%
smaller at DPR 2, before driver overhead. These are pixel/storage calculations, not measured GPU
speedups; at DPR 1 the resolution benefit disappears. Crystal reflections, frame copies and
bloom still require GPU work that WASM would not remove.

## Audio loading and existing mix improvements

`node tests/bench/starter.bench.ts` measures a 12-second preview at the shipped 44.1 kHz rate, including
up to three seconds of preroll and per-sample level analysis. The ten new tracks rendered in
236–465 ms (25.8–50.9× realtime). Spring took 620 ms for the same excerpt. Whole songs take longer;
these numbers do not measure decoding, worker transfer, browser resampling or storage.

A CPU profile of three repeated 30-second renders of Ignition, Afterglow Protocol and Spring identifies
supersaw/string note generation as the largest sampled cost (about 41% of samples), followed by
reverb processing (about 17%). Drum-kit creation is about 1%. Full synthesis already runs in a worker
with transferable WAV buffers. Increasing worker count would add memory pressure; this PR keeps the
existing single-worker queue.

The mix audit also found actionable musical issues. In the same 22.05 kHz, 12-second preview windows:

| Track | Player RMS before → after | Backing RMS before → after | Mean limiter reduction before → after |
| --- | --- | --- | --- |
| Ode to Joy | 0.125 → 0.170 | 0.287 → 0.239 | 12.2% → 9.0% |
| Pocket Change | 0.221 → 0.226 | 0.212 → 0.196 | 15.5% → 8.0% |

Ode to Joy gets a stronger lead and lighter rhythm/bass/drums. Pocket Change's horns, bass and drums
are reduced to give the melody more room and preserve dynamics. Chart timing is unchanged. These
are mix measurements, not an assertion of a listening study. The ten new songs are checked through
their complete audio at 22.05 kHz in the test suite; a separate full render at 44.1 kHz also checks
finite samples, non-silent stems and the linked mix peak limit.

## Cover artwork and browsing

All 53 built-ins now have individual vector illustrations and share a small Canvas renderer. The art redesign
and preview error handling add about 4.9 KB gzip to the complete single-file build (276.46 → 281.32 KB).
No PNGs are bundled: a cover is encoded only when requested and reused by the existing artwork cache.
The flat colour fields avoid expensive image textures and keep runtime PNGs small (about 37 KiB on average
in Chrome). A contact-sheet audit checks all 53 complete, distinct renders and provides 36-pixel thumbnails
for visual review. Existing bundled fonts are loaded before encoding to prevent cached fallback lettering.

Rapid production browsing also reproduced unhandled “superseded” preview errors. Preview loads now settle
all stem requests, release partially loaded URLs on cancellation/failure, and return quietly. Regression
tests cover both a rejected stem and a canceled request that returns late. Audio preview failures do not
prevent song selection or gameplay.

## WASM assessment and next priorities

- Keep judgement, input and frame orchestration in TypeScript. The JS benchmark has substantial CPU
  headroom, and a bridge to WASM would not solve canvas resizing, shader compilation or GPU fill cost.
- If loading becomes slow on representative phones, benchmark the supersaw/string and reverb kernels
  in the synthesis worker first. A Rust/WASM SIMD implementation could help these tight loops, but
  it needs an end-to-end comparison including copies, startup time, bundle size and audio parity.
  No speedup is claimed without that comparison.
- Measure actual mobile GPU time for Crystal before changing shader quality. Consider a
  lower reflection budget or bloom resolution before rewriting CPU code.
- Decoded stereo PCM remains a larger memory cost than chart objects: about 84.7 MiB per four-minute
  stem at 44.1 kHz; player plus backing is about 169.4 MiB. The current two-buffer mix limits source
  stem multiplication. Future direct-PCM handoff for built-ins could avoid WAV encoding/decoding and
  duplicated cached WAVs; that is a distinct loading/memory project requiring replay and practice tests.

## Reproduction and regression coverage

```sh
npm test
npm run build
npm run bench
npm run bench -- --profile
node tests/bench/starter.bench.ts
node tests/bench/starter.bench.ts photon-run --full
# With an optional Playwright installation and Chrome, start Vite, then:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROME_PATH=/absolute/path/to/chrome node tests/tools/browser-audit.mjs
# For the cover contact sheet:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
CHROME_PATH=/absolute/path/to/chrome node tests/tools/cover-audit.mjs
```

Browser checks cover filtered/reordered/favourite cover identity, touch momentum/snapping/cancellation,
reduced motion, stable settings navigation at 1280/1024/390 px, phone library layouts at 320×568,
390×844 and 844×390, best-score recording (including bot/practice exclusions), maximum streak,
canceled compatibility touch gestures, repeated Chrome touch taps, and startup target allocation.
The browser uses an isolated profile and a built-in-only fixture. Physical iPhone Safari double-tap
behavior still needs on-device verification; a desktop Chrome touch check is not an iOS test.
