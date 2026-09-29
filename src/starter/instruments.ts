import { Biquad, Svf, blep, mtof, pluck, rng } from './dsp.ts';
import type { DrumVoice, InstrumentKind, Note } from './score.ts';

/**
 * One instrument track. Notes are rendered one at a time into a dry buffer (`note`), then the whole
 * buffer is run through the instrument's stateful effect chain block by block (`process`), so a long
 * song renders in small chunks with little memory.
 */
export interface Voice {
  /** longest ring-out after a note ends, seconds */
  readonly tail: number;
  readonly stereo: boolean;
  note(n: Note, index: number, lenSec: number, L: Float32Array, R: Float32Array | null, at: number): void;
  /** Run the effect chain over n samples in place. */
  process(L: Float32Array, R: Float32Array | null, n: number): void;
}

const TWO_PI = Math.PI * 2;

function adsrGain(i: number, sr: number, len: number, a: number, d: number, s: number, r: number): number {
  const t = i / sr;
  let g: number;
  if (t < a) g = t / a;
  else if (t < a + d) g = 1 - (1 - s) * ((t - a) / d);
  else g = s;
  if (t > len) g *= Math.exp(-(t - len) / Math.max(0.001, r / 4));
  return g;
}

// ---------------------------------------------------------------- guitars

class DriveGuitar implements Voice {
  readonly tail = 0.6;
  readonly stereo = true;
  private readonly sr: number;
  private readonly chains: Biquad[][];
  private readonly gain: number;

  constructor(sr: number, gain = 34, tone = 0.6) {
    this.sr = sr;
    this.gain = gain;
    const mk = () => [
      Biquad.make('hp', 110, sr, 0.7),
      Biquad.make('peak', 750, sr, 0.8, 5),
      // after the clipper: cabinet
      Biquad.make('peak', 420, sr, 1.1, -5),
      Biquad.make('peak', 1900 + tone * 900, sr, 1, 3.5),
      Biquad.make('lp', 5200 + tone * 1500, sr, 0.8),
      Biquad.make('lp', 6500 + tone * 1500, sr, 0.6),
      Biquad.make('hp', 75, sr, 0.7),
      Biquad.make('lowshelf', 160, sr, 0.7, 2),
    ];
    this.chains = [mk(), mk()];
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, R: Float32Array | null, at: number): void {
    // Double tracked: two takes, one per side, each a little early or late and slightly detuned.
    for (let side = 0; side < 2; side++) {
      const rand = rng(index * 7919 + side * 104729 + 17);
      const out = side === 0 ? L : R!;
      const shift = Math.round((rand() - 0.5) * 0.01 * this.sr);
      const detune = 1 + (rand() - 0.5) * 0.003;
      const len = n.mute ? Math.min(lenSec, 0.14) : Math.max(0.05, lenSec - 0.015);
      const amp = (n.v * 0.9) / Math.sqrt(n.p.length);
      n.p.forEach((p, k) => {
        // strum: low strings first
        const strum = Math.round(k * 0.006 * this.sr * (0.6 + rand() * 0.8));
        pluck(out, Math.max(0, at + shift + strum), this.sr, mtof(p) * detune, {
          len,
          decay: n.mute ? 0.11 : 3.2,
          bright: n.mute ? 0.3 : 0.78,
          amp,
          rand,
          release: n.mute ? 0.03 : 0.05,
        });
      });
    }
  }

  process(L: Float32Array, R: Float32Array | null, n: number): void {
    for (let side = 0; side < 2; side++) {
      const buf = side === 0 ? L : R!;
      const c = this.chains[side];
      for (let i = 0; i < n; i++) {
        let x = c[1].tick(c[0].tick(buf[i]));
        x = Math.tanh((x + 0.06) * this.gain) - 0.0599;
        x = c[7].tick(c[6].tick(c[5].tick(c[4].tick(c[3].tick(c[2].tick(x))))));
        buf[i] = x * 0.36;
      }
    }
  }
}

class LeadGuitar implements Voice {
  readonly tail = 1.2;
  readonly stereo = false;
  private readonly sr: number;
  private readonly c: Biquad[];
  private readonly gain: number;

