import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotChart } from '../src/chart/dotchart.ts';
import { buildChart } from '../src/chart/build.ts';
import { HOPO, STRUM, TAP } from '../src/chart/types.ts';

const CHART = `[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
  768 = B 240000
}
[Events]
{
  0 = E "section Intro"
}
[ExpertSingle]
{
  0 = N 0 0
  48 = N 1 0
  96 = N 1 0
  192 = N 0 0
  192 = N 1 0
  240 = N 1 0
  384 = N 2 0
  384 = N 5 0
  576 = N 3 0
  576 = N 6 0
  768 = N 7 96
  768 = S 2 200
  800 = N 4 0
  900 = E solo
  960 = N 0 400
  960 = E soloend
  1000 = N 1 0
}
`;

test('parses .chart tempo, sections and notes', () => {
  const chart = buildChart(parseDotChart(CHART));
  assert.equal(chart.resolution, 192);
  assert.equal(chart.sections[0].name, 'Intro');
  // 120 bpm: 192 ticks = 0.5s; after tick 768 (2s) 240 bpm
  assert.ok(Math.abs(chart.tempo.tickToTime(768) - 2) < 1e-9);
  assert.ok(Math.abs(chart.tempo.tickToTime(960) - 2.25) < 1e-9);
  const notes = chart.tracks.get('guitar:expert')!.notes;
  assert.equal(notes.length, 11);
  assert.deepEqual(
    notes.map((n) => n.type),
    [STRUM, HOPO, STRUM, STRUM, STRUM, HOPO, TAP, STRUM, HOPO, STRUM, HOPO],
  );
  // chord at 192 then single red inside the chord = strum; forced note at 384 flips strum -> hopo
  assert.equal(notes[3].mask, 0b11);
  assert.equal(notes[7].mask, 0, 'open note');
  // open sustain trimmed to next note
  assert.equal(notes[7].endTick, 800);
  // green sustain from 960 continues under red at 1000 (extended sustain)
  assert.equal(notes[9].endTick, 1360);
  assert.equal(chart.tracks.get('guitar:expert')!.starPower.length, 1);
  assert.equal(notes[7].sp, 0);
  assert.equal(notes[9].sp, 0);
  assert.equal(notes[10].sp, -1);
  assert.equal(notes[9].solo, 0);
  assert.equal(notes[10].solo, -1);
});
