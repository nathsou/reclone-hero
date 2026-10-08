import { MasterLimiter } from './master.ts';
import { Biquad, dbToGain, Reverb, rng } from './dsp.ts';
import { makeKit, makeVoice } from './instruments.ts';
import type { DrumSample, Voice } from './instruments.ts';
import { Tempo } from './score.ts';
import type { DrumPart, DrumVoice, Note, Part, SongDef } from './score.ts';

/** Samples per render block. */
const BLOCK = 1 << 13;

export interface Block {
  /** player stem, stereo */
  pl: Float32Array;
  pr: Float32Array;
  /** everything else */
  bl: Float32Array;
  br: Float32Array;
  n: number;
  /** 0..1 of the requested range */
  progress: number;
}

interface NoteTrack {
  voice: Voice;
  part: Part;
  notes: Note[];
  player: boolean;
  starts: Int32Array;
  lens: Float32Array;
  next: number;
  activeEnd: number;
  L: Float32Array;
  R: Float32Array | null;
  gl: number;
  gr: number;
}

interface DrumTrack {
  kit: Record<DrumVoice, DrumSample>[];
  hits: { at: number; k: DrumVoice; v: number; variant: number; choke: number }[];
  next: number;
  L: Float32Array;
  R: Float32Array;
  S: Float32Array;
  gain: number;
  verb: number;
}

/** Stateful stereo ping-pong echo. */
class Echo {
  private readonly l: Float32Array;
  private readonly r: Float32Array;
  private i = 0;
  private readonly lpL: Biquad;
  private readonly lpR: Biquad;
  private readonly feedback: number;

  constructor(samples: number, feedback: number, sr: number) {
    this.feedback = feedback;
    this.l = new Float32Array(Math.max(1, Math.round(samples)));
    this.r = new Float32Array(this.l.length);
    this.lpL = Biquad.make('lp', 3200, sr);
    this.lpR = Biquad.make('lp', 3200, sr);
  }

  process(input: Float32Array, outL: Float32Array, outR: Float32Array, n: number): void {
    const size = this.l.length;
    for (let k = 0; k < n; k++) {
      const yl = this.l[this.i];
      const yr = this.r[this.i];
      this.l[this.i] = input[k] + this.lpR.tick(yr) * this.feedback;
      this.r[this.i] = this.lpL.tick(yl) * this.feedback;
      if (++this.i >= size) this.i = 0;
      outL[k] += yl;
      outR[k] += yr;
    }
  }
}

function panGains(pan: number): [number, number] {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2];
}

/** Length of the song audio in seconds (last note plus ring-out). */
export function songSeconds(def: SongDef): number {
  return new Tempo(def.tempo).toSec(def.lengthBeats) + 2.5;
}

/**
 * Render [from, to) seconds of a song block by block. A generator, so callers can report progress
 * and yield to the event loop between blocks.
 */
