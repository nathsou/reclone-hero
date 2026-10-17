// Actual recordings, decoded by FFmpeg, through the production analyzer/generator/parser/judge.
// MUSIC_DIR=/path/to/librosa/data/audio node tests/tools/studio-music-audit.mjs
// Music stays external to the repository. Sources/licenses: docs/chart-studio.md.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { analyzeAudio } from '../../src/studio/analysis.ts';
import { createProject, chartText, PROFILES, timingMap } from '../../src/studio/model.ts';
import { loadChart } from '../../src/chart/load.ts';
import { Engine, HIT } from '../../src/engine/engine.ts';
import { applyAction, botActions } from '../../src/engine/bot.ts';

const names = [
  'Kevin_MacLeod_-_Vibe_Ace.ogg', 'admiralbob77_-_Choice_-_Drum-bass.ogg',
  'Karissa_Hobbs_-_Lets_Go_Fishin.ogg', 'Hungarian_Dance_number_5_-_Allegro_in_F_sharp_minor_(string_orchestra).ogg',
  '442789__lena-orsa__happy-music-pistachio-ice-cream-ragtime.ogg', 'sorohanro_-_solo-trumpet-06.ogg',
];
if (!process.env.MUSIC_DIR) throw new Error('Set MUSIC_DIR to the audio directory in an external clone of https://github.com/librosa/data');
const out = process.env.AUDIT_OUTPUT ?? '/tmp/studio-music-audit';
await mkdir(out, { recursive: true });
const results = [];
for (const name of names) {
  const path = `${process.env.MUSIC_DIR}/${name}`;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', '22050', 'pipe:1'], { maxBuffer: 120 * 1024 * 1024 });
  const pcm = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
  const start = performance.now(), analysis = analyzeAudio(pcm, 22050), project = createProject('audit', name, analysis);
  const elapsedMs = Math.round(performance.now() - start);
  const chart = loadChart('notes.chart', new TextEncoder().encode(chartText(project)), { delayMs: timingMap(project).offset * 1000 });
  assert.ok(analysis.onsets.length > analysis.duration * 0.5 && analysis.onsets.length < analysis.duration * 12, `${name}: useful, bounded onset density`);
  let previous = 0;
  const counts = {};
  for (const [diff, cfg] of Object.entries(PROFILES)) {
    const notes = chart.tracks.get(`guitar:${diff}`).notes;
    assert.ok(notes.length > previous, `${name}: ${diff} adds musical detail`); previous = notes.length;
    counts[diff] = notes.length;
    const source = [...new Set(project.notes[diff].map(n => n.time))];
    assert.equal(source.length, notes.length);
    for (let i = 0; i < notes.length; i++) {
      assert.ok(notes.time[i] >= 0 && notes.time[i] < analysis.duration);
      assert.ok(Math.abs(notes.time[i] - source[i]) < 0.003, 'export preserves recording timing');
      if (i) assert.ok(notes.time[i] - notes.time[i - 1] >= cfg.gap - 0.003, 'minimum spacing');
      if (i >= cfg.burst) assert.ok(notes.time[i] - notes.time[i - cfg.burst] >= 0.997, 'burst limit');
    }
    const track = chart.tracks.get(`guitar:${diff}`), engine = new Engine(track, chart.tempo);
    for (const action of botActions(track)) applyAction(engine, action);
    engine.advance(analysis.duration + 2);
    assert.ok([...engine.noteState].every(state => state === HIT), `${name}: ${diff} full combo`);
  }
  const result = { file: name, sha256: createHash('sha256').update(await readFile(path)).digest('hex'), seconds: analysis.duration, bpm: analysis.bpm, confidence: analysis.confidence, onsets: analysis.onsets.length, elapsedMs, counts };
  results.push(result); console.log(JSON.stringify(result));
  await writeFile(`${out}/${name}.onsets.json`, JSON.stringify(analysis.onsets.map(o => o.time)));
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log('PASS: six recordings, 24 difficulty charts, timing round trips, density/spacing limits, and full-combo gameplay checks');
