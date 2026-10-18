import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudio } from '../src/studio/analysis.ts';
import type { Analysis } from '../src/studio/analysis.ts';
import { chartText, createProject, normalizeNotes, PROFILES, regenerate, songIni, StudioHistory, timingMap } from '../src/studio/model.ts';
import { exportProject, importProjectZip, validateProject, zipFiles } from '../src/studio/export.ts';
import { loadChart } from '../src/chart/load.ts';
import { makeSongEntry } from '../src/library/song.ts';
import { DIFFICULTIES } from '../src/chart/types.ts';
import { Engine, HIT } from '../src/engine/engine.ts';
import { applyAction, botActions } from '../src/engine/bot.ts';

const sr = 22050;
function recording(bpm = 120, volume = 0.4): { pcm: Float32Array; attacks: number[] } {
  const attacks = Array.from({ length: 32 }, (_, i) => 1 + i * 60 / bpm);
  const pcm = new Float32Array(Math.ceil((attacks[31] + 2) * sr));
  attacks.forEach((time, i) => {
    for (let j = 0; j < sr * 0.25; j++) {
      const t = j / sr;
      pcm[Math.round(time * sr) + j] += volume * (1 - Math.exp(-t * 1000)) * Math.exp(-t * 22) * Math.sin(2 * Math.PI * (220 + i % 4 * 55) * t);
    }
  });
  return { pcm, attacks };
}

test('audio analysis finds attacks to 20ms, rejects releases and silence, and tracks tempo', () => {
  for (const bpm of [72, 120, 150]) {
    const { pcm, attacks } = recording(bpm), result = analyzeAudio(pcm, sr);
    assert.equal(result.onsets.length, attacks.length, 'one event per attack, not per release');
    for (let i = 0; i < attacks.length; i++) assert.ok(Math.abs(result.onsets[i].time - attacks[i]) < 0.02);
    assert.ok(Math.abs(result.bpm - bpm) < 1, `${bpm} -> ${result.bpm}`);
    assert.ok(result.confidence > 0.65);
    assert.equal(result.waveform.length, Math.ceil(pcm.length / sr * 100));
  }
  const silence = analyzeAudio(new Float32Array(sr * 3), sr);
  assert.equal(silence.onsets.length, 0); assert.equal(silence.confidence, 0);
});

test('quiet masters and gain changes keep the same attacks, including audio starting at zero', () => {
  const loud = analyzeAudio(recording(120, 0.8).pcm, sr), quiet = analyzeAudio(recording(120, 0.008).pcm, sr);
  assert.deepEqual(loud.onsets.map((o) => o.time), quiet.onsets.map((o) => o.time));
  const start = recording().pcm.subarray(sr);
  assert.equal(analyzeAudio(start, sr).onsets[0].time, 0);
  assert.throws(() => analyzeAudio(new Float32Array(10), sr));
});

function fixture(): Analysis {
  return { duration: 65, bpm: 120, beatOffset: 0.21, confidence: 0.8, waveform: new Float32Array(6500),
    onsets: Array.from({ length: 480 }, (_, i) => ({ time: 1 + i * 0.125, strength: 0.4 + (i % 4 === 0 ? 1.5 : 0), tone: 7 + (i % 7) / 4 })) };
}

test('four difficulties have progressively denser timings, bounded bursts, and appropriate fret ranges', () => {
  const p = createProject('fixture', 'song.mp3', fixture());
  let previous: number[] = [];
  for (const diff of DIFFICULTIES) {
    const notes = p.notes[diff], times = [...new Set(notes.map((n) => n.time))], cfg = PROFILES[diff];
    assert.ok(times.length > previous.length);
    assert.ok(previous.every((t) => times.includes(t)), 'easier timings remain in harder charts');
    assert.ok(notes.every((n) => n.lane < cfg.lanes && n.time >= 0 && n.time < p.analysis.duration));
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= cfg.gap - 0.0001);
    for (let i = cfg.burst; i < times.length; i++) assert.ok(times[i] - times[i - cfg.burst] >= 1);
    previous = times;
  }
});

