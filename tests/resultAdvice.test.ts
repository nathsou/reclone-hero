import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultSummary } from '../src/ui/resultAdvice.ts';
const clean = {hits:100,total:100,overstrums:0,sustainDrops:0,bot:false};
test('clean Expert or highest chart never suggests a harder difficulty', () => {
  const advice = resultSummary(clean);
  assert.ok(advice.includes('highest available difficulty'));
  assert.ok(!advice.includes('harder'));
  assert.ok(resultSummary({...clean, harderDifficulty:'expert'}).includes('Try Expert next'));
});
test('bot, practice, empty and imperfect runs get relevant advice', () => {
  assert.ok(resultSummary({...clean,bot:true}).includes('autoplay'));
  assert.ok(resultSummary({...clean,practiceSpeed:0.7}).includes('70% speed'));
  assert.ok(resultSummary({...clean,practiceSpeed:1}).includes('full song'));
  assert.ok(resultSummary({...clean,total:0,hits:0}).includes('No notes'));
  assert.ok(resultSummary({...clean,overstrums:1}).includes('extra presses'));
  assert.ok(resultSummary({...clean,sustainDrops:1}).includes('sustain tails'));
  assert.ok(!resultSummary({...clean,hits:99}).includes('clean run'));
});