  constructor(sr: number, gain = 22, tone = 0.6) {
    this.sr = sr;
    this.gain = gain;
    this.c = [
      Biquad.make('hp', 180, sr, 0.7),
      Biquad.make('peak', 950, sr, 0.7, 7),
      Biquad.make('peak', 500, sr, 1, -3),
      Biquad.make('peak', 2400 + tone * 600, sr, 1.2, 3),
      Biquad.make('lp', 5600 + tone * 1200, sr, 0.7),
      Biquad.make('lp', 7000, sr, 0.6),
      Biquad.make('hp', 110, sr, 0.7),
    ];
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const rand = rng(index * 31 + 5);
    const long = lenSec >= 0.32;
    const amp = (n.v * 0.9) / Math.sqrt(n.p.length);
    for (const p of n.p) {
      pluck(L, at, this.sr, mtof(p), {
        len: n.mute ? Math.min(lenSec, 0.12) : Math.max(0.05, lenSec - 0.01),
        decay: n.mute ? 0.15 : 4.5,
        bright: 0.85,
        amp,
        rand,
        release: 0.04,
        vibrato: long && n.p.length === 1 ? 0.28 : 0,
        bendFrom: n.bend,
      });
    }
  }

  process(L: Float32Array, _R: Float32Array | null, n: number): void {
    const c = this.c;
    for (let i = 0; i < n; i++) {
      let x = c[2].tick(c[1].tick(c[0].tick(L[i])));
      x = Math.tanh((x + 0.05) * this.gain) - 0.05;
      L[i] = c[6].tick(c[5].tick(c[4].tick(c[3].tick(x)))) * 0.3;
    }
  }
}

class CleanGuitar implements Voice {
  readonly tail = 2;
  readonly stereo = true;
  private readonly sr: number;
  private readonly lp: Biquad[];
  private readonly delay: Float32Array;
  private di = 0;
  private lfo = 0;

  constructor(sr: number) {
    this.sr = sr;
    this.lp = [Biquad.make('lp', 6000, sr, 0.7), Biquad.make('hp', 90, sr, 0.7), Biquad.make('peak', 2800, sr, 1, 2)];
    this.delay = new Float32Array(Math.round(0.03 * sr));
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const rand = rng(index * 13 + 3);
    const amp = (n.v * 0.8) / Math.sqrt(n.p.length);
    n.p.forEach((p, k) => {
      pluck(L, at + Math.round(k * 0.012 * this.sr), this.sr, mtof(p), { len: Math.max(0.05, lenSec), decay: n.mute ? 0.2 : 3, bright: 0.62, amp, rand, release: 0.12 });
    });
  }

  /** Chorus: the right side is a modulated copy. */
  process(L: Float32Array, R: Float32Array | null, n: number): void {
    const d = this.delay;
    const size = d.length;
    const lfoW = (TWO_PI * 0.8) / this.sr;
    for (let i = 0; i < n; i++) {
      const x = this.lp[2].tick(this.lp[1].tick(this.lp[0].tick(L[i])));
      d[this.di] = x;
      this.lfo += lfoW;
      const delay = (0.012 + 0.004 * Math.sin(this.lfo)) * this.sr;
      let p = this.di - delay;
      if (p < 0) p += size;
      const i0 = Math.floor(p);
      const t = p - i0;
      const y = d[i0] * (1 - t) + d[(i0 + 1) % size] * t;
      if (++this.di >= size) this.di = 0;
      L[i] = x * 1.6;
      R![i] = (x * 0.45 + y * 0.55) * 2;
    }
  }
}

// ---------------------------------------------------------------- bass

class PickBass implements Voice {
  readonly tail = 0.4;
  readonly stereo = false;
  private readonly sr: number;
  private readonly c: Biquad[];

  constructor(sr: number, tone = 0.5) {
    this.sr = sr;
    this.c = [Biquad.make('lowshelf', 110, sr, 0.7, 4), Biquad.make('peak', 800, sr, 1, 2 + tone * 3), Biquad.make('lp', 2600 + tone * 2000, sr, 0.7), Biquad.make('hp', 35, sr, 0.7)];
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const rand = rng(index * 101 + 7);
    pluck(L, at, this.sr, mtof(n.p[0]), {
      len: n.mute ? Math.min(lenSec, 0.16) : Math.max(0.05, lenSec - 0.02),
      decay: n.mute ? 0.25 : 2.2,
      bright: 0.55,
      amp: n.v * 1.1,
      rand,
      release: 0.03,
    });
  }

