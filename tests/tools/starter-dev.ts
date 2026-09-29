// Dev tool for the built-in songs: render to WAV, print levels and a text view of the chart.
//   node tests/tools/starter-dev.ts <song-id> [outDir] [--no-audio] [--chart easy|medium|hard|expert] [--bars a-b]
// @ts-expect-error node types are not installed
import { writeFileSync } from 'node:fs';
import { generateChart } from '../../src/starter/chartgen.ts';
import { renderSong, songSeconds } from '../../src/starter/render.ts';
import { Tempo } from '../../src/starter/score.ts';
import { STARTER_SONGS } from '../../src/starter/songs/index.ts';
import { WavWriter } from '../../src/starter/wav.ts';

const args = process.argv.slice(2);
const id = args[0];
const out = args[1] && !args[1].startsWith('--') ? args[1] : '.';
const flag = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const def = STARTER_SONGS.find((s) => s.id === id)!;
if (!def) {
  console.error(`unknown song; have: ${STARTER_SONGS.map((s) => s.id).join(', ')}`);
  throw new Error('unknown song');
}

const chart = generateChart(def);
const tempo = new Tempo(def.tempo);
for (const d of ['easy', 'medium', 'hard', 'expert'] as const) {
  const notes = chart.placed[d];
  const hist = [0, 0, 0, 0, 0];
  let chords = 0;
  let sus = 0;
  for (const n of notes) {
    for (const l of n.lanes) hist[l]++;
    if (n.lanes.length > 1) chords++;
    if (n.sus) sus++;
  }
  console.log(`${d.padEnd(7)} ${String(notes.length).padStart(4)} notes  lanes ${hist.join('/')}  chords ${chords}  sustains ${sus}`);
}
console.log(`star power: ${chart.starPower.map(([a, b]) => `${(a / 4).toFixed(0)}-${(b / 4).toFixed(0)}`).join(' ')} (bars)`);

const view = flag('--chart');
if (view) {
  const [a, b] = (flag('--bars') ?? '0-8').split('-').map(Number);
  const rows = chart.placed[view as 'expert'].filter((n) => n.b >= a * 4 && n.b < b * 4);
  const lane = 'GRYBO';
  for (const n of rows) {
    const cells = [0, 1, 2, 3, 4].map((l) => (n.lanes.includes(l) ? lane[l] : '.'));
    console.log(`${(n.b / 4).toFixed(3).padStart(8)}  ${cells.join(' ')}${n.sus ? `  ~${n.sus}` : ''}${n.forceStrum ? '  (strum)' : ''}`);
  }
}

if (!args.includes('--no-audio')) {
  const sr = 44100;
  const secs = songSeconds(def);
  const frames = Math.ceil(secs * sr);
  const guitar = new WavWriter(frames, sr);
  const song = new WavWriter(frames, sr);
  const t0 = performance.now();
  let pk = 0;
  let sumP = 0;
  let sumB = 0;
  let count = 0;
  const loud: number[] = [];
  const stats = new Map<string, number>();
  for (const blk of renderSong(def!, sr, 0, secs, stats)) {
    guitar.write(blk.pl, blk.pr, blk.n);
    song.write(blk.bl, blk.br, blk.n);
    let bs = 0;
    for (let i = 0; i < blk.n; i++) {
      const s = Math.max(Math.abs(blk.pl[i] + blk.bl[i]), Math.abs(blk.pr[i] + blk.br[i]));
      if (s > pk) pk = s;
      sumP += blk.pl[i] ** 2 + blk.pr[i] ** 2;
      sumB += blk.bl[i] ** 2 + blk.br[i] ** 2;
      bs += (blk.pl[i] + blk.bl[i]) ** 2;
    }
    count += blk.n;
    loud.push(Math.sqrt(bs / blk.n));
  }
  const ms = performance.now() - t0;
  const db = (x: number) => (20 * Math.log10(x + 1e-9)).toFixed(1);
  console.log(`rendered ${secs.toFixed(1)} s in ${(ms / 1000).toFixed(2)} s; peak ${db(pk)} dBFS; player rms ${db(Math.sqrt(sumP / count / 2))} dB; backing rms ${db(Math.sqrt(sumB / count / 2))} dB`);
  for (const [k, v] of stats) console.log(`  ${k.padEnd(20)} ${k === 'gr' ? `avg gain reduction ${((v / count) * 100).toFixed(1)}%` : `${db(Math.sqrt(v / count / 2))} dB`}`);
  console.log(`loudness per ~0.74 s block (dB): ${loud.map((x) => db(x)).join(' ')}`);
  writeFileSync(`${out}/${id}-guitar.wav`, guitar.bytes);
  writeFileSync(`${out}/${id}-song.wav`, song.bytes);
  console.log(`wrote ${out}/${id}-guitar.wav, ${out}/${id}-song.wav; first note at ${tempo.toSec(chart.placed.expert[0]?.b ?? 0).toFixed(2)} s`);
}
writeFileSync(`${out}/${id}.chart`, chart.text);
