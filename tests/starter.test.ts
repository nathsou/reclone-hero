import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart } from '../src/chart/build.ts';
import { parseDotChart } from '../src/chart/dotchart.ts';
import { generateChart } from '../src/starter/chartgen.ts';
import { renderSong } from '../src/starter/render.ts';
import { diatonic, midi, seq, Tempo } from '../src/starter/score.ts';
import { STARTER_SONGS } from '../src/starter/songs/index.ts';

test('riff notation: pitches, sticky durations, chords, rests, repeats', () => {
  const n = seq('E2:2 G2 A2^5s:1 .:3 (C3*:1)x2 D3!/2:4');
  assert.deepEqual(
    n.map((x) => [x.b, x.d, x.p]),
    [
      [0, 0.5, [40]],
      [0.5, 0.5, [43]],
      [1, 0.25, [45, 52]],
      [2, 0.25, [48]],
      [2.25, 0.25, [48]],
      [2.5, 1, [50]],
    ],
  );
  assert.equal(n[3].mute, true);
  assert.equal(n[5].bend, 2);
  assert.ok(n[5].v > n[0].v);
  assert.equal(midi('C4'), 60);
  assert.equal(midi('Bb3'), 58);
});

test('diatonic harmony stays in the key', () => {
  const third = diatonic(seq('D4:4 E4 F#4 A4'), [2, 4, 6, 7, 9, 11, 1], -2);
  assert.deepEqual(
    third.map((x) => x.p[0]),
    [59, 61, 62, 66], // B3 C#4 D4 F#4
  );
});

test('tempo map converts both ways across changes', () => {
  const t = new Tempo([
    { beat: 0, bpm: 120 },
    { beat: 8, bpm: 60 },
  ]);
  assert.equal(t.toSec(8), 4);
  assert.equal(t.toSec(10), 6);
  assert.equal(t.toBeat(6), 10);
});

for (const def of STARTER_SONGS) {
  test(`built-in "${def.name}": chart parses, difficulties scale, everything fits the song`, () => {
    const gen = generateChart(def);
    const chart = buildChart(parseDotChart(gen.text));
    const counts = (['easy', 'medium', 'hard', 'expert'] as const).map((d) => {
      const track = chart.tracks.get(`guitar:${d}`);
      assert.ok(track, `${d} track`);
      return track.notes.length;
    });
    for (let i = 1; i < 4; i++) assert.ok(counts[i] > counts[i - 1], `${def.id}: ${counts.join(' < ')}`);
    assert.ok(counts[0] >= 40, `${def.id}: easy has ${counts[0]} notes`);
    assert.equal(chart.sections.length, def.sections.length);
    const end = new Tempo(def.tempo).toSec(def.lengthBeats);
    assert.ok(chart.lastNoteTime < end, `${def.id}: last note ${chart.lastNoteTime} past ${end}`);
    // every part's notes lie inside the song
    for (const part of [...def.player, ...def.backing]) for (const n of part.notes) assert.ok(n.b >= 0 && n.b + n.d <= def.lengthBeats + 1e-6, `${def.id}: note at ${n.b}`);
    for (const d of def.drums) for (const h of d.hits) assert.ok(h.b >= 0 && h.b <= def.lengthBeats, `${def.id}: hit at ${h.b}`);
    // Easy uses three frets, Medium four
    const easy = chart.tracks.get('guitar:easy')!;
    const medium = chart.tracks.get('guitar:medium')!;
    for (let i = 0; i < easy.notes.length; i++) assert.ok(easy.notes.mask[i] < 1 << 3);
    for (let i = 0; i < medium.notes.length; i++) assert.ok(medium.notes.mask[i] < 1 << 4);
  });
}

test('the renderer produces bounded, non-silent audio in both stems', () => {
  const def = STARTER_SONGS.find((s) => s.id === 'ignition')!;
  let peak = 0;
  let energyP = 0;
  let energyB = 0;
  for (const b of renderSong(def, 22050, 20, 26)) {
    for (let i = 0; i < b.n; i++) {
      peak = Math.max(peak, Math.abs(b.pl[i] + b.bl[i]), Math.abs(b.pr[i] + b.br[i]));
      energyP += b.pl[i] ** 2;
      energyB += b.bl[i] ** 2;
      assert.ok(Number.isFinite(b.pl[i]) && Number.isFinite(b.bl[i]));
    }
  }
  assert.ok(peak <= 1, `peak ${peak}`);
  assert.ok(energyP > 1 && energyB > 1);
});

test('ABC reader: key signature, lengths, broken rhythm, repeats with endings, chords', async () => {
  const { abc, harmony } = await import('../src/starter/abc.ts');
  const t = abc(`X:1
T:Test
M:4/4
L:1/8
K:G
|:"G" G2 AB c>d e2|1 "D" f4 z4:|2 "G" g8|]`);
  // F is sharp in G major; c>d is dotted; the first ending is skipped the second time through
  const pitches = t.notes.map((n) => n.p[0]);
  assert.deepEqual(pitches, [67, 69, 71, 72, 74, 76, 78, 67, 69, 71, 72, 74, 76, 79]);
  assert.equal(t.notes[3].d, 0.75);
  assert.equal(t.notes[4].d, 0.25);
  assert.equal(t.length, 16);
  assert.deepEqual(harmony(t, 4), ['G', 'D', 'G', 'G']);
  const minor = abc(`M:3/4\nL:1/4\nK:Am\n[CEG]2 ^F | (3ABc d|`);
  assert.deepEqual(minor.notes[0].p, [60, 64, 67]);
  assert.equal(minor.notes[1].p[0], 66);
  assert.ok(Math.abs(minor.notes[2].d - 2 / 3) < 1e-9);
});

