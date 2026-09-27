import type { Instrument } from '../chart/types.ts';
import type { SongEntry } from '../library/song.ts';

export const SORTS = ['artist', 'name', 'difficulty', 'length', 'year', 'genre', 'charter', 'pack'] as const;
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
};

export interface Group {
  label: string;
  /** difficulty rating shown as pips, when grouping by difficulty */
  rating?: number;
  /** index of the group's first song in the sorted list */
  start: number;
  count: number;
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
  const r = s.diffs[instrument] ?? (instrument === 'guitarcoop' ? s.diffs.guitar : undefined);
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
  if (Number.isNaN(b)) return 'Unknown length';
  if (b === 0) return 'Under 2 minutes';
  if (b === LENGTH_BUCKETS.length) return `${LENGTH_BUCKETS[b - 1] / 60}+ minutes`;
  return `${LENGTH_BUCKETS[b - 1] / 60}–${LENGTH_BUCKETS[b] / 60} minutes`;
}

/** Numeric group key: NaN (unknown) always sorts last. */
function cmpNum(a: number, b: number): number {
  const an = Number.isNaN(a);
  const bn = Number.isNaN(b);
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  return a - b;
}

function cmpText(a: string, b: string): number {
  if (!a || !b) return a === b ? 0 : a ? -1 : 1; // blanks last
  return collator.compare(a, b);
}

/**
 * Sort songs and split them into labelled groups, the way Clone Hero shows its song list:
 * by artist the header is the artist, by title it is the first letter, and so on.
 */
export function sortAndGroup(input: SongEntry[], by: SortKey, instrument: Instrument): { songs: SongEntry[]; groups: Group[] } {
  const byArtistTitle = (a: SongEntry, b: SongEntry) => cmpText(nameKey(a.artist), nameKey(b.artist)) || cmpText(nameKey(a.name), nameKey(b.name));
  let groupOf: (s: SongEntry) => { key: string; label: string; rating?: number };
  let cmp: (a: SongEntry, b: SongEntry) => number;
  switch (by) {
    case 'name': {
      const letter = (s: SongEntry) => {
        const c = nameKey(s.name).charAt(0).toUpperCase();
        return /\p{L}/u.test(c) ? c : '#';
      };
      cmp = (a, b) => cmpText(nameKey(a.name), nameKey(b.name)) || byArtistTitle(a, b);
      groupOf = (s) => ({ key: letter(s), label: letter(s) });
      break;
    }
    case 'difficulty':
      cmp = (a, b) => cmpNum(ratingOf(a, instrument), ratingOf(b, instrument)) || byArtistTitle(a, b);
      groupOf = (s) => {
        const r = ratingOf(s, instrument);
        return Number.isNaN(r) ? { key: 'x', label: 'Unrated' } : { key: String(r), label: `Difficulty ${r}`, rating: r };
      };
      break;
    case 'length':
      cmp = (a, b) => cmpNum(lengthBucket(a.lengthMs), lengthBucket(b.lengthMs)) || (a.lengthMs - b.lengthMs) || byArtistTitle(a, b);
      groupOf = (s) => {
        const b = lengthBucket(s.lengthMs);
        return { key: String(b), label: lengthLabel(b) };
      };
      break;
    case 'year':
      cmp = (a, b) => cmpNum(yearOf(a), yearOf(b)) || byArtistTitle(a, b);
      groupOf = (s) => {
        const y = yearOf(s);
        return Number.isNaN(y) ? { key: 'x', label: 'Unknown year' } : { key: String(y), label: String(y) };
      };
      break;
    case 'genre':
      cmp = (a, b) => cmpText(a.genre.toLowerCase(), b.genre.toLowerCase()) || byArtistTitle(a, b);
      groupOf = (s) => ({ key: s.genre.toLowerCase(), label: s.genre || 'Unknown genre' });
      break;
    case 'charter':
      cmp = (a, b) => cmpText(a.charter.toLowerCase(), b.charter.toLowerCase()) || byArtistTitle(a, b);
      groupOf = (s) => ({ key: s.charter.toLowerCase(), label: s.charter || 'Unknown charter' });
      break;
    case 'pack':
      cmp = (a, b) => cmpText(a.pack, b.pack) || cmpText(a.path, b.path);
      groupOf = (s) => ({ key: s.pack, label: s.pack || 'Loose songs' });
      break;
    default:
      cmp = byArtistTitle;
      groupOf = (s) => ({ key: nameKey(s.artist), label: s.artist });
  }
  const songs = input.slice().sort(cmp);
  const groups: Group[] = [];
  let lastKey: string | null = null;
  songs.forEach((s, i) => {
    const g = groupOf(s);
    if (g.key !== lastKey) {
      groups.push({ label: g.label, rating: g.rating, start: i, count: 0 });
      lastKey = g.key;
    }
    groups[groups.length - 1].count++;
  });
  return { songs, groups };
}