  process(L: Float32Array, _R: Float32Array | null, n: number): void {
    const c = this.c;
    for (let i = 0; i < n; i++) {
      const x = Math.tanh(L[i] * 2.2) * 0.36;
      L[i] = c[3].tick(c[2].tick(c[1].tick(c[0].tick(x))));
    }
  }
}

class SynthBass implements Voice {
  readonly tail = 0.3;
  readonly stereo = false;
  private readonly sr: number;
  private readonly tone: number;
  private readonly sub: boolean;

  constructor(sr: number, tone = 0.5, sub = false) {
    this.sr = sr;
    this.tone = tone;
    this.sub = sub;
  }

  note(n: Note, _index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const sr = this.sr;
    const f = mtof(n.p[0]);
    const dt = f / sr;
    const total = Math.min(L.length - at, Math.round((lenSec + 0.08) * sr));
    const svf = new Svf();
    let ph = 0;
    let ph2 = 0.25;
    const len = n.mute ? Math.min(lenSec, 0.12) : lenSec;
    for (let i = 0; i < total; i++) {
      if ((i & 15) === 0) {
        const env = Math.exp(-i / (0.09 * sr));
        svf.set(90 + f * 2 + this.tone * 2200 * env * n.v, sr, 1.4);
      }
      const g = adsrGain(i, sr, len, 0.003, 0.2, 0.85, 0.05);
      let x: number;
      if (this.sub) x = (Math.sin(TWO_PI * ph) + 0.15 * Math.sin(TWO_PI * ph * 2)) * 0.6;
      else {
        const saw = 2 * ph - 1 - blep(ph, dt);
        const saw2 = 2 * ph2 - 1 - blep(ph2, dt * 1.004);
        x = svf.tick(saw * 0.6 + saw2 * 0.4) + 0.55 * Math.sin(TWO_PI * ph);
      }
      ph += dt;
      if (ph >= 1) ph -= 1;
      ph2 += dt * 1.004;
      if (ph2 >= 1) ph2 -= 1;
      L[at + i] += x * g * n.v * 0.7;
    }
  }

  process(L: Float32Array, _R: Float32Array | null, n: number): void {
    for (let i = 0; i < n; i++) L[i] = Math.tanh(L[i] * 1.6) * 0.62;
  }
}

// ---------------------------------------------------------------- synths

const SAW_DETUNE = [-0.19, -0.11, -0.04, 0, 0.04, 0.11, 0.19];

class SuperSaw implements Voice {
  readonly tail: number;
  readonly stereo = true;
  private readonly sr: number;
  private readonly tone: number;
  private readonly kind: 'lead' | 'pad' | 'strings' | 'pluck';