test('every ABC tune quoted in a built-in song adds up, bar by bar', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { abc } = await import('../src/starter/abc.ts');
  const dir = new URL('../src/starter/songs/', import.meta.url).pathname;
  let tunes = 0;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const src = new TextDecoder().decode(readFileSync(dir + f.name));
    for (const m of src.matchAll(/abc\(`([^`$]*)`/g)) {
      const t = abc(m[1]);
      // an upbeat and the bar that completes it may be short
      const inner = t.bars.slice(1, -1);
      inner.forEach((b, i) => assert.ok(Math.abs(b - t.bar) < 1e-6, `${f.name}: bar ${i + 1} lasts ${b} beats, not ${t.bar}`));
      tunes++;
    }
  }
  assert.ok(tunes >= 5);
});

test('every built-in song has a three-fret touch part on every difficulty', () => {
  for (const def of STARTER_SONGS) {
    const chart = buildChart(parseDotChart(generateChart(def).text));
    let prev = 0;
    for (const d of ['easy', 'medium', 'hard', 'expert'] as const) {
      const track = chart.tracks.get(`touch:${d}`);
      assert.ok(track && track.notes.length, `${def.id} touch:${d}`);
      for (let i = 0; i < track.notes.length; i++) {
        const mask = track.notes.mask[i];
        assert.equal(mask & 0b01010, 0, `${def.id} touch:${d} uses only green, yellow and orange`);
        assert.ok([1, 4, 16, 5, 17, 20].includes(mask), `${def.id} touch:${d}: at most two frets (mask ${mask})`);
      }
      assert.ok(track.notes.length >= prev, `${def.id}: touch difficulties scale`);
      prev = track.notes.length;
    }
  }
});

const added = new Set(['mars-war-machine', 'mercury-winged-messenger', 'jupiter-jollity', 'paper-hearts', 'city-lights', 'golden-hour', 'warehouse-current', 'prism-parade', 'assembly-line', 'photon-run']);
for (const def of STARTER_SONGS.filter(s => added.has(s.id))) {
  test(`new "${def.name}": complete audio is finite, bounded and audible in both stems`, () => {
    let peak = 0, ep = 0, eb = 0, frames = 0;
    for (const b of renderSong(def, 22050)) {
      frames += b.n;
      for (let i = 0; i < b.n; i++) {
        assert.ok(Number.isFinite(b.pl[i]) && Number.isFinite(b.pr[i]) && Number.isFinite(b.bl[i]) && Number.isFinite(b.br[i]));
        peak = Math.max(peak, Math.abs(b.pl[i] + b.bl[i]), Math.abs(b.pr[i] + b.br[i]));
        ep += b.pl[i] ** 2 + b.pr[i] ** 2;
        eb += b.bl[i] ** 2 + b.br[i] ** 2;
      }
    }
    assert.ok(peak <= 0.981, `mix peak ${peak}`);
    assert.ok(Math.sqrt(ep / (frames * 2)) > 0.02, 'player is audible');
    assert.ok(Math.sqrt(eb / (frames * 2)) > 0.02, 'band is audible');
  });
  test(`new "${def.name}": every generated part/difficulty can be full-comboed`, async () => {
    const { Engine } = await import('../src/engine/engine.ts');
    const { applyAction, botActions } = await import('../src/engine/bot.ts');
    const chart = buildChart(parseDotChart(generateChart(def).text));
    for (const [key, track] of chart.tracks) {
      const engine = new Engine(track, chart.tempo);
      for (const action of botActions(track)) applyAction(engine, action);
      engine.advance(chart.lastNoteTime + 5);
      assert.equal(engine.hits, track.notes.length, `${def.id} ${key}`);
      assert.equal(engine.misses, 0, `${def.id} ${key}`);
      assert.equal(engine.overstrums, 0, `${def.id} ${key}`);
    }
  });
}

test('Holst opening excerpts keep their original meter and pitches', async () => {
  const { MARS_OSTINATO, MERCURY_MOTIF, JUPITER_MOTIF } = await import('../src/starter/songs/planets.ts');
  const { seqLength } = await import('../src/starter/score.ts');
  assert.equal(seqLength(MARS_OSTINATO), 5);
  assert.equal(seqLength(MERCURY_MOTIF), 6);
  // The notation ends with an eighth rest; seqLength measures the last sounding note.
  assert.equal(seqLength(JUPITER_MOTIF) + 0.5, 14);
  assert.deepEqual(MERCURY_MOTIF.slice(0, 6).map(n => n.p[0]), [65, 70, 74, 76, 71, 68]);
});
