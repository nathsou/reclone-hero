// Genre families: song.ini genres are free text ("Progressive Metal", "Pop Punk", …). Families let a
// filter like "hide Metal" also catch metalcore, djent and deathcore.

export const FAMILIES = [
  'Metal',
  'Punk',
  'Rock',
  'Electronic',
  'Hip-Hop & R&B',
  'Jazz & Blues',
  'Funk & Disco',
  'Pop',
  'Country & Folk',
  'Classical',
  'Soundtrack & Games',
  'Other',
  'Unknown',
] as const;
export type Family = (typeof FAMILIES)[number];

const RULES: [Family, RegExp][] = [
  ['Metal', /metal|djent|deathcore|metalcore|mathcore|grindcore|thrash|doom|sludge|shred/],
  // dance music that borrows "hardcore" in its name, before the punk rule claims it
  ['Electronic', /happy hardcore|speedcore|drumstep|future bass|\bidm\b|darkwave|trip.?hop/],
  ['Punk', /punk|hardcore|emo\b|ska\b/],
  ['Rock', /rock|grunge|britpop|new wave|surf|alternative|\balt\b|shoegaze|indie$|\bprog\b|psychobilly|visual kei|^glam$/],
  ['Electronic', /electr|edm|synth|trance|techno|house|dubstep|drum ?(and|&|n) ?bass|dnb|chiptune|industrial|breakbeat|eurobeat|dance|vaporwave|8.?bit/],
  ['Hip-Hop & R&B', /hip.?hop|rap\b|r&b|rnb|soul|trap\b|grime/],
  ['Jazz & Blues', /jazz|blues|swing|fusion|bebop|bossa|flamenco|ragtime|lounge/],
  ['Funk & Disco', /funk|disco|groove/],
  ['Pop', /pop|schlager|indie|j-?pop|k-?pop|cabaret/],
  ['Country & Folk', /country|folk|bluegrass|celtic|americana|western/],
  ['Classical', /classical|orchestr|symphon|baroque|piano|opera|instrumental/],
  ['Soundtrack & Games', /soundtrack|video ?game|vgm|\bgame|anime|\bost\b|medley|musical|meme/],
];

const memo = new Map<string, Family>();

/** Family of a genre string (case-insensitive). */
export function familyOf(genre: string): Family {
  const g = genre.trim().toLowerCase();
  if (!g) return 'Unknown';
  let f = memo.get(g);
  if (!f) {
    f = RULES.find(([, re]) => re.test(g))?.[0] ?? 'Other';
    memo.set(g, f);
  }
  return f;
}

/** Normalised genre key: lower case, trimmed ("" for none). */
export function genreKey(genre: string): string {
  return genre.trim().toLowerCase();
}

export interface GenreFilter {
  /** only: keep matching songs; hide: drop them */
  mode: 'only' | 'hide';
  /** selected families ("f:Metal") and exact genres ("g:pop punk") */
  items: string[];
}

export function genreFilterActive(f: GenreFilter): boolean {
  return f.items.length > 0;
}

/** Does a song's genre match the filter's selection? */
export function genreSelected(genre: string, f: GenreFilter): boolean {
  const g = genreKey(genre);
  return f.items.includes(`g:${g}`) || f.items.includes(`f:${familyOf(genre)}`);
}

export function passesGenreFilter(genre: string, f: GenreFilter): boolean {
  if (!f.items.length) return true;
  const sel = genreSelected(genre, f);
  return f.mode === 'only' ? sel : !sel;
}
