import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortAndGroup } from '../src/ui/songlist.ts';
import type { SongEntry } from '../src/library/song.ts';

function song(name: string, artist: string, extra: Partial<SongEntry> = {}): SongEntry {
  return {
    id: `${artist}/${name}`, path: `${artist}/${name}`, pack: '', name, artist, album: '', genre: '', year: '', charter: '', lengthMs: 0,
    chartFile: 'notes.chart', stems: {}, albumArt: null, background: null, video: null, videoStartMs: 0, diffs: {}, previewStartMs: 0,
    loadingPhrase: '', chartOptions: {}, ...extra,
  };
}

const songs = [
  song('Faint', 'Linkin Park', { diffs: { guitar: 4 }, year: '2003', lengthMs: 162000 }),
  song('Numb', 'Linkin Park', { diffs: { guitar: 3 }, year: '2003', lengthMs: 185000 }),
  song('White & Nerdy', '"Weird Al" Yankovic', { diffs: { guitar: 2 }, year: '2006' }),
  song("Baba O'Riley", 'The Who', { year: ', 1971', lengthMs: 300000 }),
  song('1985', 'Bowling for Soup', { diffs: { guitar: 3 } }),
];

test('groups by artist, ignoring "The" and leading punctuation', () => {
  const { songs: s, groups } = sortAndGroup(songs, 'artist', 'guitar');
  assert.deepEqual(groups.map((g) => [g.label, g.count]), [['Bowling for Soup', 1], ['Linkin Park', 2], ['"Weird Al" Yankovic', 1], ['The Who', 1]]);
  assert.deepEqual(s.map((x) => x.name), ['1985', 'Faint', 'Numb', 'White & Nerdy', "Baba O'Riley"]);
});

test('groups by title letter with digits under #', () => {
  const { groups } = sortAndGroup(songs, 'name', 'guitar');
  assert.deepEqual(groups.map((g) => g.label), ['#', 'B', 'F', 'N', 'W']);
});

test('groups by difficulty for the chosen instrument, unrated last', () => {
  const { groups } = sortAndGroup(songs, 'difficulty', 'guitar');
  assert.deepEqual(groups.map((g) => [g.label, g.count]), [['Difficulty 2', 1], ['Difficulty 3', 2], ['Difficulty 4', 1], ['Unrated', 1]]);
});

test('groups by year and length bucket', () => {
  assert.deepEqual(sortAndGroup(songs, 'year', 'guitar').groups.map((g) => g.label), ['1971', '2003', '2006', 'Unknown year']);
  assert.deepEqual(sortAndGroup(songs, 'length', 'guitar').groups.map((g) => g.label), ['2–3 minutes', '3–4 minutes', '5–6 minutes', 'Unknown length']);
});
