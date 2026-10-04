import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TempoMap } from '../src/chart/tempo.ts';
import { STRUM, noteListOf } from '../src/chart/types.ts';
import type { Track } from '../src/chart/types.ts';
import { Engine } from '../src/engine/engine.ts';

const tempo = new TempoMap([{ tick: 0, usPerQuarter: 500000 }], 192);
const track = (n: number): Track => ({
  instrument: 'guitar',
  difficulty: 'expert',
  notes: noteListOf(Array.from({ length: n }, (_, i) => ({ time: 1 + i * 0.5, mask: 1, type: STRUM }))),
  starPower: [],
  solos: [],
});

test('hits fill the rock meter, misses drain it, and running out is remembered', () => {
  const e = new Engine(track(40), tempo, { rockGain: 0.02, rockLoss: 0.07 });
  assert.equal(e.rock, 0.5);
  e.setFrets(0.9, 1);
  e.strum(1);
  assert.ok(Math.abs(e.rock - 0.52) < 1e-9);
  // let the next eight notes go by: 0.52 - 8 * 0.07 < 0
  e.advance(1 + 8 * 0.5 + 0.2);
  assert.equal(e.rock, 0);
  assert.ok(Number.isFinite(e.rockOutAt));
  const out = e.rockOutAt;
  e.advance(30);
  assert.equal(e.rockOutAt, out, 'the first time it ran out');
});

test('an overstrum costs less than a miss, and is capped at empty', () => {
  const e = new Engine(track(4), tempo, { rockLoss: 0.1 });
  e.strum(0.2);
  e.advance(0.5);
  assert.ok(Math.abs(e.rock - 0.44) < 1e-9);
});
