import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const { applyBackup, makeBackup, parseBackup, summarize } = await import('../src/game/backup.ts');

test('backup round-trips and merges scores keeping the best', () => {
  store.set('chsq.settings', JSON.stringify({ v: 2, theme: 'paper' }));
  store.set('chsq.pads', JSON.stringify({ padA: { digital: {}, whammy: null } }));
  store.set('chsq.scores', JSON.stringify({ 'song|guitar:expert': { score: 1000, stars: 3, accuracy: 0.9, fc: false, date: 1 } }));
  const text = JSON.stringify(makeBackup());

  // "Other computer": different settings, one better and one worse score, another controller.
  store.clear();
  store.set('chsq.settings', JSON.stringify({ v: 2, theme: 'neon' }));
  store.set('chsq.pads', JSON.stringify({ padB: { digital: {}, whammy: null } }));
  store.set('chsq.scores', JSON.stringify({ 'song|guitar:expert': { score: 500, stars: 2, accuracy: 0.8, fc: false, date: 2 }, 'other|bass:hard': { score: 9, stars: 1, accuracy: 0.1, fc: false, date: 3 } }));

  const b = parseBackup(text);
  assert.deepEqual({ ...summarize(b), exportedAt: '' }, { settings: true, keys: false, controllers: 1, scores: 1, exportedAt: '' });
  applyBackup(b);
  assert.equal(JSON.parse(store.get('chsq.settings')!).theme, 'paper');
  assert.deepEqual(Object.keys(JSON.parse(store.get('chsq.pads')!)).sort(), ['padA', 'padB']);
  const scores = JSON.parse(store.get('chsq.scores')!);
  assert.equal(scores['song|guitar:expert'].score, 1000);
  assert.equal(scores['other|bass:hard'].score, 9);
});

test('rejects files that are not backups', () => {
  assert.throws(() => parseBackup('{"hello":1}'));
  assert.throws(() => parseBackup('not json'));
});
