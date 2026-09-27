// Frame-loop benchmark: runs the real Game (engine, renderer, HUD, audio clock, input polling) against
// mocks and reports JS time and heap garbage per frame.
//   node --expose-gc --max-semi-space-size=512 tests/bench/frame.bench.ts [song folder]
import { readdirSync, readFileSync } from 'node:fs';
import { clock, install, mockCanvas, mockGL, rafQueue } from './mocks.ts';

install();
const { loadChart } = await import('../../src/chart/load.ts');
const { makeSongEntry } = await import('../../src/library/song.ts');
const { Game } = await import('../../src/game/game.ts');
const { Hud } = await import('../../src/ui/hud.ts');
const { audio } = await import('../../src/audio/audio.ts');
const { updateSettings } = await import('../../src/settings.ts');

const DIR = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '/Volumes/S/charts/Anti Hero 2/[AH2] 38. The Experience - The Final Challenge/Schmutz06 - Madness March Kamikaze 2 (Schmutz06)';
const files = readdirSync(DIR, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
const ini = files.find((f) => f.toLowerCase() === 'song.ini');
const song = makeSongEntry({ path: 'bench', files, ini: ini ? readFileSync(`${DIR}/${ini}`) : null, chartHead: null })!;
const chart = loadChart(song.chartFile, readFileSync(`${DIR}/${song.chartFile}`), song.chartOptions);
const track = chart.tracks.get('guitar:expert')!;
updateSettings({ showFps: false, noteStyle: (process.env.BENCH_SKIN ?? 'neon') as 'neon' });
const { initTheme } = await import('../../src/ui/theme.ts');
initTheme();

function densestStart(): number {
  let best = 0;
  let at = 0;
  for (let i = 0, j = 0; i < track.notes.length; i++) {
    while (track.notes[i].time - track.notes[j].time > 20) j++;
    if (i - j > best) {
      best = i - j;
      at = track.notes[j].time;
    }
  }
  return at;
}

const FRAME_MS = 1000 / 120;

// Sampling heap profiler (node:inspector) to attribute garbage to source lines.
const { Session } = await import('node:inspector/promises');
const session = new Session();
session.connect();
async function startSampling() {
  await session.post('HeapProfiler.startSampling', { samplingInterval: 32, includeObjectsCollectedByMinorGC: true, includeObjectsCollectedByMajorGC: true });
}
interface ProfNode { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children: ProfNode[] }
async function stopSampling(frames: number) {
  const { profile } = (await session.post('HeapProfiler.stopSampling')) as { profile: { head: ProfNode } };
  const by = new Map<string, number>();
  const walk = (n: ProfNode, parent: string) => {
    const f = n.callFrame;
    const here = f.url.includes('/src/') ? `${f.functionName || '(anon)'} ${f.url.split('/src/')[1]}:${f.lineNumber + 1}` : parent;
    if (n.selfSize) by.set(here || f.functionName || '(native)', (by.get(here || f.functionName || '(native)') ?? 0) + n.selfSize);
    for (const c of n.children) walk(c, here);
  };
  walk(profile.head, '');
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  for (const [k, v] of top) console.log(`    ${(v / frames).toFixed(0).padStart(6)} B/frame  ${k}`);
}
const gcFn = (globalThis as { gc?: () => void }).gc;
if (!gcFn) throw new Error('run with --expose-gc');

function makeGame(sloppy: boolean) {
  const gl = mockGL();
  const hud = new Hud();
  const game = new Game({ song, chart, track, instrument: 'guitar', duration: chart.lastNoteTime + 5, bot: true }, mockCanvas(gl) as unknown as HTMLCanvasElement, hud);
  const g = game as unknown as { bot: { kind: string; t: number }[] };
  // A sloppy bot drops some strums and adds stray ones, exercising the miss/overstrum feedback paths.
  // BENCH_STUB=render,hud,sparks,burst,events replaces pieces with no-ops to bisect allocations.
  const stub = (process.env.BENCH_STUB ?? '').split(',');
  const r = game.renderer as unknown as Record<string, unknown>;
  if (stub.includes('render')) r.render = () => {};
  if (stub.includes('sparks')) r.sustainSparks = () => {};
  if (stub.includes('burst')) r.hitBurst = () => {};
  if (stub.includes('hud')) (hud as unknown as Record<string, unknown>).update = () => {};
  if (stub.includes('events')) (game as unknown as Record<string, unknown>).handleEvent = () => {};
  if (stub.includes('bot')) g.bot = [];
  if (stub.includes('video')) (game as unknown as Record<string, unknown>).syncVideo = () => {};
  if (sloppy) g.bot = g.bot.filter((_, i) => i % 9 !== 4).concat(g.bot.filter((a, i) => a.kind === 'strum' && i % 13 === 0).map((a) => ({ ...a, t: a.t + 0.2 }))).sort((a, b) => a.t - b.t);
  return game;
}

const frame = () => {
  clock.now += FRAME_MS;
  const cb = rafQueue.shift();
  cb?.(clock.now);
};

/** Play the densest 20 s (plus 5 s lead-in) of the song on a fresh game. */
function play(sloppy: boolean, measure?: (i: number) => void) {
  const game = makeGame(sloppy);
  const a = audio();
  const fakeBuf = a.ctx.createBuffer(2, 48000 * 400, 48000);
  a.setBuffers({ player: fakeBuf, backing: fakeBuf, crowd: null, origin: 0 });
  clock.now = 0;
  game.start();
  a.play(densestStart() - 6);
  for (let i = 0; i < 600; i++) frame();
  measure?.(0);
  return game;
}

async function run(label: string, sloppy: boolean) {
  // First pass warms up the JIT (as a minute of real play would); the second pass is measured.
  play(sloppy).stop();
  rafQueue.length = 0;
  const N = 2400; // 20 s at 120 fps
  const times: number[] = new Array(N);
  let heap0 = 0;
  let heap1 = 0;
  const game = play(sloppy);
  gcFn!();
  gcFn!();
  heap0 = process.memoryUsage().heapUsed;
  if (profile) await startSampling();
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    frame();
    times[i] = performance.now() - t0;
  }
  heap1 = process.memoryUsage().heapUsed;
  if (profile) await stopSampling(N);
  times.sort((x, y) => x - y);
  const e = (game as unknown as { engine: { hits: number; misses: number; overstrums: number } }).engine;
  console.log(
    `${label.padEnd(8)} garbage ${((heap1 - heap0) / N).toFixed(0).padStart(5)} B/frame (${((heap1 - heap0) / 1024 / 20).toFixed(0)} KB/s)` +
      `  js p50 ${times[N >> 1].toFixed(3)} ms  p99 ${times[Math.floor(N * 0.99)].toFixed(3)} ms  max ${times[N - 1].toFixed(3)} ms` +
      `  (hits ${e.hits}, misses ${e.misses}, overstrums ${e.overstrums})`,
  );
  game.stop();
  rafQueue.length = 0;
}

console.log(`${song.artist} - ${song.name}: ${track.notes.length} notes`);
const profile = process.argv.includes('--profile');
await run('perfect', false);
await run('sloppy', true);
