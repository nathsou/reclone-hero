import type { Instrument } from '../chart/types.ts';
import type { PlayStat } from '../game/plays.ts';
import type { SongEntry } from '../library/song.ts';

export const SORTS = ['artist', 'name', 'difficulty', 'length', 'year', 'genre', 'charter', 'pack', 'plays', 'recent'] as const;
export type SortKey = (typeof SORTS)[number];

export const SORT_LABEL: Record<SortKey, string> = {
  artist: 'Artist',
  name: 'Title',
  difficulty: 'Difficulty',
  length: 'Length',
  year: 'Year',
  genre: 'Genre',
  charter: 'Charter',
  pack: 'Folder',
  plays: 'Most played',
  recent: 'Recently played',
};

/** What the natural and the reversed direction mean, for the direction toggle. */
export const SORT_DIRECTION: Record<SortKey, [string, string]> = {
  artist: ['A → Z', 'Z → A'],
  name: ['A → Z', 'Z → A'],
  difficulty: ['Easiest first', 'Hardest first'],
  length: ['Shortest first', 'Longest first'],
  year: ['Oldest first', 'Newest first'],
  genre: ['A → Z', 'Z → A'],
  charter: ['A → Z', 'Z → A'],
  pack: ['A → Z', 'Z → A'],
  plays: ['Most played first', 'Least played first'],
  recent: ['Most recent first', 'Least recent first'],
};

export interface Group {
  label: string;
  /** difficulty rating shown as pips, when grouping by difficulty */
  rating?: number;
  /** index of the group's first song in the sorted list */
  start: number;
  count: number;
}

export interface SortOptions {
  instrument: Instrument;
  reverse?: boolean;
  plays?: (songId: string) => PlayStat | undefined;
  /** "now" for the recently played buckets (ms) */
  now?: number;
}

/** Sort key ignoring leading punctuation and "The ", so '"Weird Al"' and "The Who" sort under W. */
export function nameKey(x: string): string {
  return x
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/^the\s+/i, '')
    .toLowerCase();
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function yearOf(s: SongEntry): number {
  const m = /(\d{4})/.exec(s.year);
  return m ? Number(m[1]) : NaN;
}

function ratingOf(s: SongEntry, instrument: Instrument): number {
  const r = s.diffs[instrument] ?? (instrument === 'guitarcoop' || instrument === 'touch' ? s.diffs.guitar : undefined);
  return r === undefined || r < 0 ? NaN : r;
}

const LENGTH_BUCKETS = [120, 180, 240, 300, 360, 420];
function lengthBucket(ms: number): number {
  if (!ms) return NaN;
  const s = ms / 1000;
  let b = 0;
  while (b < LENGTH_BUCKETS.length && s >= LENGTH_BUCKETS[b]) b++;
  return b;
}
function lengthLabel(b: number): string {
  if (b === 0) return 'Under 2 minutes';
  if (b === LENGTH_BUCKETS.length) return `${LENGTH_BUCKETS[b - 1] / 60}+ minutes`;
  return `${LENGTH_BUCKETS[b - 1] / 60}–${LENGTH_BUCKETS[b] / 60} minutes`;
}

const PLAY_BUCKETS: [number, string][] = [
  [20, '20+ plays'],
  [10, '10–19 plays'],
  [5, '5–9 plays'],
  [2, '2–4 plays'],
  [1, 'Played once'],
];

const DAY = 86400000;
function recencyLabel(last: number, now: number): [number, string] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (last >= startOfToday) return [0, 'Today'];
  if (last >= startOfToday - DAY) return [1, 'Yesterday'];
  if (now - last < 7 * DAY) return [2, 'This week'];
  if (now - last < 31 * DAY) return [3, 'This month'];
  if (now - last < 365 * DAY) return [4, 'This year'];
  return [5, 'Longer ago'];
}

interface SortDef {
  /** natural-order comparison of two songs that both have a value */
  primary: (a: SongEntry, b: SongEntry) => number;
  /** songs without a value always sort last, in their own group */
  unknown: (s: SongEntry) => boolean;
  unknownLabel: string;
  group: (s: SongEntry) => { key: string; label: string; rating?: number };
}

function cmpText(a: string, b: string): number {
  return collator.compare(a, b);
}

/**
 * Sort songs and split them into labelled groups, the way Clone Hero shows its song list:
 * by artist the header is the artist, by title it is the first letter, and so on.
 * `reverse` flips the natural direction; songs with no value (no year, never played…) stay last.
 */
