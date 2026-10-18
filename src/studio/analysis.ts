/** Offline, dependency-free onset analysis. Input is mono PCM; no score or instrument stems needed. */
export interface Onset { time: number; strength: number; tone: number }
export interface Analysis {
  duration: number;
  bpm: number;
  beatOffset: number;
  confidence: number;
  onsets: Onset[];
  /** Peak envelope at 100 samples/second, for the editor. */
  waveform: Float32Array;
}

/** In-place radix-2 FFT. Reused buffers keep full-song analysis bounded. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const r = re[i]; re[i] = re[j]; re[j] = r; }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let ur = 1, ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const vr = re[b] * ur - im[b] * ui, vi = re[b] * ui + im[b] * ur;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
}

function quantile(values: ArrayLike<number>, q: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)] ?? 0;
}

/** Generator yields progress so the workerless fallback can also stay responsive/cancellable. */
export function* analyzeJob(pcm: Float32Array, sr: number): Generator<number, Analysis> {
  if (!Number.isFinite(sr) || sr < 8000 || pcm.length < sr / 2) throw new Error('Choose audio at least half a second long.');
  const duration = pcm.length / sr;
  if (duration > 20 * 60) throw new Error('Songs up to 20 minutes are supported.');
  const size = 1024, hop = Math.round(sr / 100), dt = hop / sr;
  const count = Math.ceil(pcm.length / hop);
  const flux = new Float64Array(count), rms = new Float64Array(count), tone = new Float64Array(count);
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
    let novelty = 0, weighted = 0, total = 0;
    for (let k = 2; k < size / 2; k++) {
      const hz = k * sr / size;
      if (hz > 9000) break;
      const mag = Math.log1p(10 * Math.hypot(re[k], im[k]));
      const diff = Math.max(0, mag - previous[k]);
      novelty += diff;
      // Spectral colour, not a claim to transcribe polyphonic guitar pitch.
      if (hz >= 100 && hz <= 3000) { weighted += diff * Math.log2(hz); total += diff; }
      previous[k] = mag;
    }
    flux[f] = novelty;
    tone[f] = total > 0 ? weighted / total : 8;
    if (f % 200 === 0) yield f / count * 0.8;
  }
  const onsets: Onset[] = [];
  const floor = Math.max(quantile(flux, 0.9) * 0.12, quantile(flux, 0.995) * 0.015);
  const strengthScale = Math.max(1e-9, quantile(flux, 0.95));
  for (let f = 0; f < count - 1; f++) {
    if (rms[f] < 0.002 || flux[f] < floor || (f > 0 && flux[f] <= flux[f - 1]) || flux[f] < flux[f + 1]) continue;
    // Note releases and the spectral ripple of decaying tones are not new attacks.
    if (f >= 2 && rms[f] < rms[f - 2] * 0.8) continue;
    const local = flux.subarray(Math.max(0, f - 20), Math.min(count, f + 21));
    const threshold = quantile(local, 0.5) * 1.35 + floor;
    if (flux[f] <= threshold) continue;
    const event = { time: Math.min(duration - 0.0001, f === 0 ? 0 : f * dt + 0.008), strength: Math.min(3, flux[f] / strengthScale), tone: tone[f] };
    const prev = onsets[onsets.length - 1];
    if (prev && event.time - prev.time < 0.065) {
      if (event.strength > prev.strength) onsets[onsets.length - 1] = event;
    } else onsets.push(event);
  }
  yield 0.85;
  // Autocorrelation of the novelty envelope, with local normalization to reduce loud-section bias.
  const norm = new Float64Array(count);
  for (let i = 0; i < count; i++) norm[i] = Math.min(3, flux[i] / strengthScale);
  let best = 0, bestLag = 60 / 120 / dt, bestRaw = 0;
  for (let lag = Math.round(60 / 190 / dt); lag <= Math.round(60 / 60 / dt); lag++) {
    let dot = 0, aa = 0, bb = 0;
    for (let i = lag; i < count; i++) { dot += norm[i] * norm[i - lag]; aa += norm[i] ** 2; bb += norm[i - lag] ** 2; }
    const raw = dot / Math.max(1e-9, Math.sqrt(aa * bb));
    // Repeated two-beat patterns otherwise win at half tempo in dance/pop recordings.
    const score = raw * (0.55 + 0.45 * Math.exp(-(Math.log2(60 / (lag * dt) / 120) ** 2) / 0.5));
    if (score > best) { best = score; bestLag = lag; bestRaw = raw; }
  }
  // Refine fractional lag using event phase coherence near the correlation estimate.
  let bpm = 60 / (bestLag * dt), beatOffset = 0, coherence = 0;
  const initial = bpm;
  for (let candidate = initial - 2; candidate <= initial + 2; candidate += 0.05) {
    let x = 0, y = 0, weight = 0;
    for (const o of onsets) {
      const angle = o.time * candidate / 60 * Math.PI * 2;
      x += Math.cos(angle) * o.strength; y += Math.sin(angle) * o.strength; weight += o.strength;
    }
    const c = Math.hypot(x, y) / Math.max(1e-9, weight);
    if (c > coherence) { coherence = c; bpm = candidate; beatOffset = ((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * 60 / bpm; }
  }
  yield 1;
  return { duration, bpm: Math.round(bpm * 100) / 100, beatOffset, confidence: onsets.length < 8 ? 0 : Math.min(duration < 10 ? 0.3 : 1, bestRaw * 0.6 + coherence * 0.4), onsets, waveform };
}

export function analyzeAudio(pcm: Float32Array, sr: number): Analysis {
  const job = analyzeJob(pcm, sr);
  for (;;) { const step = job.next(); if (step.done) return step.value; }
}
