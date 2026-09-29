import { grid } from './score.ts';
import type { DrumVoice, Hit } from './score.ts';

type Grid = Partial<Record<DrumVoice, string>>;

/** Repeat a one-bar drum grid for `bars` bars (4/4, sixteenth steps unless `step` says otherwise). */
export function drumBars(pattern: Grid, start: number, bars: number, opts: { crash?: boolean; fill?: Fill | null; beats?: number; step?: number } = {}): Hit[] {
  const beats = opts.beats ?? 4;
  const out: Hit[] = [];
  for (let i = 0; i < bars; i++) {
    const at = start + i * beats;
    const last = i === bars - 1 && opts.fill;
    let hits = grid(pattern, at, opts.step ?? 0.25);
    if (last) {
      // The fill replaces the end of the bar.
      const fillFrom = at + beats - FILL_BEATS[opts.fill!];
      const f = fill(opts.fill!, fillFrom);
      const keepKick = !f.some((h) => h.k === 'kick');
      hits = hits.filter((h) => h.b < fillFrom - 1e-6 || (keepKick && h.k === 'kick'));
      hits.push(...f);
    }
    if (i === 0 && opts.crash) {
      hits = hits.filter((h) => !(h.b === at && (h.k === 'hat' || h.k === 'ride' || h.k === 'ohat')));
      hits.push({ b: at, k: 'crash', v: 0.9 });
    }
    out.push(...hits);
  }
  return out;
}

export type Fill = 'snare1' | 'toms1' | 'toms2' | 'roll2' | 'build4' | 'flam';

const FILL_BEATS: Record<Fill, number> = { snare1: 1, toms1: 1, toms2: 2, roll2: 2, build4: 4, flam: 1 };

export function fill(kind: Fill, at: number): Hit[] {
  switch (kind) {
    case 'snare1':
      return grid({ snare: 'xxXx' }, at);
    case 'flam':
      return grid({ snare: 'X.X.', kick: 'x.x.' }, at);
    case 'toms1':
      return grid({ tomHi: 'xx..', tomMid: '..x.', tomLo: '...X' }, at);
    case 'toms2':
      return grid({ snare: 'x.xx', tomHi: '....xx..', tomMid: '......x.', tomLo: '.......X', kick: 'x.......' }, at);
    case 'roll2':
      return grid({ snare: 'gxgxxxxXxXxXXXXX' }, at, 0.125);
    case 'build4':
      return [...grid({ snare: 'x.x.x.x.xxxxxxxx', kick: 'x...x...x...x...' }, at), ...grid({ snare: 'xxxxxxxX' }, at + 3, 0.125)];
  }
}

// Common grooves (one 4/4 bar in sixteenths).
export const ROCK: Grid = { kick: 'x.....x.x.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' };
export const ROCK_DRIVE: Grid = { kick: 'x.x...x.x.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' };
export const ROCK_RIDE: Grid = { kick: 'x.....x.x.x.....', snare: '....X.......X...', ride: 'x.x.x.x.x.x.x.x.' };
export const ROCK_OPEN: Grid = { kick: 'x.....x.x.......', snare: '....X.......X...', ohat: 'x.x.x.x.x.x.x.x.' };
export const HALF_TIME: Grid = { kick: 'x.......x.x.....', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.' };
export const PUNK: Grid = { kick: 'x.x.x.x.x.x.x.x.', snare: '....X.......X...', ride: 'x.x.x.x.x.x.x.x.' };
export const GALLOP: Grid = { kick: 'x.xxx.xxx.xxx.xx', snare: '....X.......X...', ride: 'x...x...x...x...' };
export const BLAST: Grid = { kick: 'x.x.x.x.x.x.x.x.', snare: '.x.x.x.x.x.x.x.x', ride: 'x.x.x.x.x.x.x.x.' };
export const FOUR_FLOOR: Grid = { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'xxxxxxxxxxxxxxxx' };
export const HOUSE_OPEN: Grid = { kick: 'x...x...x...x...', clap: '....x.......x...', ohat: '..x...x...x...x.', hat: 'x.x.x.x.x.x.x.x.' };
export const DNB: Grid = { kick: 'x.........x.....', snare: '....X.......X...', hat: 'x.x.x.xxx.x.x.x.' };
export const SYNTHWAVE: Grid = { kick: 'x.......x.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' };
