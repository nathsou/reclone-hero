import type { NoteList } from '../chart/types.ts';

/** A stretch with nothing to play: before the first note, or a long break between notes. */
export interface Gap {
  /** song time the silence starts (the song start, or the end of the last note before it) */
  from: number;
  /** time of the note that ends it */
  to: number;
  intro: boolean;
}

/** An intro this long (seconds) gets a countdown and can be skipped. */
export const INTRO_GAP = 5;
/** Breaks between notes this long get the same, so ordinary rests stay quiet. */
export const BREAK_GAP = 12;
/** A skip lands this long (song seconds at full speed) before the next note. */
export const SKIP_LEAD = 3;
/** Skipping is offered only when it would save at least this much. */
const MIN_SAVING = 1;
/** Frets held together to skip: red, yellow, blue and orange. */
export const SKIP_CHORD = 0b11110;

/**
 * The gaps in notes[first..last] long enough for a countdown. `start` is where play begins; the intro
 * is measured from it.
 */
export function findGaps(notes: NoteList, start: number, first = 0, last = notes.length - 1): Gap[] {
  const gaps: Gap[] = [];
  if (first > last || first >= notes.length) return gaps;
  const firstTime = notes.time[first];
  // The song clock starts at 0 at the earliest, whatever lead-in play starts with.
  const from = Math.max(0, start);
  if (firstTime - from >= INTRO_GAP) gaps.push({ from, to: firstTime, intro: true });
  let end = Math.max(notes.time[first], notes.endTime[first]);
  for (let i = first + 1; i <= last; i++) {
    const t = notes.time[i];
    if (t - end >= BREAK_GAP) gaps.push({ from: end, to: t, intro: false });
    end = Math.max(end, notes.endTime[i], t);
  }
  return gaps;
}

/** The gap song time t falls in, or null. Gaps are few, so a scan is fine (and allocation-free). */
export function gapAt(gaps: Gap[], t: number): Gap | null {
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    if (t >= g.from && t < g.to) return g;
    if (g.from > t) break;
  }
  return null;
}

/** Where a skip from inside gap g lands; `rate` is the playback speed. */
export function skipTarget(g: Gap, rate = 1): number {
  return g.to - SKIP_LEAD * rate;
}

/** Whether skipping from time t would save enough to be worth offering. */
export function canSkip(g: Gap | null, t: number, rate = 1): boolean {
  return !!g && skipTarget(g, rate) - t >= MIN_SAVING * rate;
}
