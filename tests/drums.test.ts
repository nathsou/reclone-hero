import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart } from '../src/chart/build.ts';
import { parseDotChart } from '../src/chart/dotchart.ts';
import { parseMidiChart } from '../src/chart/midichart.ts';
import { HOPO, STRUM } from '../src/chart/types.ts';
import { Engine, HIT, MISSED } from '../src/engine/engine.ts';
import { applyAction, botActions } from '../src/engine/bot.ts';

const chart = (body: string) =>
  buildChart(
    parseDotChart(`[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[ExpertDrums]
{
${body}
}
`),
  );

test('4-lane .chart drums: one note per gem, kick first, cymbal markers', () => {
  const c = chart(`  192 = N 0 0
  192 = N 2 0
  192 = N 66 0
  384 = N 1 0
  384 = N 4 0
  576 = N 3 0
  576 = S 2 200`);
  const t = c.tracks.get('drums:expert')!;
  const n = t.notes;
  assert.equal(c.noteCount('drums:expert'), 5);
  assert.deepEqual(Array.from(n.mask), [0, 0b0010, 0b0001, 0b1000, 0b0100]);
  assert.deepEqual(Array.from(n.type), [STRUM, HOPO, STRUM, STRUM, STRUM]);
  assert.equal(n.endTime[1], n.time[1], 'no sustains on drums');
  assert.equal(t.starPower.length, 1);
  assert.ok(!c.tracks.has('touch:expert'), 'no touch part folded from drums');
});

test('5-lane charts fold to 4 lanes (orange → green cymbal, green → green tom)', () => {
  const n = chart(`  0 = N 2 0
  192 = N 4 0
  384 = N 5 0
  576 = N 4 0
  576 = N 5 0`).tracks.get('drums:expert')!.notes;
  assert.deepEqual(Array.from(n.mask), [0b0010, 0b1000, 0b1000, 0b0100, 0b1000]);
  assert.deepEqual(Array.from(n.type), [HOPO, HOPO, STRUM, STRUM, HOPO]);
});

function midiDrums(notes: [number, number][], extra: [number, number, number][] = []): Uint8Array {
  // format 1: a tempo track and PART DRUMS, 480 ticks per quarter
  const vlq = (v: number) => {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const trk = (events: number[]) => [0x4d, 0x54, 0x72, 0x6b, (events.length >>> 24) & 255, (events.length >>> 16) & 255, (events.length >>> 8) & 255, events.length & 255, ...events];
  const tempo = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0];
  const evs: { tick: number; bytes: number[] }[] = [];
  for (const [tick, pitch] of notes) evs.push({ tick, bytes: [0x90, pitch, 100] }, { tick: tick + 60, bytes: [0x80, pitch, 0] });
  for (const [start, end, pitch] of extra) evs.push({ tick: start, bytes: [0x90, pitch, 100] }, { tick: end, bytes: [0x80, pitch, 0] });
  evs.sort((a, b) => a.tick - b.tick);
  const name = [...'PART DRUMS'].map((c) => c.charCodeAt(0));
  const body: number[] = [0, 0xff, 0x03, name.length, ...name];
  let last = 0;
  for (const e of evs) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0, ...trk(tempo), ...trk(body)]);
}

test('MIDI drums: pro charts are cymbals unless a tom marker says otherwise', () => {
  const pro = buildChart(parseMidiChart(midiDrums([[0, 96], [0, 98], [480, 99], [960, 100]], [[470, 500, 111]])));
  const n = pro.tracks.get('drums:expert')!.notes;
  assert.deepEqual(Array.from(n.mask), [0, 0b0010, 0b0100, 0b1000]);
  assert.deepEqual(Array.from(n.type), [STRUM, HOPO, STRUM, HOPO]);
  // without tom markers everything is a tom
  const plain = buildChart(parseMidiChart(midiDrums([[0, 98], [480, 99]]))).tracks.get('drums:expert')!.notes;
  assert.deepEqual(Array.from(plain.type), [STRUM, STRUM]);
});

test('the drum judge takes gems one by one, in any order within the window', () => {
  const t = chart(`  192 = N 0 0
  192 = N 1 0
  192 = N 2 0
  384 = N 3 0
  576 = N 4 0`).tracks.get('drums:expert')!;
  const c = chart('');
  const e = new Engine(t, c.tempo);
  e.pad(0.5, 0b0010); // yellow first, then red, then the kick
  e.pad(0.51, 0b0001);
  e.pad(0.52, 0);
  e.pad(0.6, 0b1000); // nothing there: an overhit, no penalty
  assert.equal(e.overhits, 1);
  assert.equal(e.streak, 3);
  e.pad(1.0, 0b0100);
  e.advance(3);
  assert.deepEqual(Array.from(e.noteState), [HIT, HIT, HIT, HIT, MISSED]);
  assert.equal(e.hits, 4);
  assert.equal(e.misses, 1);
});

test('the drum bot full-combos a drum part', () => {
  const t = chart(Array.from({ length: 40 }, (_, i) => `  ${i * 96} = N ${i % 5} 0\n  ${i * 96} = N ${(i + 2) % 5} 0`).join('\n')).tracks.get('drums:expert')!;
  const e = new Engine(t, chart('').tempo);
  for (const a of botActions(t)) applyAction(e, a);
  e.advance(100);
  assert.equal(e.hits, t.notes.length);
  assert.equal(e.misses, 0);
});
