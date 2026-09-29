/** Small DSP toolkit for the song synthesizer: everything renders into plain Float32Arrays. */

/** Deterministic PRNG (mulberry32), so a song renders identically every time. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mtof(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** PolyBLEP residual for band-limited saw/square edges. */
export function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** RBJ biquad, direct form I. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  static make(type: 'lp' | 'hp' | 'bp' | 'peak' | 'lowshelf' | 'highshelf' | 'notch', f: number, sr: number, q = 0.707, gainDb = 0): Biquad {
    const b = new Biquad();
    b.set(type, f, sr, q, gainDb);
    return b;
  }

  set(type: 'lp' | 'hp' | 'bp' | 'peak' | 'lowshelf' | 'highshelf' | 'notch', f: number, sr: number, q = 0.707, gainDb = 0): void {
    const w = (2 * Math.PI * Math.min(f, sr * 0.49)) / sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const alpha = sn / (2 * q);
    const A = 10 ** (gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'lp':
        b0 = (1 - cs) / 2;
        b1 = 1 - cs;
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'hp':
        b0 = (1 + cs) / 2;
        b1 = -(1 + cs);
        b2 = b0;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'bp':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1;
        b1 = -2 * cs;
        b2 = 1;
        a0 = 1 + alpha;
        a1 = -2 * cs;
        a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A;
        b1 = -2 * cs;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cs;
        a2 = 1 - alpha / A;
        break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cs + s);
        b1 = 2 * A * (A - 1 - (A + 1) * cs);
        b2 = A * (A + 1 - (A - 1) * cs - s);
        a0 = A + 1 + (A - 1) * cs + s;
        a1 = -2 * (A - 1 + (A + 1) * cs);
        a2 = A + 1 + (A - 1) * cs - s;
        break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cs + s);
        b1 = -2 * A * (A - 1 + (A + 1) * cs);
        b2 = A * (A + 1 + (A - 1) * cs - s);
        a0 = A + 1 - (A - 1) * cs + s;
        a1 = 2 * (A - 1 - (A + 1) * cs);
        a2 = A + 1 - (A - 1) * cs - s;
        break;
      }
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  tick(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  run(buf: Float32Array, from = 0, to = buf.length): void {
    for (let i = from; i < to; i++) buf[i] = this.tick(buf[i]);
  }
}

/** Topology-preserving state-variable filter (Simper); cheap to modulate. */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  low = 0;
  band = 0;
  high = 0;

  set(f: number, sr: number, q: number): void {
    const g = Math.tan((Math.PI * Math.min(f, sr * 0.45)) / sr);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  tick(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.band = v1;
    this.high = x - this.k * v1 - v2;
    return v2;
  }
}

/** Freeverb (Jezar): 8 combs and 4 allpasses per channel. */
export class Reverb {
  private readonly combs: { buf: Float32Array; i: number; store: number }[][];
  private readonly aps: { buf: Float32Array; i: number }[][];
  feedback: number;
  damp: number;

  constructor(sr: number, size = 0.84, damp = 0.25) {
    const scale = sr / 44100;
    const cl = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const al = [556, 441, 341, 225];
    this.combs = [0, 23].map((spread) => cl.map((l) => ({ buf: new Float32Array(Math.round((l + spread) * scale)), i: 0, store: 0 })));
    this.aps = [0, 23].map((spread) => al.map((l) => ({ buf: new Float32Array(Math.round((l + spread) * scale)), i: 0 })));
    this.feedback = size;
    this.damp = damp;
  }

  /** Process a mono send into a stereo wet signal added to outL/outR. */
  process(input: Float32Array, outL: Float32Array, outR: Float32Array, wet: number): void {
    const fb = this.feedback;
    const d1 = this.damp;
    const d2 = 1 - d1;
    const outs = [outL, outR];
    for (let ch = 0; ch < 2; ch++) {
      const combs = this.combs[ch];
      const aps = this.aps[ch];
      const out = outs[ch];
      for (let n = 0; n < input.length; n++) {
        const x = input[n] * 0.015;
        let acc = 0;
        for (let c = 0; c < 8; c++) {
          const cb = combs[c];
          const y = cb.buf[cb.i];
          cb.store = y * d2 + cb.store * d1;
          cb.buf[cb.i] = x + cb.store * fb;
          if (++cb.i >= cb.buf.length) cb.i = 0;
          acc += y;
        }
        for (let a = 0; a < 4; a++) {
          const ap = aps[a];
          const b = ap.buf[ap.i];
          ap.buf[ap.i] = acc + b * 0.5;
          acc = b - acc;
          if (++ap.i >= ap.buf.length) ap.i = 0;
        }
        out[n] += acc * wet;
      }
    }
  }
}

/** Ping-pong echo with a darkening feedback path. */
export function pingPong(input: Float32Array, outL: Float32Array, outR: Float32Array, delaySamples: number, feedback: number, wet: number, sr: number): void {
  const len = Math.max(1, Math.round(delaySamples));
  const bl = new Float32Array(len);
  const br = new Float32Array(len);
  const lpL = Biquad.make('lp', 3500, sr);
  const lpR = Biquad.make('lp', 3500, sr);
  let i = 0;
  for (let n = 0; n < input.length; n++) {
    const yl = bl[i];
    const yr = br[i];
    bl[i] = input[n] + lpR.tick(yr) * feedback;
    br[i] = lpL.tick(yl) * feedback;
    if (++i >= len) i = 0;
    outL[n] += yl * wet;
    outR[n] += yr * wet;
  }
}