  constructor(sr: number, kind: 'lead' | 'pad' | 'strings' | 'pluck', tone = 0.5) {
    this.sr = sr;
    this.kind = kind;
    this.tone = tone;
    this.tail = kind === 'pad' ? 1.6 : kind === 'strings' ? 1 : 0.5;
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, R: Float32Array | null, at: number): void {
    const sr = this.sr;
    const k = this.kind;
    const voices = k === 'pluck' ? 3 : k === 'lead' ? 7 : 5;
    const spread = k === 'lead' ? 0.35 : k === 'pad' ? 0.5 : k === 'strings' ? 0.22 : 0.12;
    const [a, d, s, r] =
      k === 'pad' ? [0.35, 0.6, 0.8, 0.9] : k === 'strings' ? [0.14, 0.3, 0.85, 0.5] : k === 'pluck' ? [0.002, 0.18, 0.0, 0.12] : [0.006, 0.25, 0.75, 0.16];
    const rand = rng(index * 977 + 11);
    const total = Math.min(L.length - at, Math.round((lenSec + r * 2) * sr));
    const amp = (n.v * (k === 'lead' ? 0.24 : k === 'pluck' ? 0.5 : 0.22)) / Math.sqrt(n.p.length);
    for (const p of n.p) {
      const f0 = mtof(p);
      const phases = Array.from({ length: voices }, () => rand());
      const detunes = Array.from({ length: voices }, (_, v) => 2 ** ((SAW_DETUNE[Math.round((v * 6) / Math.max(1, voices - 1))] * spread) / 12));
      const svfL = new Svf();
      const svfR = new Svf();
      const base = k === 'pad' ? 700 : k === 'strings' ? 1600 : k === 'pluck' ? 400 : 1400;
      const envAmt = k === 'pluck' ? 5200 : k === 'lead' ? 3800 : 900;
      const envT = k === 'pluck' ? 0.07 : k === 'lead' ? 0.18 : 0.8;
      for (let i = 0; i < total; i++) {
        if ((i & 31) === 0) {
          const env = Math.exp(-i / (envT * sr));
          const lfo = k === 'pad' ? 0.25 * Math.sin((TWO_PI * 0.2 * (at + i)) / sr) : 0;
          const fc = (base + envAmt * env * (0.5 + n.v)) * (1 + lfo) * (0.6 + this.tone * 0.9);
          svfL.set(fc, sr, 0.9);
          svfR.set(fc * 1.02, sr, 0.9);
        }
        let vib = 1;
        if (k === 'strings' || (k === 'lead' && lenSec > 0.35)) vib = 1 + 0.0035 * Math.sin((TWO_PI * 5.2 * i) / sr) * Math.min(1, i / (0.4 * sr));
        let xl = 0;
        let xr = 0;
        for (let v = 0; v < voices; v++) {
          const dt = (f0 * detunes[v] * vib) / sr;
          let ph = phases[v] + dt;
          if (ph >= 1) ph -= 1;
          phases[v] = ph;
          const saw = 2 * ph - 1 - blep(ph, dt);
          if (v & 1) xr += saw;
          else xl += saw;
          if (v === (voices >> 1)) {
            xl += saw * 0.5;
            xr += saw * 0.5;
          }
        }
        const g = adsrGain(i, sr, lenSec, a, d, s, r) * amp;
        L[at + i] += svfL.tick(xl) * g;
        R![at + i] += svfR.tick(xr) * g;
      }
    }
  }

  process(): void {}
}

class Organ implements Voice {
  readonly tail = 0.2;
  readonly stereo = true;
  private readonly sr: number;
  private lfo = 0;

  constructor(sr: number) {
    this.sr = sr;
  }

  note(n: Note, _index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const sr = this.sr;
    const total = Math.min(L.length - at, Math.round((lenSec + 0.08) * sr));
    const bars = [
      [0.5, 0.35],
      [1, 1],
      [1.5, 0.45],
      [2, 0.6],
      [3, 0.35],
      [4, 0.3],
    ];
    const amp = (n.v * 0.2) / Math.sqrt(n.p.length);
    for (const p of n.p) {
      const f = mtof(p);
      const w = bars.map(([h]) => (TWO_PI * f * h) / sr);
      for (let i = 0; i < total; i++) {
        let x = 0;
        for (let b = 0; b < bars.length; b++) x += bars[b][1] * Math.sin(w[b] * i);
        // key click and percussion on the third harmonic
        x += 0.5 * Math.sin(w[4] * i) * Math.exp(-i / (0.12 * sr));
        const g = Math.min(1, i / (0.004 * sr)) * (i / sr > lenSec ? Math.exp(-(i / sr - lenSec) / 0.015) : 1);
        L[at + i] += x * g * amp;
      }
    }
  }

  /** Leslie-ish: amplitude and pan wobble, a touch of drive. */
  process(L: Float32Array, R: Float32Array | null, n: number): void {
    const w = (TWO_PI * 5.8) / this.sr;
    for (let i = 0; i < n; i++) {
      this.lfo += w;
      const s = Math.sin(this.lfo);
      const x = Math.tanh(L[i] * 1.8) * 0.42;
      L[i] = x * (0.8 + 0.2 * s);
      R![i] = x * (0.8 - 0.2 * s);
    }
  }
}

/** FM electric piano (two-operator, DX-style): cheap enough for dense parts. */
class Piano implements Voice {
  readonly tail = 1;
  readonly stereo = false;
  private readonly sr: number;

  constructor(sr: number) {
    this.sr = sr;
  }

