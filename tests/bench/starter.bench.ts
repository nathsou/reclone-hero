// Reproducible DSP/load and mix audit; no external chart folder or browser required.
// node tests/bench/starter.bench.ts [song-id] [--full]
import { renderSong } from '../../src/starter/render.ts';
import { Tempo } from '../../src/starter/score.ts';
import { STARTER_SONGS } from '../../src/starter/songs/index.ts';

const id = process.argv.slice(2).find(a => !a.startsWith('--'));
const defs = id ? STARTER_SONGS.filter(s => s.id === id) : STARTER_SONGS;
if (!defs.length) throw new Error(`Unknown starter track ${id}`);
const full = process.argv.includes('--full');
const sr = 44100;
for (const def of defs) {
  const from = full ? 0 : new Tempo(def.tempo).toSec(def.previewBeat);
  const to = full ? undefined : from + 12;
  const stats = new Map<string, number>();
  const start = performance.now();
  let frames = 0, ep = 0, eb = 0, peak = 0;
  for (const b of renderSong(def, sr, from, to, stats)) {
    frames += b.n;
    for (let i = 0; i < b.n; i++) {
      ep += b.pl[i] ** 2 + b.pr[i] ** 2;
      eb += b.bl[i] ** 2 + b.br[i] ** 2;
      peak = Math.max(peak, Math.abs(b.pl[i] + b.bl[i]), Math.abs(b.pr[i] + b.br[i]));
    }
  }
  const ms = performance.now() - start;
  const processed = frames + Math.min(from, 3) * sr;
  console.log(`${def.id.padEnd(26)} ${ms.toFixed(0).padStart(5)} ms  ${(frames / sr / (ms / 1000)).toFixed(1).padStart(5)}x realtime  RMS player ${Math.sqrt(ep / (2 * frames)).toFixed(3)} band ${Math.sqrt(eb / (2 * frames)).toFixed(3)}  peak ${peak.toFixed(3)}  limiter avg ${((stats.get('gr') ?? 0) / processed * 100).toFixed(1)}%`);
}
