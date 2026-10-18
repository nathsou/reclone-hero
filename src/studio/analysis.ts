import { fft } from './dsp.ts';
import { pitchFeatures } from './pitch.ts';

/** Offline, dependency-free onset analysis. Input is mono PCM; no score or instrument stems needed. */
export interface Onset {
  time: number; strength: number; tone: number;
  /** Optional for compatibility with existing Studio projects. Pitch is a MIDI-number estimate. */
  pitch?: number; clarity?: number; salience?: number;
  band?: number;
}
export interface Analysis {
  version?: 2;
  duration: number;
  bpm: number;
  beatOffset: number;
  confidence: number;
  /** Consecutive passages support a materially different, non-metrically-equivalent pulse. */
  tempoVariable?: boolean;
  onsets: Onset[];
  /** Peak envelope at 100 samples/second, for the editor. */
  waveform: Float32Array;
}


function quantile(values: ArrayLike<number>, q: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
}

function tempoVaries(onsets: Onset[], duration: number, globalBpm: number): boolean {
  let consecutive = 0;
  for (let start = 0; start + 24 <= duration; start += 12) {
    const events = onsets.filter(o => o.time >= start && o.time < start + 24);
    if (events.length < 8) { consecutive = 0; continue; }
    const fit = (bpm: number) => {
      let x = 0, y = 0, total = 0;
      for (const event of events) { const w = Math.min(1.5, event.strength), angle = event.time * bpm / 60 * Math.PI * 2; x += Math.cos(angle) * w; y += Math.sin(angle) * w; total += w; }
      return Math.hypot(x, y) / Math.max(1e-9, total);
    };
    const global = fit(globalBpm); let best = global, localBpm = globalBpm;
    for (let candidate = 60; candidate <= 200; candidate += 0.5) { const score = fit(candidate); if (score > best) { best = score; localBpm = candidate; } }
    const ratio = localBpm / globalBpm;
    const equivalent = [0.5, 2 / 3, 1, 1.5, 2].some(multiple => Math.abs(ratio / multiple - 1) < 0.025);
    consecutive = !equivalent && Math.abs(ratio - 1) > 0.08 && best > 0.35 && best > global + 0.15 ? consecutive + 1 : 0;
    if (consecutive >= 2) return true;
  }
  return false;
}

