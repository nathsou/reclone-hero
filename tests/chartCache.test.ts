import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartFor } from '../src/game/charts.ts';
import type { Library } from '../src/library/library.ts';
import { makeSongEntry } from '../src/library/song.ts';
const song = makeSongEntry({ path: 'same-path', files: ['notes.chart', 'guitar.ogg'], ini: null, chartHead: null })!;
const bytes = (lane: number) => new TextEncoder().encode(`[Song]\n{\n Resolution = 192\n}\n[ExpertSingle]\n{\n 0 = N ${lane} 0\n}\n`);

test('same relative path in different libraries reads the correct chart', async () => {
  const a = { revision: 0, readFile: async () => bytes(0) } as unknown as Library;
  const b = { revision: 0, readFile: async () => bytes(4) } as unknown as Library;
  assert.equal((await chartFor(a, song)).tracks.get('guitar:expert')!.notes.mask[0], 1);
  assert.equal((await chartFor(b, song)).tracks.get('guitar:expert')!.notes.mask[0], 16);
});

test('rescan invalidates cached data; concurrent reads within one scan are shared', async () => {
  let lane = 0, reads = 0;
  const library = { revision: 0, readFile: async () => { reads++; return bytes(lane); } } as unknown as Library;
  const a = chartFor(library, song);
  assert.equal(chartFor(library, song), a);
  await a;
  lane = 3;
  library.revision++;
  assert.equal((await chartFor(library, song)).tracks.get('guitar:expert')!.notes.mask[0], 8);
  assert.equal(reads, 2);
});
