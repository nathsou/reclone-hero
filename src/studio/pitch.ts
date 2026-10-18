import { fft } from './dsp.ts';

/** A pitched attack estimate, not instrument identification or polyphonic transcription. */
export interface PitchFeatures { pitch?: number; clarity: number; salience: number }

/** Reusable, bounded scratch buffers. Compare before/after a transient to reject ringing old notes. */
export function pitchFeatures(pcm: Float32Array, sr: number, gain: number): (time: number) => PitchFeatures {
  const size = 4096, half = size / 2;
  const re = new Float64Array(size), im = new Float64Array(size);
  const before = new Float64Array(half), after = new Float64Array(half);
  const oldTonal = new Float64Array(half), tonal = new Float64Array(half), novelty = new Float64Array(half);
  const prefix = new Float64Array(half + 1);
  const window = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  const spectrum = (time: number, out: Float64Array) => {
    const start = Math.round(time * sr) - half;
    for (let j = 0; j < size; j++) { const sample = pcm[start + j]; re[j] = (Number.isFinite(sample) ? sample : 0) * gain * window[j]; im[j] = 0; }
    fft(re, im);
    for (let k = 0; k < half; k++) out[k] = Math.hypot(re[k], im[k]);
  };
  const whiten = (magnitudes: Float64Array, out: Float64Array) => {
    prefix[0] = 0;
    for (let k = 0; k < half; k++) prefix[k + 1] = prefix[k] + magnitudes[k];
    for (let k = 0; k < half; k++) {
      const lo = Math.max(0, k - 12), hi = Math.min(half, k + 13);
      const a = Math.max(lo, k - 2), b = Math.min(hi, k + 3);
      const floor = (prefix[hi] - prefix[lo] - prefix[b] + prefix[a]) / Math.max(1, hi - lo - (b - a));
      out[k] = Math.max(0, magnitudes[k] - floor * 2);
    }
  };
  return (time) => {
    spectrum(time - 0.105, before); spectrum(time + 0.055, after);
    whiten(before, oldTonal); whiten(after, tonal);
    let total = 0, sum = 0, logSum = 0, bins = 0;
    for (let k = 1; k < half; k++) {
      novelty[k] = Math.max(0, tonal[k] - oldTonal[k] * 1.08);
      const hz = k * sr / size;
      if (hz >= 130 && hz <= 4000) {
        total += novelty[k] * Math.sqrt(hz / 440);
        sum += after[k]; logSum += Math.log(after[k] + 1e-9); bins++;
      }
    }
    let best = 0, bestBin = 0;
    // Exclude sub-bass/kick fundamentals and cymbal wash from the melodic fret estimate.
    for (let k = Math.ceil(130 * size / sr); k <= Math.min(half - 2, Math.floor(1500 * size / sr)); k++) {
      if (after[k] <= after[k - 1] || after[k] < after[k + 1] || novelty[k] <= 0) continue;
      let score = novelty[k];
      for (let harmonic = 2; harmonic <= 4; harmonic++) {
        const center = k * harmonic, radius = Math.max(1, Math.round(center * 0.012));
        let peak = 0;
        for (let b = Math.max(1, center - radius); b <= Math.min(half - 1, center + radius); b++) peak = Math.max(peak, novelty[b]);
        score += peak / harmonic;
      }
      score *= Math.sqrt(k * sr / size / 440);
      if (score > best) { best = score; bestBin = k; }
    }
    const flatness = Math.exp(logSum / Math.max(1, bins)) / Math.max(1e-9, sum / Math.max(1, bins));
    const clarity = Math.min(1, 3 * best / Math.max(1e-9, total)) * Math.max(0, 1 - flatness / 0.7);
    if (!bestBin || clarity < 0.12) return { clarity: 0, salience: 0 };
    // An attack can brighten a note's second harmonic without changing its fundamental.
    for (let octave = 0; octave < 2 && bestBin * sr / size >= 260; octave++) {
      const center = Math.round(bestBin / 2), radius = Math.max(1, Math.round(center * 0.015));
      let root = center;
      for (let k = center - radius; k <= center + radius; k++) if (after[k] > after[root]) root = k;
      if (tonal[root] < tonal[bestBin] * 0.28 || after[root] <= after[root - 1] || after[root] < after[root + 1]) break;
      bestBin = root;
    }
    const left = Math.log(after[bestBin - 1] + 1e-9), mid = Math.log(after[bestBin] + 1e-9), right = Math.log(after[bestBin + 1] + 1e-9);
    const fraction = Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / (left - 2 * mid + right || 1)));
    return { pitch: 69 + 12 * Math.log2((bestBin + fraction) * sr / size / 440), clarity, salience: best };
  };
}
