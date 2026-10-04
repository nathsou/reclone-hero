import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, noteName, pitchDistance } from '../src/audio/pitch.ts';

function voice(hz: number, sr: number, n = 2048, noise = 0.02): Float32Array {
  const out = new Float32Array(n);
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < n; i++) {
    const p = (2 * Math.PI * hz * i) / sr;
    // a few harmonics, like a voice
    out[i] = 0.3 * Math.sin(p) + 0.15 * Math.sin(2 * p) + 0.08 * Math.sin(3 * p) + noise * rnd();
  }
  return out;
}

test('finds sung pitches across the vocal range', () => {
  for (const sr of [44100, 48000]) {
    for (const midi of [43, 50, 57, 64, 69, 76, 81]) {
      const hz = 440 * 2 ** ((midi - 69) / 12);
      const r = detectPitch(voice(hz, sr), sr);
      assert.ok(Math.abs(r.pitch - midi) < 0.25, `${sr} Hz, ${noteName(midi)}: got ${r.pitch.toFixed(2)}`);
    }
  }
});

test('silence and noise have no pitch', () => {
  assert.ok(Number.isNaN(detectPitch(new Float32Array(2048), 48000).pitch));
  const noise = new Float32Array(2048).map(() => Math.random() - 0.5);
  assert.ok(Number.isNaN(detectPitch(noise, 48000).pitch));
});

test('pitch distance ignores the octave', () => {
  assert.equal(pitchDistance(60, 60), 0);
  assert.equal(pitchDistance(72.5, 60), 0.5);
  assert.equal(pitchDistance(59, 72), -1);
  assert.equal(pitchDistance(66, 60), 6);
  assert.equal(noteName(69), 'A4');
  assert.equal(noteName(60), 'C4');
});
