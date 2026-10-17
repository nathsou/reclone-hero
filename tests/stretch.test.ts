import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stretchChannels, stretchJob } from '../src/audio/wsola.ts';

test('time-sliced stretching matches the synchronous path and returns the requested duration', () => {
  const input = new Float32Array(12000).map((_, i) => Math.sin(i / 10) * 0.4);
  for (const rate of [0.5, 0.8, 1.5]) {
    const sync = stretchChannels([input, input], rate);
    const gen = stretchJob([input, input], rate);
    let slices = 0;
    for (;;) {
      const r = gen.next();
      if (r.done) {
        assert.equal(r.value[0].length, Math.floor(input.length / rate));
        assert.deepEqual(r.value, sync);
        assert.ok(r.value[0].every(Number.isFinite));
        break;
      }
      slices++;
    }
    assert.ok(slices > 0);
  }
});