function* renderMix(def: SongDef, sr: number, from = 0, to = songSeconds(def), stats?: Map<string, number>): Generator<Block> {
  const tempo = new Tempo(def.tempo);
  const startS = Math.round(from * sr);
  const endS = Math.round(to * sr);
  // Start a little early so reverb tails and ringing notes are in place at the window start.
  const preroll = from > 0 ? Math.round(3 * sr) : 0;
  const renderStart = Math.max(0, startS - preroll);
  const toS = (beat: number) => Math.round(tempo.toSec(beat) * sr);

  const tracks: NoteTrack[] = [];
  const addPart = (part: Part, player: boolean) => {
    if (!part.notes.length) return;
    const voice = makeVoice(part.inst, sr, part.tone ?? 0.5, part.chorus ?? 0.2);
    const notes = [...part.notes].sort((a, b) => a.b - b.b);
    const starts = new Int32Array(notes.length);
    const lens = new Float32Array(notes.length);
    let maxLen = 0;
    notes.forEach((n, i) => {
      starts[i] = toS(n.b);
      lens[i] = tempo.toSec(n.b + n.d) - tempo.toSec(n.b);
      maxLen = Math.max(maxLen, lens[i]);
    });
    const size = BLOCK + Math.ceil((Math.min(maxLen, 16) + voice.tail + 0.3) * sr);
    const [gl, gr] = panGains(part.pan ?? 0);
    const t: NoteTrack = { voice, part, notes, player, starts, lens, next: 0, activeEnd: 0, L: new Float32Array(size), R: voice.stereo ? new Float32Array(size) : null, gl, gr };
    // Notes that start before the render window are skipped.
    while (t.next < notes.length && starts[t.next] < renderStart) t.next++;
    tracks.push(t);
  };
  for (const p of def.player) addPart(p, true);
  for (const p of def.backing) addPart(p, false);

  const drums: DrumTrack[] = def.drums.map((d: DrumPart, di) => {
    const kit = Array.from({ length: 3 }, (_, i) => makeKit(d.kit, sr, i));
    const rand = rng(99 + di);
    const human = d.kit === 'electro' ? 0 : 1;
    const openBeats = new Set(d.hits.filter(h => h.k === 'ohat').map(h => h.b));
    const hits = d.hits.filter(h => h.k !== 'hat' || !openBeats.has(h.b))
      .sort((a, b) => a.b - b.b)
      .map((h, i) => ({ variant: i % 3, choke: Infinity, at: Math.max(0, toS(h.b) + Math.round(human * (rand() - 0.5) * 0.006 * sr)), k: h.k, v: h.v * (1 - human * rand() * 0.1) }))
      // humanising can swap two hits on the same beat: play them in the order they now fall, or
      // a block edge between them would cut the start off the later one
      .sort((a, b) => a.at - b.at);
    // A closed or reopened hat damps the preceding open hat; fade its final 3 ms.
    let nextHat = Infinity;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (h.k === 'ohat') h.choke = nextHat;
      if (h.k === 'hat' || h.k === 'ohat') nextHat = h.at;
    }
    let next = 0;
    while (next < hits.length && hits[next].at < renderStart) next++;
    const size = BLOCK + Math.ceil(2.4 * sr);
    return { kit, hits, next, L: new Float32Array(size), R: new Float32Array(size), S: new Float32Array(size), gain: (d.gain ?? 1) * 0.45, verb: d.verb ?? 1 };
  });

  // Sidechain pumping follows every kick.
  const kicks = drums.flatMap((d) => d.hits.filter((h) => h.k === 'kick').map((h) => h.at)).sort((a, b) => a - b);
  let kickIdx = 0;
  const beatSec = 60 / tempo.bpmAt(0);
  const pumpT = 0.3 * beatSec * sr;

  const verbP = new Reverb(sr, 0.82, 0.3);
  const verbB = new Reverb(sr, 0.86, 0.35);
  const echoP = new Echo(0.75 * beatSec * sr, 0.38, sr);
  const echoB = new Echo(0.75 * beatSec * sr, 0.3, sr);
  const hpB = [Biquad.make('hp', 28, sr), Biquad.make('hp', 28, sr)];

  const pl = new Float32Array(BLOCK);
  const pr = new Float32Array(BLOCK);
  const bl = new Float32Array(BLOCK);
  const br = new Float32Array(BLOCK);
  const sendVP = new Float32Array(BLOCK);
  const sendVB = new Float32Array(BLOCK);
  const sendEP = new Float32Array(BLOCK);
  const sendEB = new Float32Array(BLOCK);
  const pump = new Float32Array(BLOCK);
  const hasPump = tracks.some(t => (t.part.pump ?? 0) > 0);
  const hasVerbP = tracks.some(t => t.player && (t.part.verb ?? 0.15) > 0);
  const hasVerbB = tracks.some(t => !t.player && (t.part.verb ?? 0.15) > 0) || drums.some(d => d.verb > 0);
  const hasEchoP = tracks.some(t => t.player && (t.part.echo ?? 0) > 0);
  const hasEchoB = tracks.some(t => !t.player && (t.part.echo ?? 0) > 0);
  const trim = dbToGain(def.levelDb ?? 0);
  const lp = Array.from({ length: 4 }, () => Biquad.make('lp', Math.min(15000, sr * 0.4), sr, 0.7));

  for (let c = renderStart; c < endS; c += BLOCK) {
    const n = Math.min(BLOCK, endS - c);
    for (const b of [pl, pr, bl, br, sendVP, sendVB, sendEP, sendEB]) b.fill(0, 0, n);

    // pump envelope for this block
    if (hasPump) {
      while (kickIdx + 1 < kicks.length && kicks[kickIdx + 1] <= c) kickIdx++;
      let k = kickIdx;
      for (let i = 0; i < n; i++) {
        const s = c + i;
        while (k + 1 < kicks.length && kicks[k + 1] <= s) k++;
        const since = kicks.length && kicks[k] <= s ? s - kicks[k] : Infinity;
        pump[i] = since < 0.004 * sr ? since / (0.004 * sr) : Math.exp(-(since - 0.004 * sr) / pumpT);
        if (since === Infinity) pump[i] = 0;
      }
    }

    for (const t of tracks) {
      // Keep processing through note releases and filter/chorus ring-out, but skip
      // tracks that have not entered yet or have finished their arrangement section.
      if (c >= t.activeEnd && (t.next >= t.notes.length || t.starts[t.next] >= c + n)) continue;
      while (t.next < t.notes.length && t.starts[t.next] < c + n) {
        const i = t.next++;
        t.voice.note(t.notes[i], i, t.lens[i], t.L, t.R, t.starts[i] - c);
        t.activeEnd = Math.max(t.activeEnd, t.starts[i] + Math.ceil((t.lens[i] + t.voice.tail + 0.3) * sr));
      }
      t.voice.process(t.L, t.R, n);
      const g = t.part.gain ?? 1;
      const pumpAmt = t.part.pump ?? 0;
      const outL = t.player ? pl : bl;
      const outR = t.player ? pr : br;
      const sv = t.player ? sendVP : sendVB;
      const se = t.player ? sendEP : sendEB;
      const verb = t.part.verb ?? 0.15;
      const echo = t.part.echo ?? 0;
      if (stats) {
        let e = 0;
        for (let i = 0; i < n; i++) e += (t.L[i] * g) ** 2 + ((t.R ? t.R[i] : t.L[i]) * g) ** 2;
        const key = `${t.player ? 'player' : 'backing'}:${t.part.inst}`;
        stats.set(key, (stats.get(key) ?? 0) + e);
      }
      for (let i = 0; i < n; i++) {
        const pg = pumpAmt ? g * (1 - pumpAmt * pump[i]) : g;
        const l = t.L[i] * pg;
        const r = t.R ? t.R[i] * pg : l;
        const ol = l * t.gl;
        const or = r * t.gr;
        outL[i] += ol;
        outR[i] += or;
        const mono = (ol + or) * 0.5;
        sv[i] += mono * verb;
        se[i] += mono * echo;
      }
      shift(t.L, n);
      if (t.R) shift(t.R, n);
    }

    for (const d of drums) {
      while (d.next < d.hits.length && d.hits[d.next].at < c + n) {
        const h = d.hits[d.next++];
        const s = d.kit[h.variant][h.k];
        const [gl, gr] = panGains(s.pan);
        const off = h.at - c;
        const len = Math.min(s.data.length, d.L.length - off, Math.max(0, h.choke - h.at));
        const v = h.v * d.gain;
        for (let i = 0; i < len; i++) {
          const choke = h.choke - h.at < s.data.length ? Math.min(1, (len - i) / (sr * 0.003)) : 1;
          const x = s.data[i] * v * choke;
          d.L[off + i] += x * gl;
          d.R[off + i] += x * gr;
          d.S[off + i] += x * s.verb * d.verb;
        }
      }
      let e = 0;
      for (let i = 0; i < n; i++) {
        bl[i] += d.L[i];
        br[i] += d.R[i];
        sendVB[i] += d.S[i];
        e += d.L[i] ** 2 + d.R[i] ** 2;
      }
      if (stats) stats.set('backing:drums', (stats.get('backing:drums') ?? 0) + e);
      shift(d.L, n);
      shift(d.R, n);
      shift(d.S, n);
    }

    const vp = sendVP.subarray(0, n);
    const vb = sendVB.subarray(0, n);
    if (hasVerbP) verbP.process(vp, pl.subarray(0, n), pr.subarray(0, n), 1);
    if (hasVerbB) verbB.process(vb, bl.subarray(0, n), br.subarray(0, n), 1);
    if (hasEchoP) echoP.process(sendEP, pl, pr, n);
    if (hasEchoB) echoB.process(sendEB, bl, br, n);

    // Remove DC and excessive top-end before the shared lookahead stage.
    for (let i = 0; i < n; i++) {
      pl[i] = lp[0].tick(pl[i]) * trim;
      pr[i] = lp[1].tick(pr[i]) * trim;
      bl[i] = lp[2].tick(hpB[0].tick(bl[i])) * trim;
      br[i] = lp[3].tick(hpB[1].tick(br[i])) * trim;
    }

    if (c + n > startS) {
      const skip = Math.max(0, startS - c);
      yield {
        pl: pl.subarray(skip, n),
        pr: pr.subarray(skip, n),
        bl: bl.subarray(skip, n),
        br: br.subarray(skip, n),
        n: n - skip,
        progress: Math.min(1, (c + n - renderStart) / Math.max(1, endS - renderStart)),
      };
    }
  }
}