export function sortAndGroup(input: SongEntry[], by: SortKey, opts: SortOptions): { songs: SongEntry[]; groups: Group[] } {
  const { instrument } = opts;
  const plays = opts.plays ?? (() => undefined);
  const now = opts.now ?? Date.now();
  const byArtistTitle = (a: SongEntry, b: SongEntry) => cmpText(nameKey(a.artist), nameKey(b.artist)) || cmpText(nameKey(a.name), nameKey(b.name));
  const letter = (s: SongEntry) => {
    const c = nameKey(s.name).charAt(0).toUpperCase();
    return /\p{L}/u.test(c) ? c : '#';
  };
  const defs: Record<SortKey, SortDef> = {
    artist: {
      primary: byArtistTitle,
      unknown: () => false,
      unknownLabel: '',
      group: (s) => ({ key: nameKey(s.artist), label: s.artist }),
    },
    name: {
      primary: (a, b) => cmpText(nameKey(a.name), nameKey(b.name)),
      unknown: () => false,
      unknownLabel: '',
      group: (s) => ({ key: letter(s), label: letter(s) }),
    },
    difficulty: {
      primary: (a, b) => ratingOf(a, instrument) - ratingOf(b, instrument),
      unknown: (s) => Number.isNaN(ratingOf(s, instrument)),
      unknownLabel: 'Unrated',
      group: (s) => {
        const r = ratingOf(s, instrument);
        return { key: String(r), label: `Difficulty ${r}`, rating: r };
      },
    },
    length: {
      primary: (a, b) => a.lengthMs - b.lengthMs,
      unknown: (s) => !s.lengthMs,
      unknownLabel: 'Unknown length',
      group: (s) => ({ key: String(lengthBucket(s.lengthMs)), label: lengthLabel(lengthBucket(s.lengthMs)) }),
    },
    year: {
      primary: (a, b) => yearOf(a) - yearOf(b),
      unknown: (s) => Number.isNaN(yearOf(s)),
      unknownLabel: 'Unknown year',
      group: (s) => ({ key: String(yearOf(s)), label: String(yearOf(s)) }),
    },
    genre: {
      primary: (a, b) => cmpText(a.genre.toLowerCase(), b.genre.toLowerCase()),
      unknown: (s) => !s.genre,
      unknownLabel: 'Unknown genre',
      group: (s) => ({ key: s.genre.toLowerCase(), label: s.genre }),
    },
    charter: {
      primary: (a, b) => cmpText(a.charter.toLowerCase(), b.charter.toLowerCase()),
      unknown: (s) => !s.charter,
      unknownLabel: 'Unknown charter',
      group: (s) => ({ key: s.charter.toLowerCase(), label: s.charter }),
    },
    pack: {
      primary: (a, b) => cmpText(a.pack, b.pack) || cmpText(a.path, b.path),
      unknown: (s) => !s.pack,
      unknownLabel: 'Loose songs',
      group: (s) => ({ key: s.pack, label: s.pack }),
    },
    plays: {
      // natural order: most played first
      primary: (a, b) => plays(b.id)!.count - plays(a.id)!.count,
      unknown: (s) => !plays(s.id)?.count,
      unknownLabel: 'Never played',
      group: (s) => {
        const n = plays(s.id)!.count;
        const [, label] = PLAY_BUCKETS.find(([min]) => n >= min)!;
        return { key: label, label };
      },
    },
    recent: {
      // natural order: most recent first
      primary: (a, b) => plays(b.id)!.last - plays(a.id)!.last,
      unknown: (s) => !plays(s.id)?.last,
      unknownLabel: 'Never played',
      group: (s) => {
        const [key, label] = recencyLabel(plays(s.id)!.last, now);
        return { key: String(key), label };
      },
    },
  };
  const def = defs[by];
  const dir = opts.reverse ? -1 : 1;
  const unknownOf = new Map<SongEntry, boolean>();
  for (const s of input) unknownOf.set(s, def.unknown(s));
  const songs = input.slice().sort((a, b) => {
    const ua = unknownOf.get(a)!;
    const ub = unknownOf.get(b)!;
    if (ua || ub) return ua === ub ? byArtistTitle(a, b) : ua ? 1 : -1;
    return def.primary(a, b) * dir || byArtistTitle(a, b);
  });
  const groups: Group[] = [];
  let lastKey: string | null = null;
  songs.forEach((s, i) => {
    const g = unknownOf.get(s) ? { key: '\u0000unknown', label: def.unknownLabel } : def.group(s);
    if (g.key !== lastKey) {
      groups.push({ label: g.label, rating: g.rating, start: i, count: 0 });
      lastKey = g.key;
    }
    groups[groups.length - 1].count++;
  });
  return { songs, groups };
}

/**
 * What makes two songs the same song: artist and title, ignoring case, accents, punctuation, a leading
 * "The", and "&" against "and".
 */
export function duplicateKey(s: Pick<SongEntry, 'artist' | 'name'>): string {
  const norm = (x: string) =>
    nameKey(x.normalize('NFKD'))
      .replace(/\p{M}/gu, '')
      .replace(/&/g, 'and')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  return `${norm(s.artist)}|${norm(s.name)}`;
}

/** Songs that are in the library more than once: song id -> every copy (itself included). */
export function findDuplicates(songs: readonly SongEntry[]): Map<string, SongEntry[]> {
  const byKey = new Map<string, SongEntry[]>();
  for (const s of songs) {
    const k = duplicateKey(s);
    const list = byKey.get(k);
    if (list) list.push(s);
    else byKey.set(k, [s]);
  }
  const out = new Map<string, SongEntry[]>();
  for (const list of byKey.values()) if (list.length > 1) for (const s of list) out.set(s.id, list);
  return out;
}
