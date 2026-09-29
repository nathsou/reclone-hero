import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseDotChart } from '../src/chart/dotchart.ts';
import { buildChart } from '../src/chart/build.ts';
import { loadChart } from '../src/chart/load.ts';
import { makeSongEntry } from '../src/library/song.ts';
import { Engine, HIT, MISSED } from '../src/engine/engine.ts';
import type { EngineEvent } from '../src/engine/engine.ts';
import { applyAction, botActions } from '../src/engine/bot.ts';

const CHART = `[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertSingle]
{
  768 = N 0 0
  960 = N 1 0
  1008 = N 2 0
  1152 = N 3 384
  1152 = S 2 10
  1728 = N 4 0
  1728 = N 6 0
}
`;
// times: 2.0 G strum, 2.5 R strum, 2.625 Y hopo, 3.0 B strum sustain to 4.0 (SP), 4.5 O tap

function setup() {
  const chart = buildChart(parseDotChart(CHART));
  const track = chart.tracks.get('guitar:expert')!;
  return { track, engine: new Engine(track, chart.tempo) };
}

function types(events: EngineEvent[]) {
  return events.map((e) => e.type);
}

test('perfect play hits everything, scores sustains and completes star power', () => {
  const { track, engine } = setup();
  for (const a of botActions(track)) applyAction(engine, a);
  engine.advance(10);
  assert.deepEqual([...engine.noteState], [HIT, HIT, HIT, HIT, HIT]);
  assert.equal(engine.streak, 5);
  assert.ok(engine.spBar > 0.25, 'phrase + whammy'); // phrase bonus plus whammy fill
  // 5 notes * 50 + 2 beats of sustain * 25
  assert.ok(Math.abs(engine.score - 300) < 1e-6, String(engine.score));
});

test('strum with no note is an overstrum and breaks the streak', () => {
  const { engine } = setup();
  engine.setFrets(1.99, 1);
  engine.strum(2.0);
  assert.equal(engine.streak, 1);
  engine.strum(2.2);
  engine.advance(2.3);
  const ev = types(engine.drainEvents());
  assert.ok(ev.includes('overstrum'));
  assert.ok(ev.includes('streakBreak'));
  assert.equal(engine.streak, 0);
});

test('wrong fret strum costs the note; HOPO needs a strum after a miss', () => {
  const { engine } = setup();
  engine.setFrets(1.9, 1);
  engine.strum(2.0);
  engine.setFrets(2.45, 4); // yellow instead of red
  engine.strum(2.5);
  engine.advance(2.56);
  assert.equal(engine.noteState[1], MISSED);
  engine.drainEvents();
  engine.setFrets(2.6, 4); // hammer yellow HOPO: not allowed after a miss
  engine.advance(2.62);
  assert.equal(engine.noteState[2], 0);
  engine.strum(2.63);
  assert.equal(engine.noteState[2], HIT);
});

test('strum slightly before the fret press is forgiven (strum leniency)', () => {
  const { engine } = setup();
  engine.strum(1.99);
  engine.setFrets(2.02, 1);
  assert.equal(engine.noteState[0], HIT);
  assert.equal(engine.overstrums, 0);
});

test('anchoring: lower frets may be held on single notes', () => {
  const { engine } = setup();
  engine.setFrets(1.9, 1);
  engine.strum(2.0);
  engine.setFrets(2.4, 0b11);
  engine.strum(2.5);
  assert.equal(engine.noteState[1], HIT);
});

test('releasing a sustain early drops it', () => {
  const { engine } = setup();
  engine.setFrets(2.9, 8);
  engine.strum(3.0);
  engine.setFrets(3.5, 0);
  const ev = types(engine.drainEvents());
  assert.ok(ev.includes('sustainDrop'));
});

test('anti-ghosting: a wrong higher fret over a HOPO forces a strum', () => {
  const { engine } = setup();
  engine.setFrets(1.9, 1);
  engine.strum(2.0);
  engine.setFrets(2.4, 2);
  engine.strum(2.5); // red hit
  engine.setFrets(2.6, 0b1010); // blue pressed: higher than the yellow HOPO -> ghost
  engine.setFrets(2.61, 0b0110); // now the right shape, but hammering is forfeited
  assert.equal(engine.noteState[2], 0);
  engine.strum(2.63);
  assert.equal(engine.noteState[2], HIT);
});

test('late misses are reported once the window passes', () => {
  const { engine } = setup();
  engine.advance(2.2);
  const ev = engine.drainEvents();
  assert.equal(ev.filter((e) => e.type === 'miss').length, 1);
  assert.equal(engine.noteState[0], MISSED);
});

const ROOT = process.env.CHARTS_DIR ?? '/Volumes/S/charts';
function* walk(dir: string, rel: string): Generator<{ abs: string; rel: string; files: string[] }> {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  if (files.some((f) => /\.(chart|mid)$/i.test(f))) yield { abs: dir, rel, files };
  for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.')) yield* walk(`${dir}/${e.name}`, rel ? `${rel}/${e.name}` : e.name);
}

test('bots with and without timing jitter full-combo every chart in the library', { skip: !existsSync(ROOT) && 'no library' }, () => {
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const problems: string[] = [];
  let tracks = 0;
  for (const folder of walk(ROOT, '')) {
    const ini = folder.files.find((f) => f.toLowerCase() === 'song.ini');
    const entry = makeSongEntry({ path: folder.rel, files: folder.files, ini: ini ? readFileSync(`${folder.abs}/${ini}`) : null, chartHead: null });
    if (!entry) continue;
    const chart = loadChart(entry.chartFile, readFileSync(`${folder.abs}/${entry.chartFile}`), entry.chartOptions);
    for (const [key, track] of chart.tracks) {
      tracks++;
      // Touch parts are folded from the guitar part: check a perfect run can full-combo them (the
      // jittered bot stays on the parts as charted, drawing the same random numbers as before).
      for (const jitter of track.instrument === 'touch' ? [0] : [0, 0.035]) {
        const engine = new Engine(track, chart.tempo);
        for (const a of botActions(track, { jitter, random })) applyAction(engine, a);
        engine.advance(chart.lastNoteTime + 5);
        if (engine.misses || engine.overstrums) {
          const ev = engine.drainEvents().find((e) => e.type === 'miss' || e.type === 'overstrum');
          problems.push(`${folder.rel} ${key} jitter=${jitter}: misses=${engine.misses} overstrums=${engine.overstrums} first=${JSON.stringify(ev)}`);
        }
      }
    }
  }
  console.log(`${tracks} tracks checked, ${problems.length} problems`);
  if (problems.length) console.log(problems.slice(0, 15).join('\n'));
  assert.equal(problems.length, 0);
});
