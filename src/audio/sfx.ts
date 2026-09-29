// All sound effects are synthesized at startup: no audio assets to ship.

export type SfxName =
  | 'clank'
  | 'streakBreak'
  | 'spPhrase'
  | 'spReady'
  | 'spActivate'
  | 'spEnd'
  | 'soloEnd'
  | 'fullCombo'
  | 'click'
  | 'clickHi'
  | 'menuMove'
  | 'menuSelect'
  | 'menuBack';

type Rng = () => number;

function mulberry(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Karplus-Strong plucked string. */
function pluck(out: Float32Array, sr: number, freq: number, start: number, gain: number, decay: number, brightness: number, rnd: Rng) {
  const n = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += brightness * (rnd() * 2 - 1 - lp);
    buf[i] = lp;
  }
  const s0 = Math.floor(start * sr);
  for (let i = 0; s0 + i < out.length; i++) {
    const j = i % n;
    const v = buf[j];
    out[s0 + i] += v * gain;
    buf[j] = decay * 0.5 * (v + buf[(j + 1) % n]);
  }
}

function envelope(out: Float32Array, sr: number, attack: number, tau: number) {
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] *= Math.min(1, t / attack) * Math.exp(-t / tau);
  }
}

function normalize(out: Float32Array, peak: number) {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < out.length; i++) out[i] *= peak / m;
  return out;
}

function tone(out: Float32Array, sr: number, freq: number, start: number, dur: number, gain: number, partials: [number, number][] = [[1, 1]], tau = dur / 3) {
  const s0 = Math.floor(start * sr);
  const len = Math.min(out.length - s0, Math.floor(dur * sr));
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / tau);
    let v = 0;
    for (const [ratio, amp] of partials) v += Math.sin(2 * Math.PI * freq * ratio * t) * amp;
    out[s0 + i] += v * env * gain;
  }
}

/** Muted, out-of-tune string scrape: the classic "you missed" sound. */
function clank(sr: number, seed: number, heavy = false): Float32Array {
  const rnd = mulberry(seed);
  const out = new Float32Array(Math.floor(sr * (heavy ? 0.5 : 0.3)));
  const base = [82.41, 110, 146.83, 196, 246.94];
  const shift = 2 ** ((Math.floor(rnd() * 5) - 1) / 12);
  const count = heavy ? 5 : 3 + Math.floor(rnd() * 2);
  const first = heavy ? 0 : Math.floor(rnd() * 2);
  for (let s = 0; s < count; s++) {
    const f = base[first + s] * shift * (1 + (rnd() - 0.5) * 0.03);
    pluck(out, sr, f, s * 0.006 + rnd() * 0.003, 0.5, 0.982, 0.55, rnd);
  }
  // pick scrape
  const scrapeLen = Math.floor(sr * 0.02);
  let prev = 0;
  for (let i = 0; i < scrapeLen; i++) {
    const w = rnd() * 2 - 1;
    out[i] += (w - prev) * 0.35 * Math.exp(-i / (sr * 0.005));
    prev = w;
  }
  envelope(out, sr, 0.001, heavy ? 0.12 : 0.07);
  if (heavy) {
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      out[i] += Math.sin(2 * Math.PI * (70 - 30 * t) * t) * 0.9 * Math.exp(-t / 0.09);
    }
  }
  return normalize(out, heavy ? 0.9 : 0.7);
}

function chime(sr: number, notes: number[], spacing: number, dur = 0.9): Float32Array {
  const out = new Float32Array(Math.floor(sr * (dur + spacing * notes.length)));
  notes.forEach((f, i) =>
    tone(out, sr, f, i * spacing, dur, 0.5, [
      [1, 1],
      [2.76, 0.35],
      [5.4, 0.15],
      [8.93, 0.05],
    ], dur / 4),
  );
  return normalize(out, 0.6);
}

