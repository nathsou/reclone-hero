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
  assert.deepEqual({ ...summarize(b), exportedAt: '' }, { settings: true, keys: false, controllers: 1, scores: 1, plays: 0, favourites: 0, hidden: 0, exportedAt: '' });
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

test('a hand-edited backup cannot store broken scores, plays or favourites', () => {
  store.clear();
  const b = parseBackup(
    JSON.stringify({
      app: 'reclone-hero',
      format: 1,
      exportedAt: '',
      data: {
        scores: { good: { score: 10, stars: 1, accuracy: 0.5, fc: false, date: 1 }, bad: { score: 'lots' }, worse: null },
        plays: { a: { count: 2, last: 5 }, b: 'x' },
        favourites: ['one', 7, null],
      },
    }),
  );
  applyBackup(b);
  assert.deepEqual(Object.keys(JSON.parse(store.get('chsq.scores')!)), ['good']);
  assert.deepEqual(Object.keys(JSON.parse(store.get('chsq.plays')!)), ['a']);
  assert.deepEqual(JSON.parse(store.get('chsq.favourites')!), ['one']);
});

test('hidden songs travel in backups and merge as a union', () => {
  store.clear();
  store.set('chsq.hidden', JSON.stringify(['a', 'b']));
  const text = JSON.stringify(makeBackup());
  store.clear();
  store.set('chsq.hidden', JSON.stringify(['b', 'c']));
  const b = parseBackup(text);
  assert.equal(summarize(b).hidden, 2);
  applyBackup(b);
  assert.deepEqual(JSON.parse(store.get('chsq.hidden')!).sort(), ['a', 'b', 'c']);
});
