import { Tempo } from './score.ts';
import type { InstrumentKind, Note, SongDef } from './score.ts';

/**
 * Chart the player's part for all four difficulties.
 *
 * Expert plays every note. Lower difficulties keep the metrically strongest notes subject to a
 * minimum spacing, then lanes are re-assigned from scratch with fewer frets. Lane choice is a
 * Viterbi search over fret positions: moving up the neck in pitch moves right on the highway, big
 * leaps move further, repeated pitches stay put, and the part drifts towards the frets that match its
 * overall register. Resets (going back down while the melody climbs) are cheap only at rests.
 */

export const RES = 480;
type Diff = 'easy' | 'medium' | 'hard' | 'expert';
const DIFFS: Diff[] = ['easy', 'medium', 'hard', 'expert'];

interface ChartNote {
  b: number;
  d: number;
  p: number[];
  v: number;
  mute: boolean;
  /** the instrument keeps sounding while held, so a long note can be a sustain */
  holds: boolean;
}

/** Instruments whose notes ring for as long as they are held. Plucks, bells and pianos die away. */
const HOLDS: Record<InstrumentKind, boolean> = {
  drive: true,
  lead: true,
  clean: true,
  supersaw: true,
  pad: true,
  strings: true,
  organ: true,
  choir: true,
  pluck: false,
  bell: false,
  piano: false,
  harpsichord: false,
  pickbass: false,
  synthbass: false,
  subbass: false,
};

export interface Placed {
  b: number;
  /** lanes, 0 = green */
  lanes: number[];
  /** sustain in beats, 0 = none */
  sus: number;
  forceStrum: boolean;
}

/**
 * lanes, largest chord, minimum spacing (s), rhythmic grid (beats), most notes within a beat either
 * side, and the share of Expert's notes to keep at most
 */
const SETTINGS: Record<Diff, { lanes: number; chord: number; minGap: number; grid: number; cap: number; budget: number }> = {
  easy: { lanes: 3, chord: 1, minGap: 0.42, grid: 0.5, cap: 2, budget: 0.4 },
  medium: { lanes: 4, chord: 2, minGap: 0.2, grid: 0.5, cap: 3, budget: 0.6 },
  hard: { lanes: 5, chord: 2, minGap: 0.105, grid: 0.25, cap: 5, budget: 0.8 },
  expert: { lanes: 5, chord: 3, minGap: 0, grid: 0, cap: Infinity, budget: 1 },
};

/** Beats in the bar containing `b`, and the beat position within it. */
function barInfo(def: SongDef, b: number): { pos: number; len: number } {
  const sigs = [...def.timeSigs].sort((a, c) => a.beat - c.beat);
  let start = 0;
  let len = 4;
  for (const s of sigs) {
    if (s.beat > b) break;
    start = s.beat;
    len = (s.num * 4) / s.den;
  }
  const pos = (b - start) % len;
  return { pos: pos < 0 ? pos + len : pos, len };
}

function near(x: number, step: number): boolean {
  const r = x / step;
  return Math.abs(r - Math.round(r)) < 1e-3;
}

function strength(def: SongDef, n: ChartNote, prevGap: number): number {
  const { pos, len } = barInfo(def, n.b);
  let s: number;
  if (near(pos, len)) s = 5;
  else if (len % 2 === 0 && near(pos, len / 2)) s = 4;
  else if (near(pos, 1)) s = 3;
  else if (near(pos, 0.5)) s = 2;
  else if (near(pos, 0.25)) s = 1;
  else s = 0.5;
  if (n.v >= 0.95) s += 1.5;
  if (n.d >= 1) s += 1;
  else if (n.d >= 0.5) s += 0.4;
  if (prevGap >= 1) s += 1.2;
  if (n.p.length > 1) s += 0.3;
  if (n.mute) s -= 0.4;
  return s;
}

function mergeChords(notes: (Note & { holds: boolean })[]): ChartNote[] {
  const sorted = [...notes].sort((a, b) => a.b - b.b || a.p[0] - b.p[0]);
  const out: ChartNote[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.b - n.b) < 1e-4) {
      last.p = [...new Set([...last.p, ...n.p])].sort((a, b) => a - b);
      last.d = Math.max(last.d, n.d);
      last.v = Math.max(last.v, n.v);
      last.holds ||= n.holds;
      continue;
    }
    out.push({ b: n.b, d: n.d, p: [...n.p], v: n.v, mute: !!n.mute, holds: n.holds });
  }
  return out;
}

