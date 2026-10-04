import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRUM, noteListOf } from '../src/chart/types.ts';
import { SKIP_LEAD, canSkip, findGaps, gapAt, skipTarget } from '../src/game/gaps.ts';

const note = (time: number, endTime = time) => ({ time, endTime, mask: 1, type: STRUM as typeof STRUM });

test('a long intro and a long break are gaps; ordinary rests and sustains are not', () => {
  const notes = noteListOf([note(45), note(46), note(50, 60), note(70), note(71), note(90)]);
  const gaps = findGaps(notes, 0);
  // 45 s intro; 50→60 is a sustain so the 60→70 rest is 10 s (too short); 71→90 is a 19 s break
  assert.deepEqual(gaps, [
    { from: 0, to: 45, intro: true },
    { from: 71, to: 90, intro: false },
  ]);
  assert.equal(gapAt(gaps, 10), gaps[0]);
  assert.equal(gapAt(gaps, 55), null);
  assert.equal(gapAt(gaps, 80), gaps[1]);
});

test('short intros get no countdown', () => {
  assert.deepEqual(findGaps(noteListOf([note(4.9), note(6)]), 0), []);
  assert.equal(findGaps(noteListOf([note(5), note(6)]), 0).length, 1);
  // play starting before 0 (a lead-in) still measures the intro from the song start
  assert.deepEqual(findGaps(noteListOf([note(6)]), -2), [{ from: 0, to: 6, intro: true }]);
  assert.deepEqual(findGaps(noteListOf([]), 0), []);
});

test('a skip lands a few seconds before the note, and only when it saves time', () => {
  const g = { from: 0, to: 45, intro: true };
  assert.equal(skipTarget(g), 45 - SKIP_LEAD);
  assert.ok(canSkip(g, 10));
  assert.ok(!canSkip(g, 41.5), 'less than a second would be saved');
  assert.ok(!canSkip(null, 10));
  // slowed down, the lead scales with the speed so it lasts as long in real time
  assert.equal(skipTarget(g, 0.5), 45 - SKIP_LEAD * 0.5);
});

test('practice ranges only look at their own notes', () => {
  const notes = noteListOf([note(1), note(2), note(30), note(31)]);
  assert.deepEqual(findGaps(notes, 28, 2, 3), []);
  assert.deepEqual(findGaps(notes, 0, 0, 2), [{ from: 2, to: 30, intro: false }]);
});
