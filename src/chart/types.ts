export const INSTRUMENTS = ['guitar', 'bass', 'rhythm', 'keys', 'guitarcoop'] as const;
export type Instrument = (typeof INSTRUMENTS)[number];
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  guitar: 'Guitar',
  bass: 'Bass',
  rhythm: 'Rhythm',
  keys: 'Keys',
  guitarcoop: 'Guitar Co-op',
};

/** Note kinds. HOPOs may be hit by fretting if the previous note was hit; taps always. */
export const STRUM = 0;
export const HOPO = 1;
export const TAP = 2;
export type NoteType = typeof STRUM | typeof HOPO | typeof TAP;

/** Raw note as found in a chart file, before chords/HOPOs are resolved. */
export interface RawNote {
  tick: number;
  /** 0-4 = green..orange, 7 = open */
  lane: number;
  length: number;
}

export interface TickRange {
  start: number;
  /** exclusive */
  end: number;
}

/** Per instrument+difficulty data straight out of the parser. */
export interface RawTrack {
  notes: RawNote[];
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
  tracks: Map<string, RawTrack>;
  /** metadata from the .chart [Song] section, if any */
  meta: Record<string, string>;
}

export interface Note {
  index: number;
  tick: number;
  time: number;
  /** bit n = fret n held; 0 = open note */
  mask: number;
  /** number of gems (1 for open notes) */
  count: number;
  type: NoteType;
  endTick: number;
  endTime: number;
  /** star power phrase index or -1 */
  sp: number;
  /** solo index or -1 */
  solo: number;
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
  notes: Note[];
  starPower: Phrase[];
  solos: Phrase[];
}

export interface Beat {
  time: number;
  /** 0 = measure line, 1 = beat, 2 = half beat */
  kind: number;
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
