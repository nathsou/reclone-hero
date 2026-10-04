import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOPO, STRUM, TAP, noteListOf } from '../src/chart/types.ts';
import type { Track } from '../src/chart/types.ts';
import { applyModifiers, countsForBest, toggleModifier, windowScale } from '../src/game/modifiers.ts';

const track: Track = {
  instrument: 'guitar',
  difficulty: 'expert',
  notes: noteListOf([
    { time: 0, mask: 0b00001, type: STRUM },
    { time: 0.2, mask: 0b00010, type: HOPO },
    { time: 0.4, mask: 0b00011, type: STRUM },
    { time: 0.6, mask: 0, type: STRUM },
    { time: 0.8, mask: 0b10000, type: TAP, sp: 0 },
  ]),
  starPower: [{ startTime: 0.8, endTime: 1, first: 4, last: 4 }],
  solos: [],
};

test('mirror flips frets, keeps open notes, and never touches the original', () => {
  const m = applyModifiers(track, ['mirror']);
  assert.deepEqual(Array.from(m.notes.mask), [0b10000, 0b01000, 0b11000, 0, 0b00001]);
  assert.deepEqual(Array.from(m.notes.type), Array.from(track.notes.type));
  assert.equal(m.notes.sp[4], 0);
  assert.equal(track.notes.mask[0], 0b00001);
  assert.equal(applyModifiers(track, []), track, 'no note modifiers: the same track');
  assert.equal(applyModifiers(track, ['precision']), track);
});

test('note type modifiers', () => {
  assert.deepEqual(Array.from(applyModifiers(track, ['strums']).notes.type), [STRUM, STRUM, STRUM, STRUM, STRUM]);
  assert.deepEqual(Array.from(applyModifiers(track, ['hopos']).notes.type), [HOPO, HOPO, HOPO, HOPO, HOPO]);
  // an open note cannot be a tap
  assert.deepEqual(Array.from(applyModifiers(track, ['taps']).notes.type), [TAP, TAP, TAP, HOPO, TAP]);
});

test('toggling keeps one note type at a time, and easier runs set no bests', () => {
  assert.deepEqual(toggleModifier(['mirror', 'strums'], 'taps'), ['mirror', 'taps']);
  assert.deepEqual(toggleModifier(['mirror', 'taps'], 'mirror'), ['taps']);
  assert.deepEqual(toggleModifier(['bogus'], 'precision'), ['precision']);
  assert.ok(countsForBest(['mirror', 'strums', 'precision']));
  assert.ok(!countsForBest(['taps']));
  assert.equal(windowScale(['precision']), 0.5);
  assert.equal(windowScale([]), 1);
});
