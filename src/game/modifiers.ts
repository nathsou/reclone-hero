import { HOPO, STRUM, TAP, allocNotes } from '../chart/types.ts';
import type { Track } from '../chart/types.ts';

/** Clone Hero-style modifiers: they change the notes (or the judge) of a part for a run. */
export const MODIFIERS = ['mirror', 'strums', 'hopos', 'taps', 'precision'] as const;
export type Modifier = (typeof MODIFIERS)[number];

export const MODIFIER_LABEL: Record<Modifier, string> = {
  mirror: 'Mirror',
  strums: 'All strums',
  hopos: 'All HOPOs',
  taps: 'All taps',
  precision: 'Precision',
};

export const MODIFIER_HINT: Record<Modifier, string> = {
  mirror: 'The frets are flipped: green notes come on orange, red on blue.',
  strums: 'Every note must be strummed: no hammer-ons or pull-offs.',
  hopos: 'Every note can be hammered on or pulled off (strumming still works).',
  taps: 'Every fretted note is a tap: just press the frets.',
  precision: 'The hit window is half as wide.',
};

/** Modifiers that make a part easier: runs with them on do not set best scores. */
export const EASING: ReadonlySet<Modifier> = new Set<Modifier>(['hopos', 'taps']);

/** Note-type modifiers exclude each other: turning one on turns the others off. */
const TYPE_MODS: Modifier[] = ['strums', 'hopos', 'taps'];

export function isModifier(x: unknown): x is Modifier {
  return typeof x === 'string' && (MODIFIERS as readonly string[]).includes(x);
}

/** The modifier list after switching `m` (keeps the canonical order, drops conflicting note types). */
export function toggleModifier(mods: readonly string[], m: Modifier): Modifier[] {
  const on = new Set(mods.filter(isModifier));
  if (on.has(m)) on.delete(m);
  else {
    if (TYPE_MODS.includes(m)) for (const t of TYPE_MODS) on.delete(t);
    on.add(m);
  }
  return MODIFIERS.filter((x) => on.has(x));
}

/** Whether a run with these modifiers may set a best score. */
export function countsForBest(mods: readonly string[]): boolean {
  return !mods.some((m) => isModifier(m) && EASING.has(m));
}

/** Hit window scale for these modifiers. */
export function windowScale(mods: readonly string[]): number {
  return mods.includes('precision') ? 0.5 : 1;
}

/** Fret i <-> fret 4 - i; open notes stay open. */
function mirrorMask(m: number): number {
  let out = 0;
  for (let i = 0; i < 5; i++) if (m & (1 << i)) out |= 1 << (4 - i);
  return out;
}

/** A copy of the track with the note modifiers applied (the track itself is never changed). */
export function applyModifiers(track: Track, mods: readonly string[]): Track {
  const mirror = mods.includes('mirror');
  const type = mods.includes('strums') ? STRUM : mods.includes('hopos') ? HOPO : mods.includes('taps') ? TAP : -1;
  if (!mirror && type < 0) return track;
  const src = track.notes;
  const notes = allocNotes(src.length);
  notes.tick.set(src.tick);
  notes.endTick.set(src.endTick);
  notes.time.set(src.time);
  notes.endTime.set(src.endTime);
  notes.sp.set(src.sp);
  notes.solo.set(src.solo);
  for (let i = 0; i < src.length; i++) {
    const mask = src.mask[i];
    notes.mask[i] = mirror ? mirrorMask(mask) : mask;
    // an open note cannot be tapped: it becomes a hammer-on
    notes.type[i] = type < 0 ? src.type[i] : type === TAP && mask === 0 ? HOPO : type;
  }
  return { ...track, notes };
}
