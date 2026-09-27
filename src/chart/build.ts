import { TempoMap } from './tempo.ts';
import type { Beat, ChartOptions, Difficulty, Instrument, Note, NoteType, Phrase, RawChart, RawTrack, Section, TickRange, Track } from './types.ts';
import { DIFFICULTIES, HOPO, INSTRUMENTS, STRUM, TAP, trackKey } from './types.ts';

export interface Chart {
  resolution: number;
  tempo: TempoMap;
  beats: Beat[];
  sections: Section[];
  tracks: Map<string, Track>;
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

  const tracks = new Map<string, Track>();
  let lastTick = 0;
  let lastNoteTime = 0;
  for (const instrument of INSTRUMENTS) {
    for (const difficulty of DIFFICULTIES) {
      const rt = raw.tracks.get(trackKey(instrument, difficulty));
      if (!rt || rt.notes.length === 0) continue;
      const track = buildTrack(rt, instrument, difficulty, tempo, hopoThreshold, sustainCutoff, raw.format);
      if (track.notes.length === 0) continue;
      tracks.set(trackKey(instrument, difficulty), track);
      const last = track.notes[track.notes.length - 1];
      lastTick = Math.max(lastTick, last.endTick);
      lastNoteTime = Math.max(lastNoteTime, last.endTime);
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
    lastNoteTime,
    meta: raw.meta,
  };
}

function popcount(m: number): number {
  let c = 0;
  for (; m; m &= m - 1) c++;
  return c;
}

/** Sweeps sorted ranges alongside ascending ticks. */
class RangeCursor {
  private i = 0;
  private readonly ranges: TickRange[];
  constructor(ranges: TickRange[]) {
    this.ranges = ranges.slice().sort((a, b) => a.start - b.start);
  }
  has(tick: number): boolean {
    while (this.i < this.ranges.length && this.ranges[this.i].end <= tick && this.ranges[this.i].start < tick) this.i++;
    for (let j = this.i; j < this.ranges.length && this.ranges[j].start <= tick; j++) {
      if (tick < this.ranges[j].end || tick === this.ranges[j].start) return true;
    }
    return false;
  }
}

function buildTrack(
  rt: RawTrack,
  instrument: Instrument,
  difficulty: Difficulty,
  tempo: TempoMap,
  hopoThreshold: number,
  sustainCutoff: number,
  format: 'chart' | 'mid',
): Track {
  // Group gems into chords.
  const raw = rt.notes.slice().sort((a, b) => a.tick - b.tick || a.lane - b.lane);
  const groups: { tick: number; mask: number; open: boolean; length: number }[] = [];
  for (const n of raw) {
    let g = groups[groups.length - 1];
    if (!g || g.tick !== n.tick) groups.push((g = { tick: n.tick, mask: 0, open: false, length: 0 }));
    if (n.lane === 7) g.open = true;
    else g.mask |= 1 << n.lane;
    g.length = Math.max(g.length, n.length);
  }

  const tap = new RangeCursor(rt.tap);
  const forceHopo = new RangeCursor(rt.forceHopo);
  const forceStrum = new RangeCursor(rt.forceStrum);

  const notes: Note[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const mask = g.mask; // open notes (mask 0) only when no frets share the tick
    const prev = groups[i - 1];
    let type: NoteType = STRUM;
    if (prev) {
      const single = popcount(mask) <= 1;
      const natural =
        g.tick - prev.tick <= hopoThreshold &&
        single &&
        mask !== prev.mask &&
        !(popcount(prev.mask) > 1 && (prev.mask & mask) !== 0);
      type = natural ? HOPO : STRUM;
    }
    if (format === 'chart') {
      if (rt.forceFlip.has(g.tick) && prev) type = type === HOPO ? STRUM : HOPO;
    } else if (forceHopo.has(g.tick)) type = HOPO;
    else if (forceStrum.has(g.tick)) type = STRUM;
    if (tap.has(g.tick) && mask !== 0) type = TAP;

    let endTick = g.tick + (g.length > sustainCutoff ? g.length : 0);
    const next = groups[i + 1];
    if (next && endTick > next.tick) {
      // Sustains may only run under later notes on other frets ("extended sustains").
      if (mask === 0 || next.mask === 0 || (next.mask & mask) !== 0) endTick = next.tick;
    }
    if (endTick - g.tick <= sustainCutoff) endTick = g.tick;

    notes.push({
      index: notes.length,
      tick: g.tick,
      time: tempo.tickToTime(g.tick),
      mask,
      count: Math.max(1, popcount(mask)),
      type,
      endTick,
      endTime: tempo.tickToTime(endTick),
      sp: -1,
      solo: -1,
    });
  }

  const starPower = assignPhrases(notes, rt.starPower, tempo, (n, i) => (n.sp = i));
  const solos = assignPhrases(notes, rt.solos, tempo, (n, i) => (n.solo = i));
  return { instrument, difficulty, notes, starPower, solos };
}

function assignPhrases(notes: Note[], ranges: TickRange[], tempo: TempoMap, set: (n: Note, i: number) => void): Phrase[] {
  const out: Phrase[] = [];
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  let ni = 0;
  for (const r of sorted) {
    while (ni < notes.length && notes[ni].tick < r.start) ni++;
    let first = -1;
    let last = -1;
    for (let j = ni; j < notes.length && notes[j].tick < r.end; j++) {
      if (first < 0) first = j;
      last = j;
    }
    if (first < 0) continue;
    const idx = out.length;
    for (let j = first; j <= last; j++) set(notes[j], idx);
    out.push({ startTime: notes[first].time, endTime: Math.max(tempo.tickToTime(r.end), notes[last].endTime), first, last });
    ni = last + 1;
  }
  return out;
}

function buildBeats(raw: RawChart, tempo: TempoMap, endTick: number): Beat[] {
  const res = raw.resolution;
  const sigs = raw.timeSigs.slice().sort((a, b) => a.tick - b.tick);
  if (sigs.length === 0 || sigs[0].tick > 0) sigs.unshift({ tick: 0, num: 4, den: 4 });
  const beats: Beat[] = [];
  for (let s = 0; s < sigs.length; s++) {
    const sig = sigs[s];
    const until = s + 1 < sigs.length ? sigs[s + 1].tick : endTick;
    const beatLen = (res * 4) / (sig.den || 4);
    const num = Math.max(1, sig.num);
    let beatInMeasure = 0;
    for (let t = sig.tick; t < until; t += beatLen) {
      beats.push({ time: tempo.tickToTime(t), kind: beatInMeasure === 0 ? 0 : 1 });
      beatInMeasure = (beatInMeasure + 1) % num;
    }
  }
  return beats;
}

function prettySection(name: string): string {
  const s = name
    .replace(/^section\s+/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d+)([a-z])\b/gi, (_, d, l) => d + l.toUpperCase());
}