function shift(buf: Float32Array, n: number): void {
  buf.copyWithin(0, n);
  buf.fill(0, buf.length - n);
}

/** Peek one block ahead without retaining the mixer's reused buffers. */
export function* renderSong(def: SongDef, sr: number, from = 0, to = songSeconds(def), stats?: Map<string, number>): Generator<Block> {
  const raw = renderMix(def, sr, from, to, stats);
  const limiter = new MasterLimiter(sr);
  const copy = (b: Block): Block => ({ ...b, pl: b.pl.slice(), pr: b.pr.slice(), bl: b.bl.slice(), br: b.br.slice() });
  let first = raw.next();
  if (first.done) return;
  let current = copy(first.value);
  for (;;) {
    const next = raw.next();
    const future = next.done ? null : next.value;
    const ahead = future ? Math.min(limiter.lookahead, future.n) : 0;
    const peaks = new Float32Array(current.n + ahead);
    for (let i = 0; i < current.n; i++) peaks[i] = Math.max(Math.abs(current.pl[i] + current.bl[i]), Math.abs(current.pr[i] + current.br[i]));
    for (let i = 0; i < ahead; i++) peaks[current.n + i] = Math.max(Math.abs(future!.pl[i] + future!.bl[i]), Math.abs(future!.pr[i] + future!.br[i]));
    const gains = limiter.gains(peaks, current.n);
    for (let i = 0; i < current.n; i++) {
      const g = gains[i];
      current.pl[i] *= g; current.pr[i] *= g; current.bl[i] *= g; current.br[i] *= g;
      if (stats) stats.set('gr', (stats.get('gr') ?? 0) + 1 - g);
    }
    yield current;
    if (!future) break;
    current = copy(future);
  }
}
