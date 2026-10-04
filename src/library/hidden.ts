// Songs the player removed from the song list without deleting them (e.g. a duplicate on a drive the
// game may only read). Stored by song id, like favourites, and kept in backups.

const KEY = 'chsq.hidden';
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

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...all()]));
  } catch {
    // storage unavailable
  }
}

export function isHidden(songId: string): boolean {
  return all().has(songId);
}

export function hideSong(songId: string): void {
  all().add(songId);
  save();
}

/** Show every hidden song again. */
export function unhideAll(): void {
  all().clear();
  save();
}