/** Generator yields progress so the workerless fallback can also stay responsive/cancellable. */
export function* analyzeJob(pcm: Float32Array, sr: number): Generator<number, Analysis> {
  if (!Number.isFinite(sr) || sr < 8000 || pcm.length < sr / 2) throw new Error('Choose audio at least half a second long.');
  const duration = pcm.length / sr;
  if (duration > 20 * 60) throw new Error('Songs up to 20 minutes are supported.');
  const size = 1024, hop = Math.round(sr / 100), dt = hop / sr;
  const count = Math.ceil(pcm.length / hop);
  const flux = new Float64Array(count), rms = new Float64Array(count), tone = new Float64Array(count);
  const bands = new Uint8Array(count);
  const waveform = new Float32Array(Math.ceil(duration * 100));
  const re = new Float64Array(size), im = new Float64Array(size), previous = new Float64Array(size / 2);
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = Number.isFinite(pcm[i]) ? Math.abs(pcm[i]) : 0;
    peak = Math.max(peak, v);
    const bin = Math.min(waveform.length - 1, Math.floor(i / sr * 100));
    waveform[bin] = Math.max(waveform[bin], v);
  }
  // Normalize before log compression: quiet masters should yield the same chart as loud ones.
  const gain = peak > 1e-7 ? 1 / peak : 0;
  for (let f = 0; f < count; f++) {
    let energy = 0;
    for (let j = 0; j < size; j++) {
      const i = f * hop + j - size / 2;
      const v = i >= 0 && i < pcm.length && Number.isFinite(pcm[i]) ? pcm[i] * gain : 0;
      re[j] = v * window[j]; im[j] = 0; energy += v * v;
    }
    rms[f] = Math.sqrt(energy / size);
    fft(re, im);
    let novelty = 0, weighted = 0, total = 0, bass = 0, mid = 0, treble = 0;
    for (let k = 2; k < size / 2; k++) {
      const hz = k * sr / size;
      if (hz > 9000) break;
      const mag = Math.log1p(10 * Math.hypot(re[k], im[k]));
      const diff = Math.max(0, mag - previous[k]);
      novelty += diff;
      if (hz < 250) bass += diff * 4; else if (hz < 2000) mid += diff; else treble += diff * 0.3;
      // Spectral colour, not a claim to transcribe polyphonic guitar pitch.
      if (hz >= 100 && hz <= 3000) { weighted += diff * Math.log2(hz); total += diff; }
      previous[k] = mag;
    }
    flux[f] = novelty;
    tone[f] = total > 0 ? weighted / total : 8;
    bands[f] = bass >= mid && bass >= treble ? 0 : mid >= treble ? 1 : 2;
    if (f % 200 === 0) yield f / count * 0.6;
  }
  const onsets: Onset[] = [];
  const floor = Math.max(quantile(flux, 0.9) * 0.12, quantile(flux, 0.995) * 0.015);
  const strengthScale = Math.max(1e-9, quantile(flux, 0.95));
  const floors = Float64Array.from({ length: Math.ceil(duration) }, (_, second) => {
    const local = flux.subarray(Math.max(0, Math.floor((second - 4) / dt)), Math.min(count, Math.ceil((second + 4) / dt)));
    return Math.max(floor * 0.08, quantile(local, 0.9) * 0.12, quantile(local, 0.995) * 0.015);
  });
  for (let f = 0; f < count - 1; f++) {
    const localFloor = floors[Math.min(floors.length - 1, Math.floor(f * dt))];
    if (rms[f] < 0.002 || flux[f] < localFloor || (f > 0 && flux[f] <= flux[f - 1]) || flux[f] < flux[f + 1]) continue;
    // Note releases and the spectral ripple of decaying tones are not new attacks.
    if (f >= 2 && rms[f] < rms[f - 2] * 0.8) continue;
    const local = flux.subarray(Math.max(0, f - 20), Math.min(count, f + 21));
    const threshold = quantile(local, 0.5) * 1.35 + localFloor;
    if (flux[f] <= threshold) continue;
    const event: Onset = { time: Math.min(duration - 0.0001, f === 0 ? 0 : f * dt + 0.008), strength: Math.min(3, flux[f] / strengthScale), tone: tone[f], band: bands[f] };
    const prev = onsets[onsets.length - 1];
    if (prev && event.time - prev.time < 0.065) {
      if (event.strength > prev.strength) onsets[onsets.length - 1] = event;
    } else onsets.push(event);
  }
  yield 0.65;
  // Autocorrelation of the novelty envelope, with local normalization to reduce loud-section bias.
  const norm = new Float64Array(count);
  for (let i = 0; i < count; i++) norm[i] = Math.min(3, flux[i] / strengthScale);
  const correlations = new Map<number, number>();
  for (let lag = Math.round(60 / 200 / dt); lag <= Math.round(60 / 60 / dt); lag++) {
    let dot = 0, aa = 0, bb = 0;
    for (let i = lag; i < count; i++) { dot += norm[i] * norm[i - lag]; aa += norm[i] ** 2; bb += norm[i - lag] ** 2; }
    const raw = dot / Math.max(1e-9, Math.sqrt(aa * bb));
    correlations.set(lag, raw);
  }
  // Search the full tempo range. Refining only near the autocorrelation peak locked real songs
  // into unrelated 3:2 tempos; a strong 120 BPM prior made that particularly common.
  let bpm = 120, beatOffset = 0, coherence = 0, bestRaw = 0, best = -Infinity;
  const evaluate = (candidate: number) => {
    let x = 0, y = 0, weight = 0;
    for (const o of onsets) {
      const angle = o.time * candidate / 60 * Math.PI * 2;
      const w = Math.min(1.5, o.strength);
      x += Math.cos(angle) * w; y += Math.sin(angle) * w; weight += w;
    }
    const c = Math.hypot(x, y) / Math.max(1e-9, weight);
    const raw = correlations.get(Math.round(60 / candidate / dt)) ?? 0;
    const score = raw + 2 * c - 0.02 * Math.abs(Math.log2(candidate / 110));
    if (score > best) { best = score; coherence = c; bestRaw = raw; bpm = candidate; beatOffset = ((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * 60 / bpm; }
  };
  if (onsets.length >= 8) {
    for (let i = 0; i <= 2800; i++) { evaluate(60 + i * 0.05); if (i % 160 === 0) yield 0.65 + i / 2800 * 0.12; }
    const coarse = bpm;
    for (let candidate = Math.max(60, coarse - 0.05); candidate <= Math.min(200, coarse + 0.05); candidate += 0.005) evaluate(candidate);
  }
  const tempoVariable = tempoVaries(onsets, duration, bpm);
  const features = pitchFeatures(pcm, sr, gain);
  for (let i = 0; i < onsets.length; i++) {
    Object.assign(onsets[i], features(onsets[i].time));
    if (i % 40 === 0) yield 0.78 + i / Math.max(1, onsets.length) * 0.2;
  }
  // Normalize attack strength within a short passage, so a quiet intro is not erased by a chorus.
  const saliences = onsets.map(o => o.salience ?? 0), strengths = onsets.map(o => o.strength);
  for (let i = 0, lo = 0, hi = 0; i < onsets.length; i++) {
    const event = onsets[i];
    while (lo < i && onsets[lo].time < event.time - 4) lo++;
    while (hi < onsets.length && onsets[hi].time <= event.time + 4) hi++;
    const scale = quantile(saliences.slice(lo, hi), 0.8), attackScale = quantile(strengths.slice(lo, hi), 0.8);
    event.salience = scale > 1e-9 ? Math.min(3, saliences[i] / scale) : 0;
    event.strength = attackScale > 1e-9 ? Math.min(3, strengths[i] / attackScale) : 0;
  }
  yield 1;
  return { version: 2, duration, bpm: Math.round(bpm * 100) / 100, beatOffset, tempoVariable,
    confidence: onsets.length < 8 ? 0 : Math.min(duration < 10 ? 0.3 : 1, (bestRaw * 0.6 + coherence * 0.4) * (tempoVariable ? 0.65 : 1)), onsets, waveform };
}

export function analyzeAudio(pcm: Float32Array, sr: number): Analysis {
  const job = analyzeJob(pcm, sr);
  for (;;) { const step = job.next(); if (step.done) return step.value; }
}
