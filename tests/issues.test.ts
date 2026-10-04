import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart } from '../src/chart/build.ts';
import { parseDotChart } from '../src/chart/dotchart.ts';
import { chartIssues, worstLevel } from '../src/chart/issues.ts';

function chart(notes: string, opts: { bpm?: number; extra?: string } = {}) {
  const text = `[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B ${(opts.bpm ?? 120) * 1000}
}
[Events]
{
}
${opts.extra ?? ''}[ExpertSingle]
{
${notes}
}
`;
  return buildChart(parseDotChart(text));
}

test('a chart with no notes cannot be played', () => {
  const c = chart('');
  assert.ok(Number.isNaN(c.firstNoteTime));
  const issues = chartIssues(c, { lengthMs: 0 });
  assert.deepEqual(issues.map((i) => i.code), ['no-notes']);
  assert.equal(worstLevel(issues), 'error');
});

test('a healthy chart has no issues', () => {
  const c = chart('  0 = N 0 0\n  192 = N 1 0\n  384 = N 2 0');
  assert.equal(c.firstNoteTime, 0);
  assert.deepEqual(chartIssues(c, { lengthMs: 60000 }, { deep: true }), []);
  assert.equal(worstLevel([]), null);
});

test('flags a late first note, notes past the song length and absurd tempos', () => {
  // 120 BPM: 192 ticks = 0.5 s, so tick 192 * 80 = 40 s
  const late = chart(`  ${192 * 80} = N 0 0\n  ${192 * 81} = N 1 0`);
  const codes = chartIssues(late, { lengthMs: 20000 }).map((i) => i.code);
  assert.deepEqual(codes.sort(), ['late-start', 'past-length']);
  assert.equal(worstLevel(chartIssues(late, { lengthMs: 20000 })), 'info');
  const fast = chart('  0 = N 0 0\n  192 = N 1 0', { bpm: 9000 });
  assert.ok(chartIssues(fast, { lengthMs: 0 }).some((i) => i.code === 'tempo' && i.level === 'warn'));
});

test('the deep check finds chord gems a tick apart', () => {
  const c = chart('  0 = N 0 0\n  1 = N 1 0\n  192 = N 2 0');
  assert.deepEqual(chartIssues(c, { lengthMs: 0 }).map((i) => i.code), []);
  assert.deepEqual(chartIssues(c, { lengthMs: 0 }, { deep: true }).map((i) => i.code), ['stacked-notes']);
});