function thin(def: SongDef, notes: ChartNote[], diff: Diff, tempo: Tempo): ChartNote[] {
  const cfg = SETTINGS[diff];
  if (diff === 'expert') return notes;
  const secs = notes.map((n) => tempo.toSec(n.b));
  // Equal strengths are taken in a scattered order, so the budget thins the whole song evenly.
  const order = notes.map((n, i) => ({ i, s: strength(def, n, i ? n.b - notes[i - 1].b : 99), h: Math.imul(i + 1, 2654435761) >>> 0 }));
  order.sort((a, b) => b.s - a.s || a.h - b.h);
  const budget = Math.round(notes.length * cfg.budget);
  const kept: number[] = [];
  const keptSecs: number[] = [];
  for (const { i } of order) {
    if (kept.length >= budget) break;
    const n = notes[i];
    // Easy and Medium stay on the eighth-note grid (sixteenths only in slow songs on Medium).
    const grid = diff === 'medium' && tempo.bpmAt(n.b) < 100 ? 0.25 : cfg.grid;
    const { pos } = barInfo(def, n.b);
    if (grid && !near(pos, grid)) continue;
    const t = secs[i];
    // binary search for neighbours among kept notes
    let lo = 0;
    let hi = keptSecs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (keptSecs[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const before = lo > 0 ? t - keptSecs[lo - 1] : Infinity;
    const after = lo < keptSecs.length ? keptSecs[lo] - t : Infinity;
    // A held note blocks the notes under it on lower difficulties.
    const prevIdx = lo > 0 ? kept[lo - 1] : -1;
    const heldOver = prevIdx >= 0 && notes[prevIdx].holds && notes[prevIdx].d >= 1 && tempo.toSec(notes[prevIdx].b + notes[prevIdx].d * 0.8) > t;
    if (before < cfg.minGap || after < cfg.minGap || heldOver) continue;
    // density: notes already kept within a beat either side
    let dense = 0;
    for (let j = lo - 1; j >= 0 && notes[kept[j]].b > n.b - 1 + 1e-6; j--) dense++;
    for (let j = lo; j < kept.length && notes[kept[j]].b < n.b + 1 - 1e-6; j++) dense++;
    if (dense + 1 > cfg.cap) continue;
    kept.splice(lo, 0, i);
    keptSecs.splice(lo, 0, t);
  }
  return kept.map((i) => notes[i]);
}

/** Chord shape: lane offsets from the root lane. */
function shape(n: ChartNote, diff: Diff): number[] {
  const cfg = SETTINGS[diff];
  if (n.p.length === 1 || cfg.chord === 1) return [0];
  // Medium only keeps chords that are held or accented.
  if (diff === 'medium' && n.d < 1 && n.v < 0.95) return [0];
  const pcs = new Set(n.p.map((p) => p % 12));
  const span = n.p[n.p.length - 1] - n.p[0];
  if (pcs.size === 1) return [0, 2]; // octaves
  if (pcs.size === 2 || cfg.chord === 2) return span >= 12 && pcs.size === 2 && n.p.length === 2 ? [0, 2] : [0, 1];
  return n.v >= 0.95 || n.d >= 1 ? [0, 1, 2] : [0, 1];
}

function desiredStep(semis: number): number {
  const a = Math.abs(semis);
  return a <= 2 ? 1 : a <= 5 ? 1.5 : a <= 9 ? 2 : 3;
}

/** Cost of moving from lane `a` (pitch pa) to lane `b` (pitch pb); `same` when the chord shapes match. */
function stepCost(pa: number, pb: number, a: number, b: number, same: boolean): number {
  const dp = pb - pa;
  const dl = b - a;
  if (dp === 0 && same) return dl === 0 ? 0 : 3 + Math.abs(dl);
  if (dp === 0) return Math.abs(dl) * 0.8;
  if (Math.sign(dl) === Math.sign(dp)) return 0.45 * Math.abs(Math.abs(dl) - desiredStep(dp));
  if (dl === 0) return 2.6;
  return 4 + Math.abs(dl);
}

function assignLanes(notes: ChartNote[], diff: Diff, tempo: Tempo, range: [number, number]): Placed[] {
  const K = SETTINGS[diff].lanes;
  const N = notes.length;
  if (!N) return [];
  const shapes = notes.map((n) => shape(n, diff));
  const widths = shapes.map((sh) => sh[sh.length - 1]);
  const secs = notes.map((n) => tempo.toSec(n.b));
  const pitch = notes.map((n) => n.p[0]);
  const sig = notes.map((n, i) => `${n.p.length}:${shapes[i].join()}`);
  const [pmin, pmax] = range;
  const target = (p: number) => ((p - pmin) / Math.max(1, pmax - pmin)) * (K - 1);
  const anchor = (i: number, lane: number) => {
    // local register: the average pitch of nearby notes pulls the hand position
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(0, i - 6); j <= Math.min(N - 1, i + 6); j++) {
      sum += pitch[j];
      cnt++;
    }
    const center = lane + widths[i] / 2;
    return 0.18 * Math.abs(center - target(pitch[i])) + 0.12 * Math.abs(center - target(sum / cnt));
  };
  // Second-order Viterbi: the state is (lane of the previous note, lane of this note), so a riff
  // that keeps returning to a pedal note still climbs or falls between the notes around it.
  const S = K * K;
  let cost = new Float64Array(S).fill(Infinity);
  const back: Int16Array[] = [];
  for (let b = 0; b + widths[0] < K; b++) cost[b] = anchor(0, b); // state (0, b) for the first note
  back.push(new Int16Array(S).fill(-1));
  for (let i = 1; i < N; i++) {
    const next = new Float64Array(S).fill(Infinity);
    const bk = new Int16Array(S).fill(-1);
    const dt = secs[i] - secs[i - 1];
    const relax = dt > 0.9 ? 0.2 : dt > 0.45 ? 0.55 : 1;
    const same = sig[i] === sig[i - 1];
    const dt2 = i >= 2 ? secs[i] - secs[i - 2] : Infinity;
    const w2 = dt2 < 0.8 ? 0.6 : 0;
    const same2 = i >= 2 && sig[i] === sig[i - 2];
    for (let b = 0; b + widths[i] < K; b++) {
      const an = anchor(i, b);
      for (let a = 0; a + widths[i - 1] < K; a++) {
        let k = stepCost(pitch[i - 1], pitch[i], a, b, same) * relax;
        if (dt < 0.2 && Math.abs(b - a) >= 3) k += 1.5;
        const base = k + an;
        const xs = i === 1 ? 1 : K;
        for (let x = 0; x < xs; x++) {
          const prev = cost[x * K + a];
          if (prev === Infinity) continue;
          let total = prev + base;
          if (w2) total += w2 * Math.min(3, stepCost(pitch[i - 2], pitch[i], x, b, same2));
          if (total < next[a * K + b]) {
            next[a * K + b] = total;
            bk[a * K + b] = x;
          }
        }
      }
    }
    cost = next;
    back.push(bk);
  }
  let best = 0;
  for (let s2 = 1; s2 < S; s2++) if (cost[s2] < cost[best]) best = s2;
  const roots = new Int8Array(N);
  let a = Math.floor(best / K);
  let b = best % K;
  for (let i = N - 1; i >= 0; i--) {
    roots[i] = b;
    const x = back[i][a * K + b];
    b = a;
    a = x < 0 ? 0 : x;
  }

  const out: Placed[] = [];
  for (let i = 0; i < N; i++) {
    const n = notes[i];
    const next = notes[i + 1];
    let sus = 0;
    // Sustain notes that ring for at least ~0.45 s (a dotted eighth is not a sustain at dance tempos).
    if (n.holds && !n.mute && n.d >= 0.75 && tempo.toSec(n.b + n.d) - secs[i] >= 0.45) {
      sus = n.d - 0.25;
      if (next) sus = Math.min(sus, next.b - n.b - 0.25);
      if (sus < 0.5) sus = 0;
    }
    const lanes = shapes[i].map((o) => roots[i] + o);
    const prev = out[i - 1];
    // Palm-muted chugs are strummed even when close enough to be natural HOPOs.
    const closeTo = prev && n.b - prev.b <= 0.34;
    const forceStrum = !!(n.mute && closeTo && lanes.length === 1 && prev.lanes.join() !== lanes.join());
    out.push({ b: n.b, lanes, sus, forceStrum });
  }
  return out;
}

export interface GeneratedChart {
  text: string;
  /** notes per difficulty, for tests and song.ini */
  placed: Record<Diff, Placed[]>;
  starPower: [number, number][];
}

export function generateChart(def: SongDef): GeneratedChart {
  const tempo = new Tempo(def.tempo);
  const base = mergeChords(def.player.flatMap((p) => p.notes.map((n) => ({ ...n, holds: HOLDS[p.inst] }))));
  let pmin = Infinity;
  let pmax = -Infinity;
  for (const n of base) {
    pmin = Math.min(pmin, n.p[0]);
    pmax = Math.max(pmax, n.p[0]);
  }
  const placed = {} as Record<Diff, Placed[]>;
  for (const d of DIFFS) placed[d] = assignLanes(thin(def, base, d, tempo), d, tempo, [pmin, pmax]);
  const starPower = pickStarPower(def, placed, tempo);

  const T = (b: number) => Math.round(b * RES);
  const lines: string[] = [];
  lines.push('[Song]', '{');
  const meta: [string, string][] = [
    ['Name', def.name],
    ['Artist', def.artist],
    ['Charter', 'reclone hero'],
    ['Album', def.album],
    ['Year', `, ${def.year}`],
    ['Genre', def.genre],
  ];
  for (const [k, v] of meta) lines.push(`  ${k} = "${v}"`);
  lines.push(`  Offset = 0`, `  Resolution = ${RES}`, `  Player2 = bass`, `  Difficulty = 0`, `  PreviewStart = 0`, `  PreviewEnd = 0`, `  MediaType = "cd"`, '}');

  lines.push('[SyncTrack]', '{');
  const sync: [number, string][] = [];
  for (const s of def.timeSigs) sync.push([T(s.beat), s.den === 4 ? `TS ${s.num}` : `TS ${s.num} ${Math.log2(s.den)}`]);
  for (const t of def.tempo) sync.push([T(t.beat), `B ${Math.round(t.bpm * 1000)}`]);
  sync.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? 1 : -1));
  for (const [t, v] of sync) lines.push(`  ${t} = ${v}`);
  lines.push('}');

  lines.push('[Events]', '{');
  for (const s of def.sections) lines.push(`  ${T(s.beat)} = E "section ${s.name}"`);
  lines.push('}');

  const names: Record<Diff, string> = { easy: 'EasySingle', medium: 'MediumSingle', hard: 'HardSingle', expert: 'ExpertSingle' };
  for (const d of DIFFS) {
    const rows: [number, number, string][] = [];
    for (const p of placed[d]) {
      for (const lane of p.lanes) rows.push([T(p.b), 0, `N ${lane} ${T(p.sus)}`]);
      if (p.forceStrum) rows.push([T(p.b), 1, `N 5 0`]);
    }
    for (const [a, b] of starPower) {
      if (placed[d].some((p) => p.b >= a && p.b < b)) rows.push([T(a), 2, `S 2 ${T(b - a)}`]);
    }
    for (const [a, b] of def.solos) {
      rows.push([T(a), 3, 'E solo']);
      rows.push([T(b), 3, 'E soloend']);
    }
    rows.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    lines.push(`[${names[d]}]`, '{');
    for (const [t, , v] of rows) lines.push(`  ${t} = ${v}`);
    lines.push('}');
  }
  return { text: lines.join('\r\n') + '\r\n', placed, starPower };
}

