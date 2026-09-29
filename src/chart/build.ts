import { foldToTouch } from './touch.ts';
import { TempoMap } from './tempo.ts';
import type { BeatList, ChartOptions, Difficulty, Instrument, NoteList, NoteType, Phrase, RawChart, RawTrack, Section, TickRange, Track } from './types.ts';
import { DIFFICULTIES, GEM_COUNT, HOPO, INSTRUMENTS, STRUM, TAP, allocNotes, trackKey } from './types.ts';

/**
 * Tracks are built on first use: a chart may hold 20 instrument/difficulty tracks but a song only
 * ever plays one. Until then only the packed raw gems are kept, and they are released once built.
 */
class LazyTracks extends Map<string, Track> {
  private readonly pending = new Map<string, () => Track>();

  add(key: string, build: () => Track): void {
    this.pending.set(key, build);
  }

  override has(key: string): boolean {
    return this.pending.has(key) || super.has(key);
  }

  override get(key: string): Track | undefined {
    const build = this.pending.get(key);
    if (build) {
      this.pending.delete(key);
      super.set(key, build());
    }
    return super.get(key);
  }

  private buildAll() {
    for (const key of [...this.pending.keys()]) this.get(key);
  }

  override get size(): number {
    return this.pending.size + super.size;
  }

  override keys(): MapIterator<string> {
    this.buildAll();
    return super.keys();
  }

  override values(): MapIterator<Track> {
    this.buildAll();
    return super.values();
  }

  override entries(): MapIterator<[string, Track]> {
    this.buildAll();
    return super.entries();
  }

  override [Symbol.iterator](): MapIterator<[string, Track]> {
    return this.entries();
  }

  override forEach(cb: (value: Track, key: string, map: Map<string, Track>) => void): void {
    this.buildAll();
    super.forEach(cb);
  }
}

export interface Chart {
  resolution: number;
  tempo: TempoMap;
  beats: BeatList;
  sections: Section[];
  /** instrument:difficulty -> track, built on first access */
  tracks: Map<string, Track>;
  /** Number of notes (chords count once) in a track, without building it. 0 when absent. */
  noteCount(key: string): number;
  /** time of the last note end */
  lastNoteTime: number;
  meta: Record<string, string>;
}

export function buildChart(raw: RawChart, opts: ChartOptions = {}): Chart {
  const res = raw.resolution;
  const tempo = new TempoMap(raw.tempos, res, (opts.delayMs ?? 0) / 1000);

  let hopoThreshold: number;
  if (opts.eighthNoteHopo) hopoThreshold = Math.floor(res / 2) + 1;
  else if (opts.hopoFrequency && opts.hopoFrequency > 0) hopoThreshold = Math.floor((opts.hopoFrequency * res) / 480);
  else hopoThreshold = raw.format === 'chart' ? Math.floor((65 * res) / 192) : Math.floor((170 * res) / 480);
  const sustainCutoff = opts.sustainCutoff ?? (raw.format === 'mid' ? Math.floor(res / 3) : 0);

  // Captured on their own so the lazy builders keep only their own raw track alive, not the whole file.
  const format = raw.format;
  const tracks = new LazyTracks();
  const counts = new Map<string, number>();
  let lastTick = 0;
  for (const instrument of INSTRUMENTS) {
    for (const difficulty of DIFFICULTIES) {
      const key = trackKey(instrument, difficulty);
      let rt = raw.tracks.get(key);
      // Every chart gets a three-fret touch part: its own if it has one, else folded from the guitar.
      if (!rt && instrument === 'touch') {
        const guitar = raw.tracks.get(trackKey('guitar', difficulty));
        if (guitar && guitar.notes.tick.length) rt = foldToTouch(guitar, res);
      }
      if (!rt || rt.notes.tick.length === 0) continue;
      const packed = pack(rt);
      const { tick, len } = packed;
      let distinct = 0;
      for (let i = 0; i < tick.length; i++) {
        if (i === 0 || tick[i] !== tick[i - 1]) distinct++;
        lastTick = Math.max(lastTick, tick[i] + (len[i] > sustainCutoff ? len[i] : 0));
      }
      counts.set(key, distinct);
      tracks.add(key, () => buildTrack(packed, instrument, difficulty, tempo, hopoThreshold, sustainCutoff, format));
    }
  }

  const sections = raw.sections
    .slice()
    .sort((a, b) => a.tick - b.tick)
    .map((s) => ({ time: tempo.tickToTime(s.tick), name: prettySection(s.name) }));

  return {
    resolution: res,
    tempo,
    beats: buildBeats(raw, tempo, lastTick + res * 8),
    sections,
    tracks,
    noteCount: (key) => counts.get(key) ?? 0,
    lastNoteTime: tempo.tickToTime(lastTick),
    meta: raw.meta,
  };
}

