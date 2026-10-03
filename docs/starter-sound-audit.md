# Starter sound and loading pass — 3 October 2026

This pass addresses shared instrument defects across the 53-song pack, gives acoustic piano
arrangements their own voice, and reworks the arrangements with concrete mix or harmony problems.
All sounds remain generated locally, with no samples, downloads or runtime dependencies.

## Sound changes

- **Guitars, bass, banjo and harpsichord:** the string loop previously subtracted half a sample for
  its damping filter, although its brightness-dependent blend has a different phase delay. Both
  that filter and the fractional allpass now compensate at the fundamental. A deterministic bright
  pluck measured by interpolated autocorrelation went from +1.36/+2.90/+5.67/+11.35 cents at MIDI
  48/60/72/84 to +0.03/−0.04/+0.04/+0.02 cents. These are estimates for static notes; expressive
  bends, vibrato and rhythm-guitar double tracking intentionally change pitch.
- **Distorted guitars:** the old transfer curve amplified its DC bias before clipping and subtracted
  an unrelated constant. That saturated small notes asymmetrically and produced a startup transient
  even for zero input. Bias now follows input gain, and its exact clipped value is subtracted.
- **Synths and strings:** the center oscillator was counted on one side and then added again to
  both, making unison voices lean left. It now contributes equally to both sides, with the outer
  detuned voices distributed symmetrically.
- **Acoustic piano:** a new hammer-envelope voice uses velocity-sensitive, decaying, slightly
  inharmonic partials with a damper release. Gymnopédie, Moonlight's introduction, The Entertainer,
  Blue Danube and other acoustic piano parts now use it. Explicit `epiano` parts retain the original
  FM sound in Sunday Tape, Für Elise's electronic arrangement, Afterglow and Circuit Atlas tracks.
  This is a compact synthesized instrument, not a sampled concert grand.
- **Sunday Tape:** lower guitar, pad, bell and drum levels and drier sends leave room for the melody.
  The electric-piano solo becomes the playable part during Keys Solo; guitar comping moves to the
  backing stem there. The chart and solo marker follow that same score.
- **Assembly Line:** reduce drive-guitar and chip levels, soften the brighter chord section and
  bass tone, and reduce bass gain. The mechanical riff remains intact without driving the master
  as hard.
- **Moonlight:** the string accompaniment for the second theme mistakenly continued across the
  returning storm, where another string progression was already playing. Move that repeated theme
  accompaniment to the actual second-theme reprise at bar 36.
- **Levels:** remeasure complete songs at 44.1 kHz and update the pack's level trims after the voice
  and mix changes. The measurement is gated RMS, not perceptual LUFS.

The existing 12-second preview audit (including up to three seconds of preroll) measured:

| Track | Average limiter gain reduction before | After |
| --- | ---: | ---: |
| Sunday Tape | 19.0% | 12.8% |
| Assembly Line | 18.8% | 6.3% |
| Moonlight | 1.1% | 0.3% |

These are measurements of compression, not listening-study scores. Compression still catches peaks;
this pass does not claim that every synthesized instrument is indistinguishable from a real one.

## Loading and responsiveness

Song loading immediately cancels an active preview by terminating its worker. Selecting another
preview cancels obsolete work as well. The inline fallback checks the task identity before advancing
its generator. Canceled previews leave the cache synchronously, so selecting A, B, A within one turn
cannot reuse A's already-rejected promise. Completed excerpts use a four-entry LRU cache.

Full-song requests deduplicate by song while in flight. Progress listeners belong to their own request,
and only the most recently requested full song remains cached after completion. Cleanup uses handled
promise branches rather than creating rejected, unobserved `finally()` promises.

Render blocks shrink from 32,768 to 8,192 samples, giving the inline fallback more opportunities to
yield. Its scheduling budget is 12 ms; a single note or block can still exceed that budget, so this is
not a guaranteed maximum main-thread task duration. Idle instrument sections are skipped after their
release/effect tail, unused echo/reverb buses are bypassed, and pluck oscillators stop once their
zero-sustain envelope has ended. The 44.1 kHz sample rate is unchanged.

In one local Node 24.3.0 sweep of all 53 preview excerpts, total render-and-analysis time fell from
18,313 to 15,470 ms (15.5%); the median track fell from 334 to 288 ms. Individual tracks vary, and this
is a loading/synthesis measurement, not a browser FPS or mobile GPU claim. The benchmark includes
per-sample statistics, preroll and instrument initialization. Production output is approximately
808 KB / 286 KB gzip.

## Verification

No tests were added or modified. Existing checks and direct browser inspection cover:

- Production build and existing parser, engine, chart and synthesis checks.
- Existing Chrome browsing, touch, settings, result-recording and startup-allocation checks.
- Real worker and forced inline fallback: immediate supersession, gameplay preemption, shared stem
  promises, cached replay, progress delivery, and same-turn A/B/A selection; both completed without
  page errors.
- Standalone production file: built-in library, inline worker synthesis, audio decoding and gameplay.
- All 53 preview renders plus full-track loudness measurements at the shipped sample rate.

Reproduce with `npm run build`, `npm test`, `node tests/bench/starter.bench.ts`, and
`node tests/tools/loudness.ts`. The optional existing browser checks are documented in
[the performance audit](performance-audit.md). Device-specific listening and mobile GPU performance
remain outside these desktop measurements.