  note(n: Note, _index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const sr = this.sr;
    const amp = (n.v * 0.48) / Math.sqrt(n.p.length);
    const ring = Math.min(lenSec, 3);
    const total = Math.min(L.length - at, Math.round((ring + 0.6) * sr));
    for (const p of n.p) {
      const f = mtof(p);
      const w = (TWO_PI * f) / sr;
      const wt = (TWO_PI * f * 7) / sr;
      const idx0 = 0.6 + 1.6 * n.v;
      const t60 = p < 55 ? 2.4 : p < 72 ? 1.6 : 1.1;
      for (let i = 0; i < total; i++) {
        const t = i / sr;
        let g = Math.exp(-t / t60) * Math.min(1, i / (0.0015 * sr));
        if (t > ring) g *= Math.exp(-(t - ring) / 0.09);
        const idx = idx0 * Math.exp(-t / 0.4);
        const x = Math.sin(w * i + idx * Math.sin(w * i)) + 0.12 * Math.sin(wt * i) * Math.exp(-t / 0.05);
        L[at + i] += x * g * amp;
      }
    }
  }

  process(): void {}
}

class Harpsichord implements Voice {
  readonly tail = 0.8;
  readonly stereo = false;
  private readonly sr: number;
  private readonly c = [] as Biquad[];

  constructor(sr: number) {
    this.sr = sr;
    this.c.push(Biquad.make('hp', 120, sr, 0.7), Biquad.make('peak', 3000, sr, 1, 3));
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const rand = rng(index * 71 + 2);
    const amp = (n.v * 1.5) / Math.sqrt(n.p.length);
    for (const p of n.p) {
      pluck(L, at, this.sr, mtof(p), { len: Math.max(0.1, lenSec), decay: 1.6, bright: 0.97, amp, rand, release: 0.08 });
      pluck(L, at + 30, this.sr, mtof(p + 12), { len: Math.max(0.1, lenSec), decay: 1.1, bright: 0.95, amp: amp * 0.35, rand, release: 0.08 });
    }
  }

  process(L: Float32Array, _R: Float32Array | null, n: number): void {
    for (let i = 0; i < n; i++) L[i] = this.c[1].tick(this.c[0].tick(L[i]));
  }
}

class Bell implements Voice {
  readonly tail = 2.5;
  readonly stereo = false;
  private readonly sr: number;

  constructor(sr: number) {
    this.sr = sr;
  }

  note(n: Note, _index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const sr = this.sr;
    const total = Math.min(L.length - at, Math.round((Math.min(lenSec, 1.5) + 1.5) * sr));
    const amp = (n.v * 0.65) / Math.sqrt(n.p.length);
    for (const p of n.p) {
      const f = mtof(p);
      const wc = (TWO_PI * f) / sr;
      const wm = (TWO_PI * f * 3.5) / sr;
      for (let i = 0; i < total; i++) {
        const t = i / sr;
        const idx = 2.2 * Math.exp(-t / 0.25);
        L[at + i] += Math.sin(wc * i + idx * Math.sin(wm * i)) * Math.exp(-t / 0.7) * amp * Math.min(1, i / 40);
      }
    }
  }

  process(): void {}
}

/**
 * Oscillator voices built from one band-limited waveform through an envelope and a filter: chip pulse,
 * brass, accordion reeds and a bowed fiddle. Mono.
 */
class Osc implements Voice {
  readonly tail: number;
  readonly stereo = false;
  private readonly sr: number;
  private readonly kind: 'chip' | 'brass' | 'accordion' | 'fiddle';
  private readonly tone: number;
  private readonly c: Biquad[];