/**
 * A raw track packed into exact-size typed arrays, gems sorted by (tick, lane). This is what a chart
 * keeps for tracks that have not been played: a few bytes per gem, and no per-gem or per-marker objects.
 */
interface PackedTrack {
  tick: Int32Array;
  lane: Uint8Array;
  len: Int32Array;
  /** .chart forced-note flags, sorted unique ticks */
  flip: Int32Array;
  /** ranges as flattened sorted [start, end) pairs */
  tap: Int32Array;
  forceHopo: Int32Array;
  forceStrum: Int32Array;
  starPower: TickRange[];
  solos: TickRange[];
}

function packRanges(ranges: TickRange[]): Int32Array {
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  const out = new Int32Array(sorted.length * 2);
  sorted.forEach((r, i) => {
    out[i * 2] = r.start;
    out[i * 2 + 1] = r.end;
  });
  return out;
}

function pack(rt: RawTrack): PackedTrack {
  const r = rt.notes;
  const n = r.tick.length;
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => r.tick[a] - r.tick[b] || r.lane[a] - r.lane[b]);
  const tick = new Int32Array(n);
  const lane = new Uint8Array(n);
  const len = new Int32Array(n);
  order.forEach((src, i) => {
    tick[i] = r.tick[src];
    lane[i] = r.lane[src];
    len[i] = r.len[src];
  });
  return {
    tick,
    lane,
    len,
    flip: Int32Array.from([...rt.forceFlip].sort((a, b) => a - b)),
    tap: packRanges(rt.tap),
    forceHopo: packRanges(rt.forceHopo),
    forceStrum: packRanges(rt.forceStrum),
    starPower: rt.starPower,
    solos: rt.solos,
  };
}

/** Sweeps sorted [start, end) pairs alongside ascending ticks. */
class RangeCursor {
  private i = 0;
  private readonly r: Int32Array;
  constructor(pairs: Int32Array) {
    this.r = pairs;
  }
  has(tick: number): boolean {
    const r = this.r;
    const n = r.length;
    while (this.i < n && r[this.i + 1] <= tick && r[this.i] < tick) this.i += 2;
    for (let j = this.i; j < n && r[j] <= tick; j += 2) {
      if (tick < r[j + 1] || tick === r[j]) return true;
    }
    return false;
  }
}

/** Membership test for sorted unique ticks, queried in ascending order. */
class TickCursor {
  private i = 0;
  private readonly t: Int32Array;
  constructor(ticks: Int32Array) {
    this.t = ticks;
  }
  has(tick: number): boolean {
    while (this.i < this.t.length && this.t[this.i] < tick) this.i++;
    return this.i < this.t.length && this.t[this.i] === tick;
  }
}

