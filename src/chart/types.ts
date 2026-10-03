export const INSTRUMENTS = ['guitar', 'bass', 'rhythm', 'keys', 'guitarcoop', 'touch'] as const;
export type Instrument = (typeof INSTRUMENTS)[number];
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  guitar: 'Guitar',
  bass: 'Bass',
  rhythm: 'Rhythm',
  keys: 'Keys',
  guitarcoop: 'Guitar Co-op',
  touch: 'Touch',
};

/** The touch part has three frets, drawn on these lanes of the highway. */
export const TOUCH_LANES = [0, 2, 4] as const;

/** Note kinds. HOPOs may be hit by fretting if the previous note was hit; taps always. */
export const STRUM = 0;
export const HOPO = 1;
export const TAP = 2;
export type NoteType = typeof STRUM | typeof HOPO | typeof TAP;

/**
 * Raw gems as found in a chart file, before chords/HOPOs are resolved: parallel arrays of small
 * integers (V8 stores these unboxed, 4 bytes each), not one object per gem.
 */
export interface RawNotes {
  tick: number[];
  /** 0-4 = green..orange, 7 = open */
  lane: number[];
  len: number[];
}

export function rawNotes(): RawNotes {
  return { tick: [], lane: [], len: [] };
}

export function pushRaw(r: RawNotes, tick: number, lane: number, len: number): void {
  r.tick.push(tick);
  r.lane.push(lane);
  r.len.push(len);
}

export interface TickRange {
  start: number;
  /** exclusive */
  end: number;
}

/** Per instrument+difficulty data straight out of the parser. */
export interface RawTrack {
  notes: RawNotes;
  /** .chart N5: flips natural HOPO state at this tick */
  forceFlip: Set<number>;
  /** .chart N6 / MIDI 104 / sysex tap */
  tap: TickRange[];
  forceHopo: TickRange[];
  forceStrum: TickRange[];
  starPower: TickRange[];
  solos: TickRange[];
}

export interface RawTempo {
  tick: number;
  /** microseconds per quarter note */
  usPerQuarter: number;
}

export interface RawTimeSig {
  tick: number;
  num: number;
  den: number;
}

export interface RawChart {
  format: 'chart' | 'mid';
  resolution: number;
  tempos: RawTempo[];
  timeSigs: RawTimeSig[];
  sections: { tick: number; name: string }[];
  /** lyric syllables and vocal phrases (lines) */
  lyrics: { tick: number; text: string }[];
  phrases: TickRange[];
  tracks: Map<string, RawTrack>;
  /** metadata from the .chart [Song] section, if any */
  meta: Record<string, string>;
}

/**
 * The notes of one track as parallel typed arrays ("struct of arrays"): note i is
 * (tick[i], time[i], mask[i], type[i], …). About 30 bytes per note, contiguous in memory, and
 * a handful of objects for the garbage collector to trace instead of one per note.
 */
export interface NoteList {
  readonly length: number;
  readonly tick: Int32Array;
  readonly endTick: Int32Array;
  /** seconds */
  readonly time: Float64Array;
  readonly endTime: Float64Array;
  /** bit n = fret n held; 0 = open note */
  readonly mask: Uint8Array;
  /** STRUM, HOPO or TAP */
  readonly type: Uint8Array;
  /** star power phrase index or -1 */
  readonly sp: Int16Array;
  /** solo index or -1 */
  readonly solo: Int16Array;
}

export function allocNotes(n: number): NoteList {
  return {
    length: n,
    tick: new Int32Array(n),
    endTick: new Int32Array(n),
    time: new Float64Array(n),
    endTime: new Float64Array(n),
    mask: new Uint8Array(n),
    type: new Uint8Array(n),
    sp: new Int16Array(n).fill(-1),
    solo: new Int16Array(n).fill(-1),
  };
}

/** Gems in a note: frets pressed, or 1 for an open note. */
export const GEM_COUNT = Uint8Array.from({ length: 32 }, (_, m) => {
  let c = 0;
  for (let b = m; b; b &= b - 1) c++;
  return Math.max(1, c);
});

/** Convenience for tests and tools: build a NoteList from plain objects. */
export function noteListOf(specs: { time: number; mask: number; type: NoteType; endTime?: number; tick?: number; endTick?: number; sp?: number; solo?: number }[]): NoteList {
  const l = allocNotes(specs.length);
  specs.forEach((n, i) => {
    l.time[i] = n.time;
    l.endTime[i] = n.endTime ?? n.time;
    l.tick[i] = n.tick ?? 0;
    l.endTick[i] = n.endTick ?? l.tick[i];
    l.mask[i] = n.mask;
    l.type[i] = n.type;
    l.sp[i] = n.sp ?? -1;
    l.solo[i] = n.solo ?? -1;
  });
  return l;
}

export interface Phrase {
  startTime: number;
  endTime: number;
  /** first and last note index (inclusive); last < first when the phrase is empty */
  first: number;
  last: number;
}

export interface Track {
  instrument: Instrument;
  difficulty: Difficulty;
  notes: NoteList;
  starPower: Phrase[];
  solos: Phrase[];
}

/** Beat lines as parallel arrays. */
export interface BeatList {
  readonly length: number;
  readonly time: Float64Array;
  /** 0 = measure line, 1 = beat */
  readonly kind: Uint8Array;
}

export interface Section {
  time: number;
  name: string;
}

export interface ChartOptions {
  /** HOPO threshold in ticks at 480 resolution (song.ini hopo_frequency) */
  hopoFrequency?: number;
  eighthNoteHopo?: boolean;
  /** ticks; sustains at or below this are dropped */
  sustainCutoff?: number;
  /** MIDI note that marks star power (116, or 103 for old charts) */
  multiplierNote?: number;
  /** song.ini delay in ms: positive values make notes arrive later */
  delayMs?: number;
}

export function trackKey(instrument: Instrument, difficulty: Difficulty): string {
  return `${instrument}:${difficulty}`;
}
