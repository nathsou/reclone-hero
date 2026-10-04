// Singing pitch from microphone samples: YIN (de Cheveigné & Kawahara, 2002), on a 2× decimated block
// so a frame costs well under a millisecond.

/** Lowest and highest sung frequency looked for (Hz): a low bass to a high soprano. */
const F_MIN = 70;
const F_MAX = 1100;
/** YIN threshold on the cumulative mean normalised difference: lower is stricter. */
const THRESHOLD = 0.15;
/** Quieter blocks (RMS) are silence. */
export const SILENCE_RMS = 0.01;

export interface PitchReading {
  /** MIDI note number (fractional), NaN when nothing clear is sung */
  pitch: number;
  /** loudness (RMS) of the block */
  level: number;
}

/** Scratch buffers, reused between calls (the frame loop must not allocate). */
let half = new Float32Array(0);
let diff = new Float32Array(0);

/** Pitch of a block of samples (any length; ~2048 at 44.1-48 kHz is a good size). */
export function detectPitch(samples: Float32Array, sampleRate: number, out: PitchReading = { pitch: NaN, level: 0 }): PitchReading {
  // decimate by two (average pairs: a crude low-pass, plenty for a voice)
  const n = samples.length >> 1;
  if (half.length < n) half = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = (samples[2 * i] + samples[2 * i + 1]) * 0.5;
    half[i] = v;
    sum += v * v;
  }
  const sr = sampleRate / 2;
  out.level = Math.sqrt(sum / Math.max(1, n));
  out.pitch = NaN;
  if (out.level < SILENCE_RMS) return out;
  const tauMin = Math.max(2, Math.floor(sr / F_MAX));
  const tauMax = Math.min(Math.floor(sr / F_MIN), (n >> 1) - 1);
  if (tauMax <= tauMin) return out;
  const w = n - tauMax;
  if (diff.length < tauMax + 1) diff = new Float32Array(tauMax + 1);
  // difference function, then its cumulative mean normalised form
  diff[0] = 1;
  let running = 0;
  let found = -1;
  for (let tau = 1; tau <= tauMax; tau++) {
    let d = 0;
    for (let i = 0; i < w; i++) {
      const x = half[i] - half[i + tau];
      d += x * x;
    }
    running += d;
    diff[tau] = running > 0 ? (d * tau) / running : 1;
    // the first dip under the threshold, followed down to its bottom
    if (found < 0 && tau > tauMin + 1 && diff[tau - 1] < THRESHOLD && diff[tau - 1] <= diff[tau] && diff[tau - 1] <= diff[tau - 2]) found = tau - 1;
    if (found >= 0) break;
  }
  if (found < 0) return out;
  // parabolic interpolation around the dip for a sub-sample period
  const a = diff[found - 1];
  const b = diff[found];
  const c = diff[found + 1] ?? b;
  const den = a - 2 * b + c;
  const tau = den !== 0 ? found + (0.5 * (a - c)) / den : found;
  const hz = sr / tau;
  out.pitch = 69 + 12 * Math.log2(hz / 440);
  return out;
}

/** Distance in semitones from sung to target, folded into one octave (-6..6]: any octave counts. */
export function pitchDistance(sung: number, target: number): number {
  let d = (sung - target) % 12;
  if (d > 6) d -= 12;
  else if (d <= -6) d += 12;
  return d;
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** "A4" for 69. */
export function noteName(midi: number): string {
  const m = Math.round(midi);
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}
