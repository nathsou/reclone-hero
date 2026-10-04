import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const S = await import('../src/game/setlists.ts');
const { pickPart } = await import('../src/ui/setlistRun.ts');

test('setlists keep songs in order, once each', () => {
  const a = S.createSetlist();
  assert.equal(a.name, 'Setlist 1');
  assert.ok(S.addToSetlist(a.id, 'x'));
  assert.ok(S.addToSetlist(a.id, 'y'));
  assert.ok(S.addToSetlist(a.id, 'z'));
  assert.equal(S.addToSetlist(a.id, 'y'), false);
  assert.equal(S.moveInSetlist(a.id, 2, -1), 1);
  assert.deepEqual(S.getSetlist(a.id)!.songs, ['x', 'z', 'y']);
  assert.equal(S.moveInSetlist(a.id, 0, -1), 0, 'already first');
  S.removeFromSetlist(a.id, 0);
  S.renameSetlist(a.id, '  Gig night ');
  assert.deepEqual({ ...S.getSetlist(a.id)!, id: '' }, { id: '', name: 'Gig night', songs: ['z', 'y'] });
  const b = S.createSetlist();
  assert.equal(b.name, 'Setlist 2');
  S.deleteSetlist(b.id);
  assert.equal(S.setlists().length, 1);
  assert.ok(JSON.parse(store.get('chsq.setlists')!).length === 1);
});

test('merging setlists from a backup', () => {
  const mine = [{ id: 'a', name: 'A', songs: ['1'] }];
  const merged = S.mergeSetlists(mine, [{ id: 'a', name: 'A', songs: ['1', '2'] }, { id: 'b', name: 'B', songs: [] }, { id: 3 }]);
  assert.deepEqual(merged.map((s) => [s.id, s.songs.length]), [['a', 2], ['b', 0]]);
});

test('a setlist plays the nearest part available', () => {
  const chart = (keys: string[]) => ({ tracks: new Map(keys.map((k) => [k, null])) }) as never;
  assert.deepEqual(pickPart(chart(['guitar:expert', 'guitar:hard']), 'guitar', 'expert'), { instrument: 'guitar', difficulty: 'expert' });
  // easier first, then harder
  assert.deepEqual(pickPart(chart(['guitar:easy', 'guitar:expert']), 'guitar', 'hard'), { instrument: 'guitar', difficulty: 'expert' });
  assert.deepEqual(pickPart(chart(['guitar:medium', 'guitar:expert']), 'guitar', 'hard'), { instrument: 'guitar', difficulty: 'medium' });
  // no bass: guitar
  assert.deepEqual(pickPart(chart(['guitar:hard']), 'bass', 'hard'), { instrument: 'guitar', difficulty: 'hard' });
  assert.equal(pickPart(chart([]), 'guitar', 'expert'), null);
});
