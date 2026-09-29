// Songs the player has starred. Stored by song id, like play history.

const KEY = 'chsq.favourites';
let cache: Set<string> | null = null;

function all(): Set<string> {
  if (!cache) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      cache = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      cache = new Set();
    }
  }
  return cache;
}

export function isFavourite(songId: string): boolean {
  return all().has(songId);
}

/** Star or unstar a song; returns whether it is now a favourite. */
export function toggleFavourite(songId: string): boolean {
  const set = all();
  const on = !set.has(songId);
  if (on) set.add(songId);
  else set.delete(songId);
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // storage unavailable
  }
  return on;
}

/** Forget the in-memory copy (after a backup import rewrote storage). */
export function reloadFavourites(): void {
  cache = null;
}
