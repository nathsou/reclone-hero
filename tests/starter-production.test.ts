import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearVoicing } from '../src/starter/arrange.ts';
import { makeVoice } from '../src/starter/instruments.ts';
import { MasterLimiter } from '../src/starter/master.ts';
import { perform } from '../src/starter/performance.ts';
import { STARTER_SONGS } from '../src/starter/songs/index.ts';
import { detectPitch } from '../src/audio/pitch.ts';

test('extended voicings preserve ninths and slash-chord pitch classes', () => {
  assert.deepEqual([...new Set(nearVoicing('Gadd9').map(p => p % 12))].sort((a, b) => a - b), [2, 7, 9, 11]);
  assert.deepEqual([...new Set(nearVoicing('C9/E').map(p => p % 12))].sort((a, b) => a - b), [0, 2, 4, 7, 10]);
});

test('clean guitar bends begin below their written target and settle onto it', () => {
  const sr = 44100, voice = makeVoice('clean', sr, 0.5, 0);
  const L = new Float32Array(sr), R = new Float32Array(sr);
  voice.note({ b: 0, d: 1, p: [69], v: 0.8, bend: 2 }, 0, 0.7, L, R, 0);
  voice.process(L, R, sr);
  const early = detectPitch(L.slice(220, 1244), sr).pitch;
  const late = detectPitch(L.slice(6615, 8663), sr).pitch;
  assert.ok(early < late - 0.35, `bend rises: ${early} -> ${late}`);
  assert.ok(Math.abs(late - 69) < 0.25, `settles onto A4: ${late}`);
});

test('lookahead anticipates a block-edge transient while leaving quiet audio unchanged', () => {
  const limiter = new MasterLimiter(44100);
  const n = 8192, peaks = new Float32Array(n + limiter.lookahead).fill(0.1);
  peaks[n + 2] = 3;
  const gains = limiter.gains(peaks, n);
  assert.equal(gains[0], 1);
  assert.ok(gains[n - 1] < 0.3, 'gain falls before the next block transient');
  const next = new Float32Array(n + limiter.lookahead).fill(0.1); next[2] = 3;
  const following = limiter.gains(next, n);
  assert.ok(following[2] * 3 <= limiter.ceiling + 1e-6);
  assert.ok(following[100] < 0.4, 'release is gradual');
});

test('phrase plans preserve onsets and pitches across the 7/8 to 4/4 meter change', () => {
  const base = STARTER_SONGS.find(s => s.id === 'seventh-gear')!;
  const played = perform(base, { bar: 3.5, phrase: 14, shape: [0.8, 1, 0.8], gate: 0.8, accent: 0.05 });
  for (let i = 0; i < base.player.length; i++) {
    const before = [...base.player[i].notes].sort((a, b) => a.b - b.b);
    const after = [...played.player[i].notes].sort((a, b) => a.b - b.b);
    assert.deepEqual(after.map(n => [n.b, n.p]), before.map(n => [n.b, n.p]));
    assert.ok(after.every(n => n.v > 0 && n.v <= 1 && n.d > 0));
  }
});

test('curated starter library contains the intended 24 distinct tracks', () => {
  assert.equal(STARTER_SONGS.length, 24);
  assert.equal(new Set(STARTER_SONGS.map(s => s.id)).size, 24);
  assert.ok(STARTER_SONGS.some(s => s.id === 'ignition'));
  assert.ok(!STARTER_SONGS.some(s => s.id === 'assembly-line' || s.id === 'paper-hearts'));
});

test('Warehouse Current riff follows its changing roots and dominant third', () => {
  const song = STARTER_SONGS.find(s => s.id === 'warehouse-current')!;
  const riff = song.player.find(p => p.inst === 'synthbass')!.notes;
  assert.deepEqual([0, 4, 8, 12, 16, 20, 24, 28].map(b => riff.find(n => n.b === b)!.p[0]), [53, 53, 58, 51, 53, 56, 58, 48]);
  const dominant = riff.filter(n => n.b >= 28 && n.b < 32).flatMap(n => n.p);
  assert.ok(dominant.includes(52), 'C7 riff uses E natural');
  assert.ok(!dominant.includes(51), 'no inherited Eb over C7');
});
