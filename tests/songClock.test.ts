import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SongClock } from '../src/audio/songClock.ts';

test('late output timestamps never make opening notes run at half speed', () => {
  for (const fps of [30, 60, 120]) for (const rate of [0.5, 1, 1.5]) {
    const clock = new SongClock();
    clock.sync(-2, 0, rate);
    let prev = -2;
    for (let i = 1; i <= fps * 3; i++) {
      const perf = i * 1000 / fps;
      // Browser begins exposing an output timestamp 200 ms behind its original estimate.
      const raw = -2 + perf / 1000 * rate - (i > fps / 2 ? 0.2 : 0);
      clock.sync(raw, perf, rate);
      const time = clock.time(perf, rate);
      assert.ok(time - prev >= rate / fps * 0.979, `${fps} fps, rate ${rate}: notes slowed down`);
      assert.ok(time - prev <= rate / fps * 1.021);
      prev = time;
    }
  }
});

test('long frames follow elapsed audio time, and restarting discards the previous anchor', () => {
  const clock = new SongClock();
  clock.sync(0, 0, 1);
  clock.sync(0.7, 700, 1);
  assert.equal(clock.time(700, 1), 0.7);
  clock.reset();
  clock.sync(-2.5, 800, 1);
  assert.equal(clock.time(800, 1), -2.5);
});