test('regeneration protects authored locks and other difficulties; undo and redo restore edits', () => {
  const p = createProject('fixture', 'song.wav', fixture()), history = new StudioHistory();
  p.locks.medium = [{ start: 10, end: 20 }];
  p.notes.medium = p.notes.medium.filter((n) => n.time < 10 || n.time >= 20);
  p.notes.medium.push({ id: p.nextId++, time: 12.345, lane: 2, length: 1, kind: 'tap' });
  const before = structuredClone(p.notes), nextId = p.nextId;
  history.capture(p); regenerate(p, 'medium', { start: 0, end: 30 });
  assert.deepEqual(p.notes.medium.filter((n) => n.time >= 10 && n.time < 20), before.medium.filter((n) => n.time >= 10 && n.time < 20));
  assert.deepEqual(p.notes.medium.filter((n) => n.time >= 30), before.medium.filter((n) => n.time >= 30));
  assert.deepEqual(p.notes.expert, before.expert);
  const regenerated = structuredClone(p.notes);
  assert.ok(history.undo(p)); assert.deepEqual(p.notes, before); assert.equal(p.nextId, nextId);
  assert.ok(history.redo(p)); assert.deepEqual(p.notes, regenerated);
});

test('tempo edits and song ZIP chart round trips preserve seconds, chords, taps and sustains', () => {
  const p = createProject('fixture', 'a song.mp3', fixture());
  p.name = 'A "quoted"\nsong'; p.timing = [{ time: 0, bpm: 123.45 }, { time: 12.3, bpm: 87.25 }, { time: 42, bpm: 170 }];
  p.notes.expert.push({ id: p.nextId++, time: 62.5, lane: 4, length: 1.4, kind: 'tap' });
  const song = makeSongEntry({ path: 'test', files: ['song.mp3', 'notes.chart', 'song.ini'], ini: new TextEncoder().encode(songIni(p)), chartHead: null })!;
  const chart = loadChart('notes.chart', new TextEncoder().encode(chartText(p)), song.chartOptions);
  assert.ok(chart.tempo.bpmAt(20) < 88); assert.ok(chart.tempo.bpmAt(50) > 169);
  for (const diff of DIFFICULTIES) {
    const track = chart.tracks.get(`guitar:${diff}`)!;
    const times = [...new Set(p.notes[diff].map((n) => n.time))].sort((a, b) => a - b);
    assert.equal(track.notes.length, times.length);
    times.forEach((time, i) => assert.ok(Math.abs(track.notes.time[i] - time) < 0.003, `round trip at ${time}`));
    const engine = new Engine(track, chart.tempo);
    for (const action of botActions(track)) applyAction(engine, action);
    engine.advance(p.analysis.duration + 1);
    assert.ok([...engine.noteState].every((state) => state === HIT), `${diff}: every generated note is playable`);
  }
  const expert = chart.tracks.get('guitar:expert')!.notes, last = expert.length - 1;
  assert.equal(expert.type[last], 2); assert.ok(Math.abs(expert.endTime[last] - 63.9) < 0.003);
  assert.ok(timingMap(p).offset <= 0);
});

test('regeneration cannot shorten a protected sustain extending across the passage boundary', () => {
  const p = createProject('fixture', 'song.wav', fixture());
  p.notes.medium = [{ id: p.nextId++, time: 19.9, lane: 1, length: 2, kind: 'auto' }];
  p.locks.medium = [{ start: 10, end: 20 }];
  regenerate(p, 'medium', { start: 0, end: 40 });
  assert.equal(p.notes.medium.find((n) => n.time === 19.9)?.length, 2);
});

test('chart tick rounding keeps notes at the start and end inside the actual recording', () => {
  const p = createProject('edges', 'song.ogg', fixture());
  p.timing[0].bpm = 123.12; p.beatOffset = 0.231;
  p.notes.expert = [{ id: 1, time: 0, lane: 0, length: 0, kind: 'auto' }, { id: 2, time: p.analysis.duration - 0.0001, lane: 1, length: 0, kind: 'auto' }];
  const chart = loadChart('notes.chart', new TextEncoder().encode(chartText(p)), { delayMs: timingMap(p).offset * 1000 });
  const notes = chart.tracks.get('guitar:expert')!.notes;
  assert.ok(notes.time[0] >= 0); assert.ok(notes.time[1] < p.analysis.duration);
});

test('edited notes are finite, deduplicated, bounded, and never sustain over a restrike', () => {
  const out = normalizeNotes([
    { id: 1, time: 1, lane: 2, length: 8, kind: 'auto' }, { id: 2, time: 1, lane: 2, length: 1, kind: 'auto' },
    { id: 3, time: 2, lane: 2, length: 10, kind: 'auto' }, { id: 4, time: NaN, lane: 0, length: 0, kind: 'auto' },
    { id: 5, time: 11, lane: 0, length: 0, kind: 'auto' },
  ], 10);
  assert.equal(out.length, 2); assert.equal(out[0].length, 0.99); assert.ok(out[1].time + out[1].length <= 10);
});

