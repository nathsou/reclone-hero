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
  const { songs: s, groups } = sortAndGroup(songs, 'artist', { instrument: 'guitar' });
  assert.deepEqual(groups.map((g) => [g.label, g.count]), [['Bowling for Soup', 1], ['Linkin Park', 2], ['"Weird Al" Yankovic', 1], ['The Who', 1]]);
  assert.deepEqual(s.map((x) => x.name), ['1985', 'Faint', 'Numb', 'White & Nerdy', "Baba O'Riley"]);
});

test('groups by title letter with digits under #', () => {
  const { groups } = sortAndGroup(songs, 'name', { instrument: 'guitar' });
  assert.deepEqual(groups.map((g) => g.label), ['#', 'B', 'F', 'N', 'W']);
});

test('groups by difficulty for the chosen instrument, unrated last', () => {
  const { groups } = sortAndGroup(songs, 'difficulty', { instrument: 'guitar' });
  assert.deepEqual(groups.map((g) => [g.label, g.count]), [['Difficulty 2', 1], ['Difficulty 3', 2], ['Difficulty 4', 1], ['Unrated', 1]]);
});

test('groups by year and length bucket', () => {
  assert.deepEqual(sortAndGroup(songs, 'year', { instrument: 'guitar' }).groups.map((g) => g.label), ['1971', '2003', '2006', 'Unknown year']);
  assert.deepEqual(sortAndGroup(songs, 'length', { instrument: 'guitar' }).groups.map((g) => g.label), ['2–3 minutes', '3–4 minutes', '5–6 minutes', 'Unknown length']);
});

test('reversed sorts keep unknown values last', () => {
  const { groups } = sortAndGroup(songs, 'difficulty', { instrument: 'guitar', reverse: true });
  assert.deepEqual(groups.map((g) => g.label), ['Difficulty 4', 'Difficulty 3', 'Difficulty 2', 'Unrated']);
  const byYear = sortAndGroup(songs, 'year', { instrument: 'guitar', reverse: true });
  assert.deepEqual(byYear.groups.map((g) => g.label), ['2006', '2003', '1971', 'Unknown year']);
});

test('most played and recently played', () => {
  const now = new Date(2026, 8, 27, 18).getTime();
  const stats: Record<string, { count: number; last: number }> = {
    'Linkin Park/Faint': { count: 12, last: now - 3600000 },
    'Linkin Park/Numb': { count: 1, last: now - 3 * 86400000 },
    '"Weird Al" Yankovic/White & Nerdy': { count: 3, last: now - 40 * 86400000 },
  };
  const plays = (id: string) => stats[id];
  const most = sortAndGroup(songs, 'plays', { instrument: 'guitar', plays, now });
  assert.deepEqual(most.songs.slice(0, 3).map((s) => s.name), ['Faint', 'White & Nerdy', 'Numb']);
  assert.deepEqual(most.groups.map((g) => g.label), ['10–19 plays', '2–4 plays', 'Played once', 'Never played']);
  const recent = sortAndGroup(songs, 'recent', { instrument: 'guitar', plays, now });
  assert.deepEqual(recent.groups.map((g) => g.label), ['Today', 'This week', 'This year', 'Never played']);
  const least = sortAndGroup(songs, 'plays', { instrument: 'guitar', plays, now, reverse: true });
  assert.equal(least.songs[0].name, 'Numb');
});

import { familyOf, passesGenreFilter } from '../src/library/genres.ts';

test('genre families and filters', () => {
  assert.equal(familyOf('Progressive Metal'), 'Metal');
  assert.equal(familyOf('Metalcore'), 'Metal');
  assert.equal(familyOf('Djent'), 'Metal');
  assert.equal(familyOf('Pop Punk'), 'Punk');
  assert.equal(familyOf('Post-Hardcore'), 'Punk');
  assert.equal(familyOf('Classic Rock'), 'Rock');
  assert.equal(familyOf('Pop Rock'), 'Rock');
  assert.equal(familyOf('Drum and Bass'), 'Electronic');
  assert.equal(familyOf('Synth-Pop'), 'Electronic');
  assert.equal(familyOf('Jazz Fusion'), 'Jazz & Blues');
  assert.equal(familyOf('Hip-Hop'), 'Hip-Hop & R&B');
  assert.equal(familyOf(''), 'Unknown');
  const hideMetal = { mode: 'hide' as const, items: ['f:Metal'] };
  assert.equal(passesGenreFilter('Thrash Metal', hideMetal), false);
  assert.equal(passesGenreFilter('Classic Rock', hideMetal), true);
  const onlyRockElectro = { mode: 'only' as const, items: ['f:Rock', 'f:Electronic'] };
  assert.equal(passesGenreFilter('Grunge', onlyRockElectro), true);
  assert.equal(passesGenreFilter('Chiptune', onlyRockElectro), true);
  assert.equal(passesGenreFilter('Power Metal', onlyRockElectro), false);
  assert.equal(passesGenreFilter('pop punk', { mode: 'only', items: ['g:pop punk'] }), true);
});
