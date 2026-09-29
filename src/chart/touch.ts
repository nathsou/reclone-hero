import type { RawTrack } from './types.ts';
import { pushRaw, rawNotes, TOUCH_LANES } from './types.ts';

/** Where each of the five frets sits among three, with no context. */
const FOLD = [0, 0, 1, 2, 2];

/**
 * The three-fret touch part of a chart without one, from its five-fret part. A single note keeps
 * the shape of the line: moving up the neck moves right, down moves left, a repeated fret stays
 * put, so alternations such as green-red stay two different frets. Green and orange stay on the
 * outer frets, and after a pause the context starts over. Chords keep their outer notes (two at
 * most). Forced HOPO flags are dropped: on a touch screen every note is a tap anyway.
 */
export function foldToTouch(src: RawTrack, resolution: number): RawTrack {
  const out: RawTrack = { notes: rawNotes(), forceFlip: new Set(), tap: src.tap, forceHopo: [], forceStrum: [], starPower: src.starPower, solos: src.solos };
  const { tick, lane, len } = src.notes;
  // order gems by tick so chords sit together
  const order = tick.map((_, i) => i).sort((a, b) => tick[a] - tick[b] || lane[a] - lane[b]);
  let prev5 = -1;
  let prev3 = 1;
  let prevTick = -Infinity;
  for (let k = 0; k < order.length; ) {
    const t = tick[order[k]];
    const frets: number[] = [];
    let open = false;
    let l = 0;
    for (; k < order.length && tick[order[k]] === t; k++) {
      const g = order[k];
      if (lane[g] === 7) open = true;
      else if (lane[g] <= 4) frets.push(lane[g]);
      l = Math.max(l, len[g]);
    }
    if (!frets.length) {
      if (open) pushRaw(out.notes, t, 7, l);
      continue;
    }
    const fresh = t - prevTick > resolution * 1.5 || prev5 < 0;
    let lanes3: number[];
    if (frets.length === 1) {
      const f = frets[0];
      let p: number;
      if (f === 0 || f === 4 || fresh) p = FOLD[f];
      else if (f === prev5) p = prev3;
      else {
        const dir = Math.sign(f - prev5);
        // at the edge a further move repeats the fret: the line never turns back
        p = Math.max(0, Math.min(2, prev3 + dir * (Math.abs(f - prev5) >= 3 ? 2 : 1)));
      }
      lanes3 = [p];
      prev5 = f;
      prev3 = p;
    } else {
      const lo = FOLD[frets[0]];
      let hi = FOLD[frets[frets.length - 1]];
      if (hi === lo) hi = Math.min(2, lo + 1);
      lanes3 = hi === lo ? [lo - 1, lo] : [lo, hi];
      prev5 = frets[frets.length - 1];
      prev3 = lanes3[lanes3.length - 1];
    }
    prevTick = t;
    for (const p of lanes3) pushRaw(out.notes, t, TOUCH_LANES[p], l);
  }
  return out;
}
