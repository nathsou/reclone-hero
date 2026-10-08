// Full-song EBU R128 / true-peak audit. Requires Node 24 and FFmpeg on PATH.
// node tests/tools/starter-audio-audit.mjs --out /tmp/starter-review [--write] [--before /path/to/baseline] [song-id...]
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { STARTER_SONGS } from '../../src/starter/songs/index.ts';
import { renderSong, songSeconds } from '../../src/starter/render.ts';
import { Tempo } from '../../src/starter/score.ts';
import { WavWriter } from '../../src/starter/wav.ts';
const args = process.argv.slice(2), option = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const out = resolve(option('--out') ?? '/tmp/starter-review');
const write = args.includes('--write');
const ids = args.filter((a, i) => !a.startsWith('--') && !['--out', '--before'].includes(args[i - 1]));
const songs = STARTER_SONGS.filter(s => !ids.length || ids.includes(s.id));
if (!songs.length) throw Error('No matching tracks');
mkdirSync(out, { recursive: true });
const sr = 44100, results = [], levels = Object.fromEntries(STARTER_SONGS.map(s => [s.id, s.levelDb ?? 0]));
const baseline = option('--before');
const beforeSongs = baseline ? (await import(pathToFileURL(resolve(baseline, 'src/starter/songs/index.ts')).href)).STARTER_SONGS : [];
const beforeRender = baseline ? (await import(pathToFileURL(resolve(baseline, 'src/starter/render.ts')).href)).renderSong : null;
const beforeTempo = baseline ? (await import(pathToFileURL(resolve(baseline, 'src/starter/score.ts')).href)).Tempo : null;
function ffmpeg(options) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...options], { encoding: 'utf8', maxBuffer: 8e6 });
  if (r.status !== 0) throw Error(r.stderr || r.error?.message);
  return r.stderr;
}
function measure(path) {
  const log = ffmpeg(['-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const number = pattern => { const m = summary.match(pattern); if (!m) throw Error(summary); return Number(m[1]); };
  return { lufs: number(/I:\s+([-\d.]+) LUFS/), truePeakDb: number(/Peak:\s+([-\d.]+) dBFS/), loudnessRange: number(/LRA:\s+([-\d.]+) LU/) };
}
function render(def, path, renderer = renderSong, from = 0, to = songSeconds(def)) {
  const stats = new Map(), wav = new WavWriter(Math.round((to - from) * sr), sr);
  let frames = 0, peak = 0, stemPeak = 0, energy = 0;
  for (const b of renderer(def, sr, from, to, stats)) {
    const L = new Float32Array(b.n), R = new Float32Array(b.n);
    for (let i = 0; i < b.n; i++) {
      L[i] = b.pl[i] + b.bl[i]; R[i] = b.pr[i] + b.br[i];
      if (!Number.isFinite(L[i] + R[i] + b.pl[i] + b.pr[i] + b.bl[i] + b.br[i])) throw Error(`${def.id}: non-finite audio`);
      stemPeak = Math.max(stemPeak, Math.abs(b.pl[i]), Math.abs(b.pr[i]), Math.abs(b.bl[i]), Math.abs(b.br[i]));
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); energy += (L[i] ** 2 + R[i] ** 2) / 2;
    }
    wav.write(L, R, b.n); frames += b.n;
  }
  if (peak > 1 || (renderer === renderSong && stemPeak > 1) || energy === 0) throw Error(`${def.id}: clipped or silent render`);
  writeFileSync(path, wav.bytes);
  return { stemPeakDb: 20 * Math.log10(stemPeak), samplePeakDb: 20 * Math.log10(peak), rmsDb: 10 * Math.log10(energy / frames), limiterReductionPct: 100 * (stats.get('gr') ?? 0) / frames, seconds: frames / sr };
}
for (const original of songs) {
  const def = { ...original }, target = ['gymnopedie', 'greensleeves'].includes(def.id) ? -18 : ['low-orbit', 'switchback'].includes(def.id) ? -17 : -16;
  const wav = `${out}/${def.id}.wav`;
  let metrics, meter;
  for (let pass = 0; pass < (write ? 5 : 1); pass++) {
    metrics = render(def, wav); meter = measure(wav);
    if (!write || Math.abs(target - meter.lufs) <= 0.2) break;
    if (pass === 4) throw Error(`${def.id}: calibration did not converge`);
    def.levelDb = Math.round((def.levelDb + target - meter.lufs) * 10) / 10;
  }
  if (meter.truePeakDb > -1) throw Error(`${def.id}: true peak ${meter.truePeakDb} exceeds -1 dBTP`);
  levels[def.id] = def.levelDb;
  ffmpeg(['-i', wav, '-c:a', 'libmp3lame', '-q:a', '2', `${out}/${def.id}.mp3`]);
  const encoded = measure(`${out}/${def.id}.mp3`);
  const row = { id: def.id, name: def.name, target, trimDb: def.levelDb, ...metrics, ...meter, mp3TruePeakDb: encoded.truePeakDb };
  const previous = beforeSongs.find(s => s.id === def.id);
  if (previous) {
    const before = `${out}/${def.id}-before-raw.wav`, after = `${out}/${def.id}-after-raw.wav`;
    const from = new beforeTempo(previous.tempo).toSec(previous.previewBeat);
    render(previous, before, beforeRender, from, from + 24);
    const now = new Tempo(def.tempo).toSec(def.previewBeat);
    ffmpeg(['-i', wav, '-ss', String(now), '-t', '24', after]);
    const bm = measure(before), am = measure(after);
    // Equal integrated loudness, with room for both originals' and revisions' true peaks.
    const matched = Math.min(-18, bm.lufs - 2 - bm.truePeakDb, am.lufs - 2 - am.truePeakDb);
    for (const [path, tag, m] of [[before, 'before', bm], [after, 'after', am]]) {
      ffmpeg(['-i', path, '-af', `volume=${matched - m.lufs}dB,afade=t=in:d=0.1,afade=t=out:st=23:d=1`, '-c:a', 'libmp3lame', '-q:a', '2', `${out}/${def.id}-${tag}.mp3`]);
      unlinkSync(path);
    }
    row.comparisonLufs = matched;
  }
  unlinkSync(wav);
  results.push(row);
  writeFileSync(`${out}/measurements.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(`${def.id.padEnd(24)} ${meter.lufs.toFixed(1)} LUFS / ${meter.truePeakDb.toFixed(1)} dBTP / ${metrics.limiterReductionPct.toFixed(2)}% reduction`);
}
if (write) {
  const entries = Object.entries(levels).sort(([a], [b]) => a.localeCompare(b)).map(([id, db]) => `  '${id}': ${db},`).join('\n');
  writeFileSync(new URL('../../src/starter/songs/levels.ts', import.meta.url), `/** Full-song EBU R128 trims. Reproduce with tests/tools/starter-audio-audit.mjs --write. */\nexport const LEVELS: Record<string, number> = {\n${entries}\n};\n`);
}
writeFileSync(`${out}/playlist.m3u`, '#EXTM3U\n' + results.map(r => `#EXTINF:${Math.round(r.seconds)},${r.name}\n${r.id}.mp3`).join('\n') + '\n');
