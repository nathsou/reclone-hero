import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stemsJob, runJob } from '../src/starter/synth.ts';
import { renderSong } from '../src/starter/render.ts';
import { STARTER_SONGS } from '../src/starter/songs/index.ts';

test('transferable PCM preserves stereo stems, duration and rendered samples', () => {
  const def = STARTER_SONGS.find(s => s.id === 'midnight-drive')!;
  const rate = 8000;
  const pcm = runJob(stemsJob(def.id, rate));
  let pos = 0;
  for (const block of renderSong(def, rate)) {
    for (const [actual, expected] of [[pcm.guitar[0], block.pl], [pcm.guitar[1], block.pr], [pcm.song[0], block.bl], [pcm.song[1], block.br]]) {
      for (let i = 0; i < block.n; i++) {
        assert.equal(actual[pos + i], expected[i]);
        assert.ok(Number.isFinite(actual[pos + i]));
      }
    }
    pos += block.n;
  }
  assert.ok(Math.abs(pos - pcm.guitar[0].length) <= 1);
  assert.equal(pcm.sampleRate, rate);
});