/**
 * Karplus-Strong plucked string. Static notes are tuned with an allpass for the fractional delay,
 * so chords stay in tune; bends and vibrato read the delay line with linear interpolation.
 * Adds into `out` from sample `start`.
 */
export function pluck(
  out: Float32Array,
  start: number,
  sr: number,
  freq: number,
  opts: { len: number; decay: number; bright: number; amp: number; rand: () => number; release?: number; vibrato?: number; bendFrom?: number },
): void {
  const bendFrom = opts.bendFrom ?? 0;
  const vib = opts.vibrato ?? 0;
  const moving = vib > 0 || bendFrom > 0;
  // The two-point average in the loop adds half a sample of delay.
  const loop = sr / freq - 0.5;
  const n = Math.max(2, Math.floor(loop));
  const frac = loop - n;
  const size = Math.ceil(loop * 2 ** ((bendFrom + vib + 0.2) / 12)) + 4;
  const buf = new Float32Array(size);
  // Excitation: lowpassed noise (softer pick when dull) with a pick-position comb for body.
  const lpc = 0.12 + 0.85 * opts.bright;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    prev += lpc * (opts.rand() * 2 - 1 - prev);
    buf[i] = prev;
  }
  const pickPos = Math.max(1, Math.round(n * 0.13));
  for (let i = n - 1; i >= pickPos; i--) buf[i] -= buf[i - pickPos] * 0.6;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  for (let i = 0; i < n; i++) buf[i] -= mean;

  // Loop gain per period for the requested T60, and a damping blend (0.5 = classic average).
  const g = 0.001 ** (1 / (freq * opts.decay));
  const s = 0.5 * (0.35 + 0.65 * (1 - opts.bright));
  const rel = opts.release ?? 0.05;
  const total = Math.min(out.length - start, Math.round((opts.len + rel * 4) * sr));
  const relStart = Math.round(opts.len * sr);
  const relCoef = Math.exp(-1 / Math.max(1, rel * sr));
  const C = (1 - frac) / (1 + frac);
  const bendLen = 0.08 * sr;
  const vibStart = 0.22 * sr;
  const vibW = (2 * Math.PI * 5.4) / sr;
  let w = n;
  let r = 0;
  let last = 0;
  let apX = 0;
  let apY = 0;
  let amp = opts.amp;
  for (let i = 0; i < total; i++) {
    let y: number;
    if (!moving) {
      y = buf[r];
      if (++r >= size) r = 0;
    } else {
      let semis = 0;
      if (bendFrom > 0 && i < bendLen) semis -= bendFrom * (1 - i / bendLen) ** 2;
      if (vib > 0 && i > vibStart) semis += vib * Math.sin(vibW * (i - vibStart)) * Math.min(1, (i - vibStart) / (0.3 * sr));
      const d = loop * 2 ** (-semis / 12);
      let p = w - d;
      if (p < 0) p += size;
      const i0 = Math.floor(p);
      const t = p - i0;
      y = buf[i0] * (1 - t) + buf[i0 + 1 >= size ? 0 : i0 + 1] * t;
    }
    const avg = (1 - s) * y + s * last;
    last = y;
    let fb = avg;
    if (!moving) {
      fb = C * avg + apX - C * apY;
      apX = avg;
      apY = fb;
    }
    buf[w] = fb * g;
    if (++w >= size) w = 0;
    if (i >= relStart) amp *= relCoef;
    out[start + i] += y * amp;
  }
}

/** Soft clipper for the amp: asymmetric tanh keeps even harmonics. */
export function drive(buf: Float32Array, gain: number, bias = 0.08): void {
  const off = Math.tanh(bias * gain);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh((buf[i] + bias) * gain) - off;
}

/**
 * Bus compressor/limiter: envelope-following gain reduction above `threshold`, then a soft clip
 * as a safety net.
 */
export function limit(l: Float32Array, r: Float32Array, sr: number, threshold = 0.7, ratio = 6): void {
  const att = Math.exp(-1 / (0.002 * sr));
  const rel = Math.exp(-1 / (0.12 * sr));
  let env = 0;
  for (let i = 0; i < l.length; i++) {
    const x = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
    let g = 1;
    if (env > threshold) g = (threshold + (env - threshold) / ratio) / env;
    l[i] = softClip(l[i] * g);
    r[i] = softClip(r[i] * g);
  }
}

function softClip(x: number): number {
  if (x > 0.95) return 0.95 + 0.05 * Math.tanh((x - 0.95) / 0.05);
  if (x < -0.95) return -0.95 + 0.05 * Math.tanh((x + 0.95) / 0.05);
  return x;
}

export function peak(...bufs: Float32Array[]): number {
  let m = 0;
  for (const b of bufs) for (let i = 0; i < b.length; i++) if (Math.abs(b[i]) > m) m = Math.abs(b[i]);
  return m;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / Math.max(1, buf.length));
}