test('ZIP has valid sizes, CRCs, UTF-8 names, and a central directory', () => {
  const bytes = zipFiles([{ name: 'música/song.ini', bytes: new TextEncoder().encode('123456789') }]);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0xcbf43926);
  const nameLength = view.getUint16(26, true), central = 30 + nameLength + 9;
  assert.equal(new TextDecoder().decode(bytes.subarray(30, 30 + nameLength)), 'música/song.ini');
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint32(bytes.length - 6, true), central);
});

test('portable project ZIP restores notes, tempo changes, locks, analysis and audio as a new project', async () => {
  const p = createProject('original', 'recording.ogg', fixture());
  p.name = 'Música'; p.locks.easy = [{ start: 2, end: 5 }]; p.timing.push({ time: 20, bpm: 150 });
  const audio = new Blob([new Uint8Array([1, 2, 3, 4])]);
  const zip = await exportProject(p, audio), imported = await importProjectZip(zip, 'new-copy');
  assert.equal(imported.project.id, 'new-copy');
  assert.deepEqual(imported.project.notes, p.notes); assert.deepEqual(imported.project.locks, p.locks);
  assert.deepEqual(imported.project.timing, p.timing); assert.deepEqual(imported.project.analysis, p.analysis);
  assert.deepEqual(new Uint8Array(await imported.audio.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
  const damaged = new Uint8Array(await zip.arrayBuffer()); damaged[80] ^= 1;
  let rejected = false; try { await importProjectZip(new Blob([damaged]), 'bad'); } catch { rejected = true; }
  assert.ok(rejected, 'reject damaged archives');
  assert.throws(() => validateProject({ ...p, analysis: { ...p.analysis, waveform: [], duration: Infinity } }, 'bad'));
  assert.throws(() => validateProject({ ...p, timing: [] }, 'bad'));
});

test('separated ZIP preserves original, routes only guitar/backing, and restores both estimates', async () => {
  const { studioFolder } = await import('../src/studio/source.ts');
  const p = createProject('fixture', 'song.wav', fixture());
  const audio = new Blob(['original recording']);
  const stems = { guitar: new Blob(['guitar estimate']), backing: new Blob(['backing residual']), model: 'htdemucs_6s' as const, gain: 0.93 };
  const folder = studioFolder(p, stems), entry = makeSongEntry(folder)!;
  assert.deepEqual(folder.files, ['notes.chart', 'song.ini', 'guitar.ogg', 'song.ogg']);
  assert.ok(entry.stems.guitar);
  assert.equal(Object.keys(entry.stems).length, 2, 'no original mix to double the volume');
  const blob = await exportProject(p, audio, stems), restored = await importProjectZip(blob, 'new-project');
  assert.ok((await blob.text()).includes('MusicStream = \"song.ogg\"'), 'portable chart points to backing, even when original format is WAV');
  assert.equal(restored.project.audioName, 'song.wav', 'metadata retains the original format');
  assert.equal(await restored.audio.text(), await audio.text());
  assert.equal(await restored.stems?.guitar.text(), 'guitar estimate');
  assert.equal(await restored.stems?.backing.text(), 'backing residual');
  assert.equal(restored.stems?.gain, 0.93);
  assert.deepEqual(restored.project.notes, p.notes);
  assert.equal(restored.project.id, 'new-project');
  assert.deepEqual(studioFolder(restored.project).files, ['notes.chart', 'song.ini', 'song.wav'], 'restoring original mix uses only original');
});

test('separated ZIP rejects missing outputs and invalid gain instead of silently playing the original twice', async () => {
  const p = createProject('fixture', 'song.wav', fixture());
  const metadata = { ...p, analysis: { ...p.analysis, waveform: Array.from(p.analysis.waveform) }, separatedAudio: { model: 'htdemucs_6s', gain: 1 } };
  const files = [{ name: 'Song/studio.json', bytes: new TextEncoder().encode(JSON.stringify(metadata)) }, { name: 'Song/original.wav', bytes: new Uint8Array([1]) }];
  await assert.rejects(importProjectZip(new Blob([zipFiles(files)]), 'new-id'), /incomplete/);
  files.push({ name: 'Song/guitar.ogg', bytes: new Uint8Array([2]) }, { name: 'Song/song.ogg', bytes: new Uint8Array([3]) });
  metadata.separatedAudio.gain = 0;
  files[0].bytes = new TextEncoder().encode(JSON.stringify(metadata));
  await assert.rejects(importProjectZip(new Blob([zipFiles(files)]), 'new-id'), /invalid separated/);
});
