// Highway dimensions and note travel, shared by the renderer, the game and the settings previews.

/** Half the highway's width, in world units (one unit per lane). */
export const HALF = 2.65;
/** Full highway length in front of the strike line, in world units (the far end at Highway length 100%). */
export const LEN = 26;
/** How far the highway runs on behind the strike line. */
export const BEHIND = 3;
/** World units per second at note speed 1×. */
export const BASE_SPEED = 11;

/** Seconds of notes visible ahead of the strike line. */
export function lookahead(noteSpeed: number, highwayLength: number): number {
  return (LEN * highwayLength) / (BASE_SPEED * noteSpeed);
}