function buildTrack(
  rt: PackedTrack,
  instrument: Instrument,
  difficulty: Difficulty,
  tempo: TempoMap,
  hopoThreshold: number,
  sustainCutoff: number,
  format: 'chart' | 'mid',
): Track {
  const raw = rt;
  const n0 = raw.tick.length;

  // Group gems (already sorted by tick, lane) into chords: one entry per distinct tick.
  const gTick: number[] = [];
  const gMask: number[] = [];
  const gLen: number[] = [];
  for (let i = 0; i < n0; i++) {
    const t = raw.tick[i];
    let g = gTick.length - 1;
    if (g < 0 || gTick[g] !== t) {
      gTick.push(t);
      gMask.push(0);
      gLen.push(0);
      g++;
    }
    // Lane 7 is an open note: it only stays open when no fret shares the tick (mask 0).
    if (raw.lane[i] !== 7) gMask[g] |= 1 << raw.lane[i];
    gLen[g] = Math.max(gLen[g], raw.len[i]);
  }

  const tap = new RangeCursor(rt.tap);
  const forceHopo = new RangeCursor(rt.forceHopo);
  const forceStrum = new RangeCursor(rt.forceStrum);
  const flip = new TickCursor(rt.flip);

  const n = gTick.length;
  const notes = allocNotes(n);
  for (let i = 0; i < n; i++) {
    const tick = gTick[i];
    const mask = gMask[i];
    let type: NoteType = STRUM;
    if (i > 0) {
      const prevMask = gMask[i - 1];
      const single = GEM_COUNT[mask] === 1;
      const natural = tick - gTick[i - 1] <= hopoThreshold && single && mask !== prevMask && !(GEM_COUNT[prevMask] > 1 && (prevMask & mask) !== 0);
      type = natural ? HOPO : STRUM;
    }
    if (format === 'chart') {
      if (flip.has(tick) && i > 0) type = type === HOPO ? STRUM : HOPO;
    } else if (forceHopo.has(tick)) type = HOPO;
    else if (forceStrum.has(tick)) type = STRUM;
    if (tap.has(tick) && mask !== 0) type = TAP;

    let endTick = tick + (gLen[i] > sustainCutoff ? gLen[i] : 0);
    if (i + 1 < n && endTick > gTick[i + 1]) {
      // Sustains may only run under later notes on other frets ("extended sustains").
      const nextMask = gMask[i + 1];
      if (mask === 0 || nextMask === 0 || (nextMask & mask) !== 0) endTick = gTick[i + 1];
    }
    if (endTick - tick <= sustainCutoff) endTick = tick;

    notes.tick[i] = tick;
    notes.endTick[i] = endTick;
    notes.time[i] = tempo.tickToTime(tick);
    notes.endTime[i] = tempo.tickToTime(endTick);
    notes.mask[i] = mask;
    notes.type[i] = type;
  }

  const starPower = assignPhrases(notes, rt.starPower, tempo, notes.sp);
  const solos = assignPhrases(notes, rt.solos, tempo, notes.solo);
  return { instrument, difficulty, notes, starPower, solos };
}

function assignPhrases(notes: NoteList, ranges: TickRange[], tempo: TempoMap, out: Int16Array): Phrase[] {
  const phrases: Phrase[] = [];
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  let ni = 0;
  for (const r of sorted) {
    while (ni < notes.length && notes.tick[ni] < r.start) ni++;
    let first = -1;
    let last = -1;
    for (let j = ni; j < notes.length && notes.tick[j] < r.end; j++) {
      if (first < 0) first = j;
      last = j;
    }
    if (first < 0) continue;
    const idx = phrases.length;
    for (let j = first; j <= last; j++) out[j] = idx;
    phrases.push({ startTime: notes.time[first], endTime: Math.max(tempo.tickToTime(r.end), notes.endTime[last]), first, last });
    ni = last + 1;
  }
  return phrases;
}

function buildBeats(raw: RawChart, tempo: TempoMap, endTick: number): BeatList {
  const res = raw.resolution;
  const sigs = raw.timeSigs.slice().sort((a, b) => a.tick - b.tick);
  if (sigs.length === 0 || sigs[0].tick > 0) sigs.unshift({ tick: 0, num: 4, den: 4 });
  const times: number[] = [];
  const kinds: number[] = [];
  for (let s = 0; s < sigs.length; s++) {
    const sig = sigs[s];
    const until = s + 1 < sigs.length ? sigs[s + 1].tick : endTick;
    const beatLen = (res * 4) / (sig.den || 4);
    const num = Math.max(1, sig.num);
    let beatInMeasure = 0;
    for (let t = sig.tick; t < until; t += beatLen) {
      times.push(tempo.tickToTime(t));
      kinds.push(beatInMeasure === 0 ? 0 : 1);
      beatInMeasure = (beatInMeasure + 1) % num;
    }
  }
  return { length: times.length, time: Float64Array.from(times), kind: Uint8Array.from(kinds) };
}

function prettySection(name: string): string {
  const s = name
    .replace(/^section\s+/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d+)([a-z])\b/gi, (_, d, l) => d + l.toUpperCase());
}