function whoosh(sr: number, rising: boolean): Float32Array {
  const rnd = mulberry(7);
  const dur = rising ? 1.1 : 0.7;
  const out = new Float32Array(Math.floor(sr * dur));
  // noise through a swept state-variable bandpass
  let low = 0;
  let band = 0;
  for (let i = 0; i < out.length; i++) {
    const p = i / out.length;
    const fc = rising ? 250 * Math.pow(30, p) : 5000 * Math.pow(1 / 25, p);
    const f = 2 * Math.sin((Math.PI * Math.min(fc, sr / 6)) / sr);
    const q = 0.25;
    const x = rnd() * 2 - 1;
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    const env = rising ? Math.sin(Math.PI * Math.min(1, p * 1.3)) : 1 - p;
    out[i] = band * env * 0.6;
  }
  if (rising) {
    for (const [fr, st] of [
      [440, 0.25],
      [554.37, 0.3],
      [659.25, 0.35],
      [880, 0.4],
    ]) {
      tone(out, sr, fr, st, dur - st, 0.18, [
        [1, 1],
        [2, 0.3],
        [3, 0.12],
      ], 0.35);
    }
  }
  return normalize(out, 0.75);
}

function blip(sr: number, freqs: number[], each: number, gain = 0.4): Float32Array {
  const out = new Float32Array(Math.floor(sr * (each * freqs.length + 0.05)));
  freqs.forEach((f, i) => tone(out, sr, f, i * each, each + 0.04, gain, [[1, 1], [2, 0.2]], each / 2.5));
  return out;
}

/** Full combo: a rising arpeggio into a held major chord, sparkles, and the crackle of fireworks. */
function fanfare(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 2.6));
  const brass: [number, number][] = [
    [1, 1],
    [2, 0.5],
    [3, 0.3],
    [4, 0.15],
  ];
  const run = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  run.forEach((f, i) => tone(out, sr, f, i * 0.06, 0.3, 0.32, brass, 0.12));
  const t0 = run.length * 0.06 + 0.03;
  for (const f of [261.63, 523.25, 659.25, 783.99, 1046.5]) tone(out, sr, f, t0, 2, 0.26, brass, 0.8);
  const rnd = mulberry(42);
  const sparkle = [2093, 2349.3, 2637, 3136, 3520];
  for (let k = 0; k < 16; k++) {
    tone(out, sr, sparkle[Math.floor(rnd() * sparkle.length)], t0 + 0.08 + k * 0.07 + rnd() * 0.03, 0.35, 0.07, [
      [1, 1],
      [2.76, 0.3],
    ], 0.08);
  }
  // fireworks: short bursts of filtered crackle
  for (const at of [0.7, 1.05, 1.4]) {
    const s0 = Math.floor(at * sr);
    let lp = 0;
    for (let i = 0; i < sr * 0.35 && s0 + i < out.length; i++) {
      const pop = rnd() < 0.004 ? rnd() * 2 - 1 : 0;
      lp += 0.3 * (rnd() * 2 - 1 - lp);
      out[s0 + i] += (lp * 0.25 + pop * 0.9) * Math.exp(-i / (sr * 0.09));
    }
  }
  return normalize(out, 0.8);
}

export function synthesizeSfx(sr: number): Record<SfxName, Float32Array[]> {
  return {
    clank: [0, 1, 2, 3, 4, 5].map((s) => clank(sr, 101 + s * 17)),
    streakBreak: [clank(sr, 999, true)],
    spPhrase: [chime(sr, [1318.5, 1975.5], 0.07)],
    spReady: [chime(sr, [987.8, 1318.5, 1760], 0.06, 1.2)],
    spActivate: [whoosh(sr, true)],
    spEnd: [whoosh(sr, false)],
    soloEnd: [blip(sr, [523.25, 659.25, 783.99, 1046.5], 0.07, 0.35)],
    fullCombo: [fanfare(sr)],
    click: [blip(sr, [1000], 0.03, 0.8)],
    clickHi: [blip(sr, [1600], 0.03, 0.8)],
    menuMove: [blip(sr, [1800], 0.018, 0.12)],
    menuSelect: [blip(sr, [900, 1350], 0.035, 0.2)],
    menuBack: [blip(sr, [1100, 740], 0.035, 0.18)],
  };
}
