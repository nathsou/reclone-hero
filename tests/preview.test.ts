import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewPlayer } from '../src/audio/preview.ts';
import type { Library } from '../src/library/library.ts';
import type { SongEntry } from '../src/library/song.ts';

test('a failed or superseded preview releases partially loaded URLs without throwing', async () => {
  const released: string[] = [];
  const library = {
    fileUrl: async (_: SongEntry, f: string) => { if (f === 'failed.wav') throw Error('superseded'); return `blob:${f}`; },
    release: (url: string) => released.push(url),
  } as unknown as Library;
  const player = new PreviewPlayer(library);
  await player.play({stems:{guitar:'ready.wav',song:'failed.wav'}} as unknown as SongEntry);
  assert.deepEqual(released,['blob:ready.wav']);
});

test('a canceled in-flight preview releases its late URL instead of playing it', async () => {
  const released: string[] = [];
  let finish!: (url: string) => void;
  const library = {
    fileUrl: () => new Promise<string>(resolve => { finish = resolve; }),
    release: (url: string) => released.push(url),
  } as unknown as Library;
  const player = new PreviewPlayer(library);
  const pending = player.play({stems:{preview:'preview.wav'}} as unknown as SongEntry);
  player.cancel(); finish('blob:late'); await pending;
  assert.deepEqual(released,['blob:late']);
});
