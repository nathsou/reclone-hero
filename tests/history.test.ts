import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const { MAX_RUNS, getHistory, mergeHistory, recordRun, variantKey, variantLabel } = await import('../src/game/history.ts');

const run = (score: number, extra: Record<string, unknown> = {}) => ({ score, stars: 3, accuracy: 0.9, fc: false, date: score, speed: 1, mods: [] as string[], ...extra });

test('keeps the latest runs and the best at each speed and set of modifiers', () => {
  assert.equal(recordRun('s|guitar:expert', run(100)), true);
  assert.equal(recordRun('s|guitar:expert', run(50)), false);
  assert.equal(recordRun('s|guitar:expert', run(80, { speed: 0.75 })), true, 'first run at 75%');
  assert.equal(recordRun('s|guitar:expert', run(120, { mods: ['mirror'] })), true);
  const h = getHistory('s|guitar:expert')!;
  assert.deepEqual(Object.keys(h.bests).sort(), ['100', '100+mirror', '75']);
  assert.equal(h.bests['100'].score, 100);
  for (let i = 0; i < 40; i++) recordRun('s|guitar:expert', run(1000 + i));
  assert.equal(getHistory('s|guitar:expert')!.runs.length, MAX_RUNS);
  assert.equal(getHistory('s|guitar:expert')!.runs.at(-1)!.score, 1039);
  assert.ok(store.has('chsq.history'));
});

test('variant keys and labels', () => {
  assert.equal(variantKey(1, []), '100');
  assert.equal(variantKey(0.75, ['taps', 'mirror']), '75+mirror+taps');
  assert.equal(variantLabel('75+mirror+taps', { mirror: 'Mirror', taps: 'All taps' }), '75% · Mirror, All taps');
});

test('merging histories combines runs and keeps the better bests, skipping broken entries', () => {
  const mine = { k: { runs: [run(1), run(2)], bests: { '100': run(2) } } };
  const merged = mergeHistory(mine, { k: { runs: [run(2), run(3), { score: 'x' }], bests: { '100': run(3), '50': run(9, { speed: 0.5 }), bad: {} } }, junk: 4 });
  assert.deepEqual(merged.k.runs.map((r) => r.score), [1, 2, 3]);
  assert.equal(merged.k.bests['100'].score, 3);
  assert.equal(merged.k.bests['50'].score, 9);
  assert.equal(merged.k.bests.bad, undefined);
});