  constructor(sr: number, kind: 'chip' | 'brass' | 'accordion' | 'fiddle', tone = 0.5) {
    this.sr = sr;
    this.kind = kind;
    this.tone = tone;
    this.tail = kind === 'fiddle' ? 0.25 : 0.12;
    this.c =
      kind === 'fiddle'
        ? [Biquad.make('peak', 700, sr, 1.2, 4), Biquad.make('peak', 2800, sr, 1.5, 5), Biquad.make('lp', 7000, sr, 0.7), Biquad.make('hp', 180, sr, 0.7)]
        : kind === 'accordion'
          ? [Biquad.make('peak', 1100, sr, 1, 3), Biquad.make('lp', 5000, sr, 0.7), Biquad.make('hp', 120, sr, 0.7)]
          : [Biquad.make('hp', 60, sr, 0.7)];
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const sr = this.sr;
    const k = this.kind;
    const rel = k === 'fiddle' ? 0.12 : k === 'accordion' ? 0.05 : 0.03;
    const total = Math.min(L.length - at, Math.round((lenSec + rel * 5) * sr));
    const amp = (n.v * (k === 'chip' ? 0.22 : k === 'brass' ? 0.36 : k === 'fiddle' ? 0.3 : 0.28)) / Math.sqrt(n.p.length);
    const rand = rng(index * 131 + 9);
    for (const p of n.p) {
      const f = mtof(p);
      const svf = new Svf();
      const detunes = k === 'accordion' ? [0.9955, 1.0045] : [1];
      const phases = detunes.map(() => rand());
      // chip: duty cycle by tone; a short pitch drop on the attack for character
      const duty = k === 'chip' ? 0.125 + this.tone * 0.375 : 0.42;
      for (let i = 0; i < total; i++) {
        const t = i / sr;
        let vib = 1;
        if (k === 'fiddle' || (k === 'brass' && lenSec > 0.4)) vib = 1 + (k === 'fiddle' ? 0.004 : 0.0025) * Math.sin(2 * Math.PI * 5.6 * t) * Math.min(1, Math.max(0, (t - 0.15) / 0.25));
        if (k === 'accordion') vib = 1 + 0.0015 * Math.sin(2 * Math.PI * 4.5 * t);
        if (k === 'chip' && n.bend) vib *= 2 ** ((-n.bend * Math.max(0, 1 - t / 0.06)) / 12);
        let x = 0;
        for (let d = 0; d < detunes.length; d++) {
          const dt = (f * detunes[d] * vib) / sr;
          let ph = phases[d] + dt;
          if (ph >= 1) ph -= 1;
          phases[d] = ph;
          if (k === 'brass' || k === 'fiddle') x += 2 * ph - 1 - blep(ph, dt);
          else {
            // band-limited pulse: difference of two saws
            let ph2 = ph + 1 - duty;
            if (ph2 >= 1) ph2 -= 1;
            x += (2 * ph - 1 - blep(ph, dt)) - (2 * ph2 - 1 - blep(ph2, dt));
          }
        }
        x /= detunes.length;
        if (k === 'brass' || k === 'fiddle') {
          if ((i & 15) === 0) {
            // brass opens up as it is blown; the fiddle is steadier
            const swell = k === 'brass' ? Math.min(1, t / 0.06) * (0.75 + 0.25 * Math.exp(-t / 0.3)) : 0.9;
            svf.set(f * 1.5 + (k === 'brass' ? 4200 : 3000) * swell * (0.5 + n.v * 0.6) * (0.6 + this.tone * 0.8), sr, 0.8);
          }
          x = svf.tick(x);
        }
        const a = k === 'fiddle' ? 0.05 : k === 'brass' ? 0.02 : k === 'accordion' ? 0.02 : 0.002;
        let g = Math.min(1, t / a);
        if (k === 'chip') g *= n.mute ? Math.exp(-t / 0.06) : 1;
        if (t > lenSec) g *= Math.exp(-(t - lenSec) / rel);
        if (k === 'fiddle') x += (rand() * 2 - 1) * 0.04 * Math.exp(-t / 0.08); // bow scratch
        L[at + i] += x * g * amp;
      }
    }
  }

  process(L: Float32Array, _R: Float32Array | null, n: number): void {
    const c = this.c;
    for (let i = 0; i < n; i++) {
      let x = L[i];
      for (let j = 0; j < c.length; j++) x = c[j].tick(x);
      L[i] = x;
    }
  }
}

/** Banjo: a bright pluck that dies fast, with the drum-head "plink". */
class Banjo implements Voice {
  readonly tail = 0.4;
  readonly stereo = false;
  private readonly sr: number;
  private readonly c: Biquad[];

  constructor(sr: number) {
    this.sr = sr;
    this.c = [Biquad.make('peak', 1800, sr, 1.4, 6), Biquad.make('hp', 200, sr, 0.7), Biquad.make('lp', 8000, sr, 0.7)];
  }

