import { midi } from './score.ts';
import type { Note } from './score.ts';

/**
 * Arranging helpers: chord symbols ("Cm", "G7", "Bb/D", "F#dim7") to voicings, and rhythm patterns
 * that turn a chord progression into a part (pads, bass lines, rhythm guitar, arpeggios).
 */

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
};
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pc(name: string): number {
  let n = PC[name[0]];
  for (const c of name.slice(1)) n += c === '#' ? 1 : -1;
  return ((n % 12) + 12) % 12;
}

export interface ChordInfo {
  root: number;
  bass: number;
  intervals: number[];
}

export function parseChord(name: string): ChordInfo {
  const m = /^([A-G][#b]?)(maj7|m7b5|m7|m6|m|7|9|6|dim7|dim|aug|sus4|sus2|5|add9)?(?:\/([A-G][#b]?))?$/.exec(name);
  if (!m) throw new Error(`Bad chord "${name}"`);
  const root = pc(m[1]);
  return { root, bass: m[3] ? pc(m[3]) : root, intervals: QUALITY[m[2] ?? ''] };
}

/** Lowest pitch of pitch class `p` at or above `low`. */
function above(p: number, low: number): number {
  return low + ((p - low) % 12 + 12) % 12;
}

/** Close voicing, root position, starting at or above `low` (e.g. 'G3' for pads). */
export function voicing(name: string, low = 'G3'): number[] {
  const c = parseChord(name);
  const r = above(c.root, midi(low));
  return c.intervals.map((i) => r + i);
}

/** Close voicing in the inversion whose lowest note is nearest `around`: smooth voice leading. */
export function nearVoicing(name: string, around = 'C4'): number[] {
  const c = parseChord(name);
  const target = midi(around);
  const pcs = [...new Set(c.intervals.map((i) => (c.root + i) % 12))];
  let best: number[] = [];
  let bestD = Infinity;
  for (const lowPc of pcs) {
    const low = above(lowPc, target - 6);
    const notes = pcs.map((p) => above(p, low)).sort((a, b) => a - b);
    const d = Math.abs(low - target);
    if (d < bestD) {
      bestD = d;
      best = notes;
    }
  }
  return best;
}

/** Bass note (slash bass or root) at or above `low`. */
export function bassOf(name: string, low = 'E1'): number {
  return above(parseChord(name).bass, midi(low));
}

/** Power chord (root, fifth, octave) on the root at or above `low`. */
export function powerOf(name: string, low = 'E2', octave = true): number[] {
  const r = above(parseChord(name).root, midi(low));
  return octave ? [r, r + 7, r + 12] : [r, r + 7];
}

/**
 * Play a progression with a rhythm. `chords` holds one symbol per `span` beats; `rhythm` is a string
 * of sixteenth-note steps, repeated to fill each span:
 *   x hit   X accent   m muted hit   - hold the previous hit   . rest   | ignored
 * `pitches` picks the notes for each chord; with `arp`, each hit takes the next pitch in turn.
 */
export function comp(
  chords: string[],
  span: number,
  from: number,
  rhythm: string,
  pitches: (chord: string) => number[],
  opts: { v?: number; arp?: number[]; step?: number } = {},
): Note[] {
  const steps = rhythm.replace(/[\s|]/g, '');
  const step = opts.step ?? 0.25;
  const per = Math.round(span / step);
  const out: Note[] = [];
  const v = opts.v ?? 0.75;
  chords.forEach((ch, ci) => {
    if (ch === '-' || ch === '.') {
      // "-" continues the previous chord's last note, "." is silence
      if (ch === '-' && out.length) out[out.length - 1].d += span;
      return;
    }
    const ps = pitches(ch);
    let hit = 0;
    let last: Note | null = null;
    for (let i = 0; i < per; i++) {
      const c = steps[i % steps.length];
      const b = from + ci * span + i * step;
      if (c === '-') {
        if (last) last.d += step;
        continue;
      }
      last = null;
      if (c === '.') continue;
      const p = opts.arp ? [ps[opts.arp[hit % opts.arp.length] % ps.length] + 12 * Math.floor(opts.arp[hit % opts.arp.length] / ps.length)] : ps;
      hit++;
      last = { b, d: step, p, v: c === 'X' ? Math.min(1, v + 0.2) : v, mute: c === 'm' || undefined };
      out.push(last);
    }
  });
  return out;
}

/** Split a progression written as "Cm . . . | Ab . Bb ." (one symbol per span, "." holds). */
export function prog(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(/[\s|]+/).filter(Boolean)) out.push(t === '.' ? (out[out.length - 1] ?? '.') : t);
  return out;
}
