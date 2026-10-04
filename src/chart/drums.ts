import type { RawTrack } from './types.ts';

/**
 * Settle a parsed drum track into 4-lane drums (Rock Band / Clone Hero): raw lanes 0 = kick, 1..4 = red,
 * yellow, blue, green, and `cymbals` naming the gems played on a cymbal (tick * 8 + lane).
 *
 * Guitar Hero's 5-lane charts (red, yellow, blue, orange, green: lane 5 present) are folded the way Clone
 * Hero does it: yellow is a cymbal (the hi-hat), orange becomes the green cymbal and green the green tom
 * (or the blue tom when the green lane is already taken there).
 */
export function finishDrumTrack(t: RawTrack, cymbals: Set<number>): void {
  const n = t.notes;
  const fiveLane = n.lane.includes(5);
  if (fiveLane) {
    cymbals = new Set();
    const used = new Set<number>();
    for (let i = 0; i < n.tick.length; i++) if (n.lane[i] !== 5) used.add(n.tick[i] * 8 + Math.min(4, n.lane[i]));
    for (let i = 0; i < n.tick.length; i++) {
      const tick = n.tick[i];
      const lane = n.lane[i];
      if (lane === 2 || lane === 4) cymbals.add(tick * 8 + lane);
      else if (lane === 5) n.lane[i] = used.has(tick * 8 + 4) && !used.has(tick * 8 + 3) ? 3 : 4;
    }
  }
  // the same gem twice (a 5-lane fold, or a sloppy chart) is played once
  const seen = new Set<number>();
  for (let i = n.tick.length - 1; i >= 0; i--) {
    const k = n.tick[i] * 8 + n.lane[i];
    if (seen.has(k)) {
      n.tick.splice(i, 1);
      n.lane.splice(i, 1);
      n.len.splice(i, 1);
    } else seen.add(k);
  }
  // only yellow, blue and green can be cymbals
  for (const k of cymbals) if (k % 8 < 2 || k % 8 > 4) cymbals.delete(k);
  t.cymbals = cymbals;
  // drum gems have no length (rolls and swells are not supported)
  n.len.fill(0);
}
