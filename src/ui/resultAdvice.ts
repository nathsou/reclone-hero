import type { Difficulty } from '../chart/types.ts';

/** A fallback when no particular mistake dominates. Never suggests a mode that isn't available. */
export function resultSummary(run: {
  hits: number; total: number; overstrums: number; sustainDrops: number;
  bot: boolean; practiceSpeed?: number; harderDifficulty?: Difficulty;
}): string {
  if (run.bot) return 'This was an autoplay run. Play the track yourself to set a best score.';
  if (!run.total) return 'No notes were judged in this run.';
  if (run.hits < run.total) return 'Nothing stood out. Practise the weaker sections to build consistency.';
  if (run.overstrums) return 'Every note was hit. Avoid extra presses or strums between notes to keep the streak going.';
  if (run.sustainDrops) return 'Every note was hit. Hold the frets until the sustain tails pass the line.';
  if (run.practiceSpeed !== undefined) return run.practiceSpeed < 1
    ? `Clean practice run at ${Math.round(run.practiceSpeed * 100)}% speed. Try increasing the speed when this feels comfortable.`
    : 'Clean practice run. Try the full song with these patterns in mind.';
  return run.harderDifficulty
    ? `A clean run. Try ${run.harderDifficulty[0].toUpperCase()}${run.harderDifficulty.slice(1)} next.`
    : 'A clean run at the highest available difficulty. Try another track or aim for a higher score with Star Power.';
}
