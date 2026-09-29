/** What a run was played with. */
export type PlayedWith = 'guitar' | 'keyboard' | 'touch';

export const PLAYED_WITH_LABEL: Record<PlayedWith, string> = { guitar: 'Guitar', keyboard: 'Keyboard', touch: 'Touch' };

export interface BestScore {
  score: number;
  stars: number;
  accuracy: number;
  fc: boolean;
  date: number;
  /** controls used for the run (missing on scores from before this was recorded) */
  input?: PlayedWith;
}

const KEY = 'chsq.scores';
let cache: Record<string, BestScore> | null = null;

function all(): Record<string, BestScore> {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      cache = {};
    }
  }
  return cache!;
}

export function scoreKey(songId: string, trackKey: string): string {
  return `${songId}|${trackKey}`;
}

export function getBest(key: string): BestScore | undefined {
  return all()[key];
}

/** Returns true when this is a new best. */
export function recordScore(key: string, s: BestScore): boolean {
  const scores = all();
  const prev = scores[key];
  if (prev && prev.score >= s.score) return false;
  scores[key] = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(scores));
  } catch {
    // storage full or unavailable
  }
  return true;
}