  note(n: Note, index: number, lenSec: number, L: Float32Array, _R: Float32Array | null, at: number): void {
    const rand = rng(index * 53 + 1);
    const amp = (n.v * 1.7) / Math.sqrt(n.p.length);
    n.p.forEach((p, k) => pluck(L, at + k * 40, this.sr, mtof(p), { len: Math.min(lenSec, 0.9), decay: 0.7, bright: 0.98, amp, rand, release: 0.05 }));
  }

  process(L: Float32Array, _R: Float32Array | null, n: number): void {
    const c = this.c;
    for (let i = 0; i < n; i++) L[i] = c[2].tick(c[1].tick(c[0].tick(L[i])));
  }
}

export function makeVoice(kind: InstrumentKind, sr: number, tone = 0.5): Voice {
  switch (kind) {
    case 'drive':
      return new DriveGuitar(sr, 30 + tone * 12, tone);
    case 'lead':
      return new LeadGuitar(sr, 16 + tone * 14, tone);
    case 'clean':
      return new CleanGuitar(sr);
    case 'pickbass':
      return new PickBass(sr, tone);
    case 'synthbass':
      return new SynthBass(sr, tone);
    case 'subbass':
      return new SynthBass(sr, tone, true);
    case 'supersaw':
      return new SuperSaw(sr, 'lead', tone);
    case 'pluck':
      return new SuperSaw(sr, 'pluck', tone);
    case 'pad':
    case 'choir':
      return new SuperSaw(sr, 'pad', tone);
    case 'strings':
      return new SuperSaw(sr, 'strings', tone);
    case 'organ':
      return new Organ(sr);
    case 'piano':
      return new Piano(sr);
    case 'harpsichord':
      return new Harpsichord(sr);
    case 'bell':
      return new Bell(sr);
    case 'chip':
    case 'brass':
    case 'accordion':
    case 'fiddle':
      return new Osc(sr, kind, tone);
    case 'banjo':
      return new Banjo(sr);
  }
}

// ---------------------------------------------------------------- drums

export interface DrumSample {
  data: Float32Array;
  pan: number;
  /** reverb send */
  verb: number;
}

function noiseBuf(len: number, rand: () => number): Float32Array {
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) b[i] = rand() * 2 - 1;
  return b;
}

/** 808-style metallic tone: six detuned square waves. */
function metal(len: number, sr: number, scale = 1): Float32Array {
  const fs = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * scale * 2.2);
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let x = 0;
    for (const f of fs) x += ((i * f) / sr) % 1 < 0.5 ? 1 : -1;
    b[i] = x / 6;
  }
  return b;
}

