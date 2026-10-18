import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudio, analyzeJob } from '../src/studio/analysis.ts';
import type { Analysis } from '../src/studio/analysis.ts';
import { createProject, generateNotes, PROFILES, regenerate, StudioHistory } from '../src/studio/model.ts';
import { exportProject, importProjectZip, validateProject } from '../src/studio/export.ts';
import { DIFFICULTIES } from '../src/chart/types.ts';

const sr = 22050;
function riff(): { pcm: Float32Array; attacks: { time: number; pitch: number }[]; hats: number[] } {
  const attacks = Array.from({ length: 32 }, (_, i) => ({ time: 1 + i * 0.5, pitch: [60, 64, 67, 64, 62, 60, 62, 64][i % 8] }));
  const pcm = new Float32Array(sr * 18), hats: number[] = [];
  let seed = 1234;
  for (const [i, note] of attacks.entries()) {
    const frequency = 440 * 2 ** ((note.pitch - 69) / 12), volume = i < 16 ? 0.04 : 0.6;
    for (let j = 0; j < sr * 0.38; j++) {
      const t = j / sr, envelope = (1 - Math.exp(-t * 1500)) * Math.exp(-t * 12);
      pcm[Math.round(note.time * sr) + j] += volume * envelope * (Math.sin(2 * Math.PI * frequency * t) + (i % 3 === 0 ? 0.7 : 0.2) * Math.sin(4 * Math.PI * frequency * t));
    }
    const time = note.time + 0.25; hats.push(time);
    for (let j = 0; j < sr * 0.055; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pcm[Math.round(time * sr) + j] += volume * 0.35 * (seed / 2 ** 31 - 1) * Math.exp(-j / sr * 100);
    }
  }
  return { pcm, attacks, hats };
}

test('pitched riffs survive gain and timbre changes while separate broadband hits do not become melody', () => {
  const { pcm, attacks, hats } = riff(), analysis = analyzeAudio(pcm, sr);
  const p = createProject('riff', 'riff.wav', analysis); p.focus = 'melody';
  const notes = generateNotes(p, 'expert');
  let matched = 0, correctPitch = 0;
  const lanes = new Map<number, Set<number>>();
  for (const attack of attacks) {
    const note = notes.find(n => Math.abs(n.time - attack.time) < 0.03);
    if (note) { matched++; const values = lanes.get(attack.pitch) ?? new Set(); values.add(note.lane); lanes.set(attack.pitch, values); }
    const onset = analysis.onsets.find(o => Math.abs(o.time - attack.time) < 0.03);
    if (onset?.pitch !== undefined && Math.abs(onset.pitch - attack.pitch) < 0.5) correctPitch++;
  }
  assert.ok(matched >= attacks.length * 0.9, `${matched}/${attacks.length} musical attacks retained`);
  assert.ok(correctPitch >= attacks.length * 0.9, `${correctPitch}/${attacks.length} fundamental estimates`);
  assert.ok(hats.filter(time => notes.some(n => Math.abs(n.time - time) < 0.03)).length <= hats.length * 0.2, 'broadband noise is not a melody');
  assert.ok([...lanes.values()].every(values => values.size === 1), 'same riff notes keep the same frets across dynamics and timbre');
  assert.equal(notes.length, new Set(notes.map(n => n.time)).size, 'single tones never become loudness-based chords');
});

function passages(): Analysis {
  return { version: 2, duration: 65, bpm: 120, beatOffset: 0, confidence: 0.9, waveform: new Float32Array(6500),
    onsets: Array.from({ length: 240 }, (_, i) => ({ time: 1 + i * 0.25, strength: i < 80 ? 0.1 : 3,
      tone: 8 + i % 5 * 0.4, pitch: 60 + i % 5 * 2, clarity: 0.8, salience: 1, band: i % 3 })) };
}

test('each difficulty retains quiet phrases, nested attacks, and consistent pitch mapping', () => {
  const p = createProject('passages', 'song.wav', passages());
  let previous: number[] = [];
  for (const difficulty of DIFFICULTIES) {
    const notes = p.notes[difficulty], times = notes.map(n => n.time), cfg = PROFILES[difficulty];
    assert.ok(previous.every(time => times.includes(time))); previous = times;
    for (let start = 0; start < 60; start += 4) assert.ok(times.some(time => time >= start && time < start + 4), `${difficulty}: phrase at ${start}s survives`);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= cfg.gap - 0.0001);
    const repeated = new Map<number, Set<number>>();
    for (const note of notes) { const pitch = p.analysis.onsets.find(o => o.time === note.time)!.pitch!; const lanes = repeated.get(pitch) ?? new Set(); lanes.add(note.lane); repeated.set(pitch, lanes); }
    assert.ok([...repeated.values()].every(lanes => lanes.size === 1));
  }
});

test('focus, modern features and authored locks survive regeneration, undo and portable ZIPs', async () => {
  const p = createProject('focus', 'song.wav', passages()), history = new StudioHistory();
  p.locks.medium = [{ start: 5, end: 10 }];
  const locked = structuredClone(p.notes.medium.filter(n => n.time >= 5 && n.time < 10));
  history.capture(p); p.focus = 'rhythm'; regenerate(p, 'medium', { start: 0, end: 65 });
  assert.deepEqual(p.notes.medium.filter(n => n.time >= 5 && n.time < 10), locked);
  assert.ok(history.undo(p)); assert.equal(p.focus, 'balanced'); assert.ok(history.redo(p)); assert.equal(p.focus, 'rhythm');
  const restored = await importProjectZip(await exportProject(p, new Blob(['recording'])), 'restored');
  assert.equal(restored.project.focus, 'rhythm'); assert.equal(restored.project.analysis.version, 2);
  assert.deepEqual(restored.project.analysis.onsets, p.analysis.onsets);
  const portable = { ...p, analysis: { ...p.analysis, waveform: Array.from(p.analysis.waveform) } };
  assert.equal(validateProject(portable, 'valid').focus, 'rhythm');
  assert.throws(() => validateProject({ ...portable, focus: 'unknown' }, 'invalid'));
  assert.throws(() => validateProject({ ...portable, analysis: { ...portable.analysis, onsets: [{ ...p.analysis.onsets[0], clarity: 5 }] } }, 'invalid'));
});

test('analysis progress is monotonic and short/silent audio remains bounded', () => {
  const job = analyzeJob(new Float32Array(sr), sr); let previous = 0;
  for (;;) { const step = job.next(); if (step.done) { assert.equal(step.value.onsets.length, 0); assert.equal(step.value.confidence, 0); break; } assert.ok(step.value >= previous); previous = step.value; }
});

test('a sustained tempo change lowers grid confidence without moving musical attacks', () => {
  const pcm = new Float32Array(sr * 84), times: number[] = [];
  for (let time = 1; time < 36; time += 0.5) times.push(time);
  for (let time = 36; time < 82; time += 60 / 148) times.push(time);
  for (const time of times) for (let j = 0; j < sr * 0.15; j++) {
    const t = j / sr; pcm[Math.round(time * sr) + j] += 0.5 * (1 - Math.exp(-t * 1500)) * Math.exp(-t * 30) * Math.sin(2 * Math.PI * 440 * t);
  }
  const analysis = analyzeAudio(pcm, sr);
  assert.equal(analysis.tempoVariable, true);
  assert.ok(times.every(time => analysis.onsets.some(onset => Math.abs(onset.time - time) < 0.03)));
});
