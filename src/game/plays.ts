// How often and how recently each song was played (for the "most played" and "recent" sorts).

export interface PlayStat {
  count: number;
  /** epoch ms of the last play */
  last: number;
}

const KEY = 'chsq.plays';
let cache: Record<string, PlayStat> | null = null;

function all(): Record<string, PlayStat> {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      cache = {};
    }
  }
  return cache!;
}

export function getPlays(songId: string): PlayStat | undefined {
  return all()[songId];
}

export function recordPlay(songId: string): void {
  const plays = all();
  const p = plays[songId] ?? { count: 0, last: 0 };
  p.count++;
  p.last = Date.now();
  plays[songId] = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(plays));
  } catch {
    // storage unavailable
  }
}
