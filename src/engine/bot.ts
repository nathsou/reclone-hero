import type { Track } from '../chart/types.ts';
import { STRUM } from '../chart/types.ts';
import type { Engine } from './engine.ts';

export type Action =
  | { t: number; kind: 'frets'; mask: number }
  | { t: number; kind: 'strum' }
  | { t: number; kind: 'whammy'; value: number }
  | { t: number; kind: 'sp' }
  /** drums: hit a pad (its bit) or the kick (0) */
  | { t: number; kind: 'pad'; mask: number };

const ORDER = { frets: 0, whammy: 1, strum: 2, pad: 2, sp: 3 };

/**
 * Generates a perfect (or, with jitter, humanly imprecise) input stream for a track.
 * Used for autoplay and to verify the engine against every chart in a library.
 */
export function botActions(track: Track, opts: { jitter?: number; random?: () => number; from?: number; to?: number } = {}): Action[] {
  const jitter = opts.jitter ?? 0;
  const rnd = opts.random ?? Math.random;
  const notes = track.notes;
  const from = opts.from ?? 0;
  const to = opts.to ?? notes.length - 1;
  const out: Action[] = [];
  if (track.instrument === 'drums') {
    for (let i = from; i <= to; i++) {
      const t = notes.time[i] + (jitter > 0 ? (rnd() * 2 - 1) * jitter : 0);
      out.push({ t, kind: 'pad', mask: notes.mask[i] });
      const sp = notes.sp[i];
      if (sp >= 0 && track.starPower[sp].last === i) out.push({ t: notes.time[i] + 0.25, kind: 'sp' });
    }
    return out.sort((a, b) => a.t - b.t || ORDER[a.kind] - ORDER[b.kind]);
  }
  let held = 0;
  let sustains: { mask: number; end: number }[] = [];

  const setFrets = (t: number, mask: number) => {
    if (mask !== held) out.push({ t, kind: 'frets', mask });
    held = mask;
  };

  for (let i = from; i <= to; i++) {
    // The bot is built once per song, so plain per-note views are fine here.
    const view = (k: number) => (k >= from && k <= to ? { index: k, time: notes.time[k], endTime: notes.endTime[k], mask: notes.mask[k], type: notes.type[k], sp: notes.sp[k] } : undefined);
    const n = view(i)!;
    const prev = view(i - 1);
    const next = i + 1 < notes.length ? { time: notes.time[i + 1] } : undefined;
    // Humans stay in order: never jitter further than a third of the gap to a neighbour.
    const j = Math.min(jitter, prev ? (n.time - prev.time) / 3 : jitter, next ? (next.time - n.time) / 3 : jitter);
    const t = n.time + (j > 0 ? (rnd() * 2 - 1) * j : 0);
    const gapBefore = prev ? t - prev.time : 1;

    // Let go of sustains that end before this note.
    const ending = sustains.filter((s) => s.end <= t).sort((a, b) => a.end - b.end);
    for (const s of ending) {
      sustains = sustains.filter((x) => x !== s);
      setFrets(s.end, sustains.reduce((m, x) => m | x.mask, 0));
    }
    // Sustains sharing frets with this note end here.
    sustains = sustains.filter((s) => (s.mask & n.mask) === 0 && s.mask !== 0 && n.mask !== 0);
    const extended = sustains.reduce((m, x) => m | x.mask, 0);
    const want = n.mask | extended;

    if (want === held && n.type !== STRUM) {
      // Re-press so the hammer-on registers as a new fret action.
      setFrets(t - Math.min(0.015, gapBefore / 3), held & ~n.mask);
    }
    setFrets(t, want);
    if (n.type === STRUM) out.push({ t, kind: 'strum' });

    if (n.endTime > n.time) {
      sustains.push({ mask: n.mask, end: Math.max(n.endTime, t + 0.01) });
      if (n.sp >= 0) {
        const stop = Math.min(n.endTime, next ? next.time : n.endTime);
        let v = 1;
        for (let w = n.time + 0.05; w < stop; w += 0.06) out.push({ t: w, kind: 'whammy', value: (v = 1 - v) });
      }
    }
    if (n.sp >= 0 && track.starPower[n.sp].last === n.index) out.push({ t: n.time + 0.25, kind: 'sp' });
  }
  for (const s of sustains.sort((a, b) => a.end - b.end)) {
    sustains = sustains.filter((x) => x !== s);
    setFrets(s.end, sustains.reduce((m, x) => m | x.mask, 0));
  }
  return out.sort((a, b) => a.t - b.t || ORDER[a.kind] - ORDER[b.kind]);
}

export function applyAction(engine: Engine, a: Action): void {
  switch (a.kind) {
    case 'frets':
      engine.setFrets(a.t, a.mask);
      break;
    case 'strum':
      engine.strum(a.t);
      break;
    case 'whammy':
      engine.setWhammy(a.t, a.value);
      break;
    case 'sp':
      engine.activateStarPower(a.t);
      break;
    case 'pad':
      engine.pad(a.t, a.mask);
      break;
  }
}
