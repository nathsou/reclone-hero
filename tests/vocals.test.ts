import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart } from '../src/chart/build.ts';
import { parseMidiChart } from '../src/chart/midichart.ts';
import { STRUM, TAP } from '../src/chart/types.ts';
import { HIT, MISSED, baseScore } from '../src/engine/engine.ts';
import { VocalJudge, phraseRating } from '../src/engine/vocals.ts';

/** A format-1 MIDI with a tempo track (120 BPM, 480 ticks per quarter) and PART VOCALS. */
function midiVocals(notes: [number, number, number, string][], phrases: [number, number][], sp: [number, number][] = []): Uint8Array {
  const vlq = (v: number) => {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const trk = (events: number[]) => [0x4d, 0x54, 0x72, 0x6b, (events.length >>> 24) & 255, (events.length >>> 16) & 255, (events.length >>> 8) & 255, events.length & 255, ...events];
  const tempo = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0];
  const evs: { tick: number; order: number; bytes: number[] }[] = [];
  const text = (s: string) => [...new TextEncoder().encode(s)];
  for (const [start, end, pitch, lyric] of notes) {
    const t = text(lyric);
    evs.push({ tick: start, order: 0, bytes: [0xff, 0x05, t.length, ...t] }, { tick: start, order: 1, bytes: [0x90, pitch, 100] }, { tick: end, order: -1, bytes: [0x80, pitch, 0] });
  }
  for (const [s, e] of phrases) evs.push({ tick: s, order: 1, bytes: [0x90, 105, 100] }, { tick: e, order: -1, bytes: [0x80, 105, 0] });
  for (const [s, e] of sp) evs.push({ tick: s, order: 1, bytes: [0x90, 116, 100] }, { tick: e, order: -1, bytes: [0x80, 116, 0] });
  evs.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const name = text('PART VOCALS');
  const body: number[] = [0, 0xff, 0x03, name.length, ...name];
  let last = 0;
  for (const e of evs) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0, ...trk(tempo), ...trk(body)]);
}

// 120 BPM, 480 ticks a beat: 480 ticks = 0.5 s
const song = midiVocals(
  [
    [480, 900, 60, 'Hel-'],
    [960, 1400, 62, 'lo'],
    [1920, 2300, 64, 'world#'],
    [2400, 2900, 65, '+'],
  ],
  [[400, 1500], [1800, 3000]],
  [[400, 1500]],
);

test('PART VOCALS gives a vocal part on every difficulty: pitches, syllables, talkies, lines', () => {
  const chart = buildChart(parseMidiChart(song));
  for (const d of ['easy', 'medium', 'hard', 'expert']) assert.equal(chart.noteCount(`vocals:${d}`), 4);
  const t = chart.tracks.get('vocals:expert')!;
  assert.deepEqual(Array.from(t.notes.mask), [60, 62, 64, 65]);
  assert.deepEqual(Array.from(t.notes.type), [STRUM, STRUM, TAP, STRUM]);
  assert.deepEqual(t.syllables, ['Hel', 'lo', 'world', '']);
  assert.deepEqual(t.lines!.map((l) => [l.first, l.last]), [[0, 1], [2, 3]]);
  assert.equal(t.starPower.length, 1);
  assert.ok(Math.abs(t.notes.endTime[0] - 0.9375) < 1e-9);
  assert.ok(Number.isFinite(baseScore(t, chart.tempo)) && baseScore(t, chart.tempo) > 0);
  assert.equal(chart.lyrics.length, 2, 'the lyrics still show as lines');
});

test('notes sung in tune (any octave) are hits; phrases are rated', () => {
  const chart = buildChart(parseMidiChart(song));
  const j = new VocalJudge(chart.tracks.get('vocals:expert')!, chart.tempo);
  const events: string[] = [];
  const step = 1 / 60;
  for (let t = 0; t < 3.2; t += step) {
    // an octave up on the first note, in tune on the second, the talkie just spoken, the slide not sung
    let pitch = NaN;
    if (t >= 0.5 && t < 0.94) pitch = 72.3;
    else if (t >= 1 && t < 1.46) pitch = 61.6;
    const voiced = (t >= 2 && t < 2.4) || pitch === pitch;
    j.sing(t, pitch, voiced);
    j.advance(t);
    for (let i = 0; i < j.pendingEvents; i++) {
      const e = j.event(i);
      if (e.type === 'vocalPhrase') events.push(`phrase:${e.value}`);
    }
    j.clearEvents();
  }
  assert.deepEqual(Array.from(j.noteState), [HIT, HIT, HIT, MISSED]);
  assert.ok(j.score > 0);
  assert.equal(j.spBar, 0.25, 'the star power phrase was sung');
  assert.deepEqual(events, [`phrase:${5}`, `phrase:${phraseRating(0.4 / 0.9)}`]);
});

test('the bot sings everything, and silence misses everything', () => {
  const chart = buildChart(parseMidiChart(song));
  const bot = new VocalJudge(chart.tracks.get('vocals:hard')!, chart.tempo);
  bot.autoSing = true;
  bot.advance(5);
  assert.equal(bot.hits, 4);
  const quiet = new VocalJudge(chart.tracks.get('vocals:easy')!, chart.tempo);
  for (let t = 0; t < 4; t += 0.02) {
    quiet.sing(t, NaN, false);
    quiet.advance(t);
  }
  assert.equal(quiet.misses, 4);
  assert.equal(phraseRating(0), 0);
  assert.equal(phraseRating(1), 5);
});
