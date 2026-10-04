// Setlists: named, ordered lists of songs to play back to back. Stored by song id, kept in backups.

export interface Setlist {
  id: string;
  name: string;
  /** song ids, in play order */
  songs: string[];
}

const KEY = 'chsq.setlists';
let cache: Setlist[] | null = null;

export function validSetlist(x: unknown): x is Setlist {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.name === 'string' && Array.isArray(o.songs) && o.songs.every((s) => typeof s === 'string');
}

function all(): Setlist[] {
  if (!cache) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      cache = Array.isArray(raw) ? raw.filter(validSetlist) : [];
    } catch {
      cache = [];
    }
  }
  return cache;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(all()));
  } catch {
    // storage unavailable
  }
}

export function setlists(): readonly Setlist[] {
  return all();
}

export function getSetlist(id: string): Setlist | undefined {
  return all().find((s) => s.id === id);
}

/** A new, empty setlist named "Setlist N" unless a name is given. */
export function createSetlist(name?: string): Setlist {
  const list = all();
  let n = list.length + 1;
  while (list.some((s) => s.name === `Setlist ${n}`)) n++;
  const s: Setlist = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: name?.trim() || `Setlist ${n}`, songs: [] };
  list.push(s);
  save();
  return s;
}

export function renameSetlist(id: string, name: string): void {
  const s = getSetlist(id);
  if (!s || !name.trim()) return;
  s.name = name.trim();
  save();
}

export function deleteSetlist(id: string): void {
  cache = all().filter((s) => s.id !== id);
  save();
}

/** Add a song at the end; returns false when it is already in the setlist. */
export function addToSetlist(id: string, songId: string): boolean {
  const s = getSetlist(id);
  if (!s || s.songs.includes(songId)) return false;
  s.songs.push(songId);
  save();
  return true;
}

export function removeFromSetlist(id: string, index: number): void {
  const s = getSetlist(id);
  if (!s) return;
  s.songs.splice(index, 1);
  save();
}

/** Move a song up (-1) or down (+1); returns its new index. */
export function moveInSetlist(id: string, index: number, dir: number): number {
  const s = getSetlist(id);
  const to = index + dir;
  if (!s || to < 0 || to >= s.songs.length) return index;
  [s.songs[index], s.songs[to]] = [s.songs[to], s.songs[index]];
  save();
  return to;
}

/** Put the songs in a random order. */
export function shuffleSetlist(id: string): void {
  const s = getSetlist(id);
  if (!s) return;
  for (let i = s.songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s.songs[i], s.songs[j]] = [s.songs[j], s.songs[i]];
  }
  save();
}

/** Backups: setlists from another computer are added; one with the same id keeps the longer song list. */
export function mergeSetlists(mine: unknown, theirs: unknown): Setlist[] {
  const out = (Array.isArray(mine) ? mine : []).filter(validSetlist);
  for (const t of Array.isArray(theirs) ? theirs.filter(validSetlist) : []) {
    const i = out.findIndex((s) => s.id === t.id);
    if (i < 0) out.push(t);
    else if (t.songs.length > out[i].songs.length) out[i] = t;
  }
  return out;
}