/** Two-bar star power phrases every 12–22 seconds, placed where Easy still has a few notes. */
function pickStarPower(def: SongDef, placed: Record<Diff, Placed[]>, tempo: Tempo): [number, number][] {
  const out: [number, number][] = [];
  const bars: number[] = [];
  for (let b = 0; b < def.lengthBeats; ) {
    bars.push(b);
    b += barInfo(def, b).len;
  }
  const count = (list: Placed[], a: number, z: number) => list.filter((p) => p.b >= a && p.b < z).length;
  let lastEnd = -Infinity;
  const inSolo = (a: number, z: number) => def.solos.some(([s, e]) => a < e && z > s);
  const songEnd = tempo.toSec(def.lengthBeats);
  for (;;) {
    const lo = Number.isFinite(lastEnd) ? lastEnd + 12 : 6;
    let best: [number, number] | null = null;
    // Look 12–22 s ahead; widen the window across long breakdowns.
    for (let hi = lo + 10; !best && lo < songEnd && hi < songEnd + 10; hi += 10) {
      let bestScore = -Infinity;
      for (let i = 0; i + 2 < bars.length; i++) {
        const a = bars[i];
        const z = bars[i + 2];
        const t = tempo.toSec(a);
        if (t < lo || t > hi || inSolo(a, z)) continue;
        const easy = count(placed.easy, a, z);
        const ex = count(placed.expert, a, z);
        if (easy < 2 || ex < 4) continue;
        // prefer phrases that start a section, with a steady amount of notes, sooner rather than later
        const onSection = def.sections.some((s) => Math.abs(s.beat - a) < 1e-3) ? 2 : 0;
        const score = onSection + Math.min(easy, 6) + Math.min(ex, 16) / 4 - (t - lo) * 0.08;
        if (score > bestScore) {
          bestScore = score;
          best = [a, z];
        }
      }
    }
    if (!best) break;
    out.push(best);
    lastEnd = tempo.toSec(best[1]);
  }
  return out;
}

/** Clone Hero's 0–6 difficulty estimate from Expert note density. */
export function estimateDifficulty(chart: GeneratedChart, def: SongDef): number {
  const tempo = new Tempo(def.tempo);
  const ex = chart.placed.expert;
  if (ex.length < 2) return 0;
  const secs = tempo.toSec(ex[ex.length - 1].b) - tempo.toSec(ex[0].b);
  const nps = ex.length / Math.max(1, secs);
  return nps < 2 ? 1 : nps < 3 ? 2 : nps < 4 ? 3 : nps < 5 ? 4 : nps < 6.5 ? 5 : 6;
}