/** Synthesize one kit's one-shot samples. */
export function makeKit(kit: 'rock' | 'electro' | 'orchestral', sr: number): Record<DrumVoice, DrumSample> {
  const rand = rng(kit === 'rock' ? 1 : 2);
  const electro = kit === 'electro';
  const len = (s: number) => Math.round(s * sr);

  const kick = new Float32Array(len(electro ? 0.7 : 0.45));
  {
    let ph = 0;
    const click = Biquad.make('hp', 2500, sr);
    for (let i = 0; i < kick.length; i++) {
      const t = i / sr;
      const f = electro ? 48 + 150 * Math.exp(-t / 0.028) : 56 + 120 * Math.exp(-t / 0.022);
      ph += f / sr;
      const body = Math.sin(TWO_PI * ph) * Math.exp(-t / (electro ? 0.32 : 0.16));
      const beater = click.tick(rand() * 2 - 1) * Math.exp(-t / 0.004) * (electro ? 0.3 : 0.6);
      kick[i] = Math.tanh((body + beater) * (electro ? 1.6 : 1.9)) * 0.95;
    }
  }

  const snare = new Float32Array(len(0.4));
  {
    const hp = Biquad.make('hp', electro ? 1800 : 1200, sr);
    const bp = Biquad.make('peak', 5000, sr, 0.8, 4);
    for (let i = 0; i < snare.length; i++) {
      const t = i / sr;
      const tone = (Math.sin(TWO_PI * 185 * t) * 0.8 + Math.sin(TWO_PI * 330 * t) * 0.4) * Math.exp(-t / 0.045);
      const noise = bp.tick(hp.tick(rand() * 2 - 1)) * Math.exp(-t / (electro ? 0.09 : 0.13));
      snare[i] = Math.tanh((tone * 0.9 + noise * 0.9) * 1.4) * 0.8;
    }
  }

  const rim = new Float32Array(len(0.08));
  for (let i = 0; i < rim.length; i++) {
    const t = i / sr;
    rim[i] = (Math.sin(TWO_PI * 1700 * t) * 0.6 + (rand() * 2 - 1) * 0.4) * Math.exp(-t / 0.012) * 0.7;
  }

  const clap = new Float32Array(len(0.35));
  {
    const bp = Biquad.make('bp', 1300, sr, 1.2);
    const n = noiseBuf(clap.length, rand);
    for (let i = 0; i < clap.length; i++) {
      const t = i / sr;
      let env = 0;
      for (const o of [0, 0.011, 0.022, 0.031]) if (t >= o) env = Math.max(env, Math.exp(-(t - o) / (o === 0.031 ? 0.11 : 0.007)));
      clap[i] = bp.tick(n[i]) * env * 2.4;
    }
  }

  const hatLen = len(0.09);
  const hat = new Float32Array(hatLen);
  const ohat = new Float32Array(len(0.55));
  {
    const m = metal(ohat.length, sr);
    const hp1 = Biquad.make('hp', 7500, sr, 0.9);
    const hp2 = Biquad.make('hp', 7000, sr, 0.9);
    for (let i = 0; i < ohat.length; i++) {
      const t = i / sr;
      const x = m[i] * 0.6 + (rand() * 2 - 1) * 0.5;
      if (i < hatLen) hat[i] = hp1.tick(x) * Math.exp(-t / 0.022) * 0.55;
      ohat[i] = hp2.tick(x) * Math.exp(-t / 0.2) * 0.42;
    }
  }

  const ride = new Float32Array(len(1.6));
  const crash = new Float32Array(len(2.2));
  {
    const m = metal(crash.length, sr, 1.37);
    const hpR = Biquad.make('hp', 5000, sr, 0.7);
    const hpC = Biquad.make('hp', 3500, sr, 0.7);
    const bell = Biquad.make('bp', 2600, sr, 4);
    for (let i = 0; i < crash.length; i++) {
      const t = i / sr;
      const nz = rand() * 2 - 1;
      if (i < ride.length) ride[i] = (hpR.tick(m[i] * 0.5 + nz * 0.25) * Math.exp(-t / 0.5) + bell.tick(m[i]) * Math.exp(-t / 0.25) * 0.5) * 0.32;
      crash[i] = hpC.tick(nz * 0.8 + m[i] * 0.4) * (Math.exp(-t / 0.7) * 0.9 + Math.exp(-t / 0.04) * 0.4) * 0.5;
    }
  }

  const tom = (f0: number) => {
    const b = new Float32Array(len(0.5));
    let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      ph += (f0 * (1 + 0.6 * Math.exp(-t / 0.03))) / sr;
      b[i] = (Math.sin(TWO_PI * ph) * Math.exp(-t / 0.22) + (rand() * 2 - 1) * Math.exp(-t / 0.015) * 0.2) * 0.85;
    }
    return b;
  };

  const shaker = new Float32Array(len(0.07));
  {
    const hp = Biquad.make('bp', 7000, sr, 1.5);
    for (let i = 0; i < shaker.length; i++) {
      const t = i / sr;
      shaker[i] = hp.tick(rand() * 2 - 1) * Math.min(1, t / 0.01) * Math.exp(-t / 0.02) * 0.6;
    }
  }

  return {
    kick: { data: kick, pan: 0, verb: electro ? 0.02 : 0.06 },
    snare: { data: snare, pan: 0.03, verb: electro ? 0.2 : 0.3 },
    rim: { data: rim, pan: 0.05, verb: 0.15 },
    clap: { data: clap, pan: 0, verb: 0.3 },
    hat: { data: hat, pan: 0.28, verb: 0.03 },
    ohat: { data: ohat, pan: 0.28, verb: 0.05 },
    ride: { data: ride, pan: 0.4, verb: 0.08 },
    crash: { data: crash, pan: -0.35, verb: 0.15 },
    tomHi: { data: tom(200), pan: 0.3, verb: 0.2 },
    tomMid: { data: tom(150), pan: -0.05, verb: 0.2 },
    tomLo: { data: tom(98), pan: -0.35, verb: 0.2 },
    shaker: { data: shaker, pan: -0.25, verb: 0.05 },
  };
}

