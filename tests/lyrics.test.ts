import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotChart } from '../src/chart/dotchart.ts';
import { parseMidiChart } from '../src/chart/midichart.ts';
import { buildChart } from '../src/chart/build.ts';
import { buildLyrics, cleanSyllable, lineText } from '../src/chart/lyrics.ts';

test('syllable markers are removed and hyphens join words', () => {
  assert.deepEqual(cleanSyllable('Hel-'), { text: 'Hel', join: true });
  assert.deepEqual(cleanSyllable('lo'), { text: 'lo', join: false });
  assert.deepEqual(cleanSyllable('Jay='), { text: 'Jay-', join: true });
  assert.deepEqual(cleanSyllable('hey#'), { text: 'hey', join: false });
  assert.deepEqual(cleanSyllable('oh^'), { text: 'oh', join: false });
  assert.deepEqual(cleanSyllable('yeah-#'), { text: 'yeah', join: true });
  assert.deepEqual(cleanSyllable('$harm'), { text: 'harm', join: false });
  assert.deepEqual(cleanSyllable('<i>whis</i>-'), { text: 'whis', join: true });
  assert.deepEqual(cleanSyllable('rock_on'), { text: 'rock on', join: false });
  assert.equal(cleanSyllable('+'), null);
  assert.equal(cleanSyllable('+-'), null);
  assert.equal(cleanSyllable('  '), null);
});

const at = (tick: number) => tick / 100;

test('each phrase is a line; the last syllable of a line never joins the next', () => {
  const lyrics = [
    { tick: 100, text: 'Hel-' },
    { tick: 150, text: 'lo' },
    { tick: 200, text: 'world-' },
    { tick: 400, text: 'a-' },
    { tick: 420, text: 'gain' },
    { tick: 900, text: 'stray' },
  ];
  const lines = buildLyrics(lyrics, [{ start: 400, end: 500 }, { start: 90, end: 300 }], at);
  assert.equal(lines.length, 2);
  assert.equal(lineText(lines[0]), 'Hello world');
  assert.equal(lines[0].syllables[2].join, false);
  assert.equal(lines[0].startTime, 0.9);
  assert.equal(lines[0].endTime, 3);
  assert.equal(lineText(lines[1]), 'again');
});

test('without phrases, lines break at pauses between words', () => {
  const lyrics = [
    { tick: 0, text: 'one' },
    { tick: 50, text: 'two' },
    { tick: 100, text: 'three' },
    { tick: 500, text: 'four' },
    { tick: 550, text: 'fi-' },
    { tick: 750, text: 've' },
  ];
  const lines = buildLyrics(lyrics, [], at);
  assert.deepEqual(lines.map(lineText), ['one two three', 'four five']);
});

const CHART = `[Song]
{
  Resolution = 192
}
[SyncTrack]
{
  0 = B 120000
}
[Events]
{
  0 = E "section Verse"
  192 = E "phrase_start"
  192 = E "lyric We-"
  288 = E "lyric 're"
  384 = E "lyric on="
  480 = E "lyric line"
  576 = E "phrase_end"
  768 = E "phrase_start"
  768 = E "lyric Next#"
  960 = E "lyric one"
}
[ExpertSingle]
{
  0 = N 0 0
}
`;

test('.chart lyric events become timed lines; an unended phrase runs past its last syllable', () => {
  const chart = buildChart(parseDotChart(CHART));
  assert.equal(chart.lyrics.length, 2);
  const [a, b] = chart.lyrics;
  assert.equal(lineText(a), "We're on-line");
  assert.equal(a.startTime, 0.5);
  assert.equal(a.endTime, 1.5);
  assert.equal(a.syllables[1].time, 0.75);
  assert.equal(lineText(b), 'Next one');
  assert.ok(b.endTime > b.syllables[1].time);
});

// ---------------------------------------------------------------- a minimal MIDI writer

function varlen(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

type Ev = [tick: number, bytes: number[]];

function track(events: Ev[]): number[] {
  const data: number[] = [];
  let last = 0;
  for (const [tick, bytes] of events.sort((a, b) => a[0] - b[0])) {
    data.push(...varlen(tick - last), ...bytes);
    last = tick;
  }
  data.push(0, 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255, ...data];
}

const meta = (type: number, text: string): number[] => {
  const b = [...new TextEncoder().encode(text)];
  return [0xff, type, ...varlen(b.length), ...b];
};
const on = (note: number): number[] => [0x90, note, 100];
const off = (note: number): number[] => [0x80, note, 0];

function midi(tracks: number[][]): Uint8Array {
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, 0x01, 0xe0];
  return new Uint8Array([...head, ...tracks.flat()]);
}

test('.mid lyrics come from PART VOCALS, lines from its phrase notes', () => {
  const bytes = midi([
    track([[0, meta(0x03, 'tempo')], [0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]]]),
    track([[0, meta(0x03, 'PART GUITAR')], [0, on(96)], [120, off(96)]]),
    track([
      [0, meta(0x03, 'PART VOCALS')],
      [480, on(105)],
      [480, meta(0x05, 'Sing-')],
      [600, meta(0x05, 'ing')],
      [720, meta(0x01, '[idle]')],
      [720, meta(0x05, 'loud')],
      [960, off(105)],
      [1440, on(105)],
      [1440, on(106)],
      [1440, meta(0x05, 'Again+')],
      [1680, meta(0x05, '+')],
      [1920, off(105)],
      [1920, off(106)],
    ]),
  ]);
  const chart = buildChart(parseMidiChart(bytes));
  assert.deepEqual(chart.lyrics.map(lineText), ['Singing loud', 'Again']);
  assert.equal(chart.lyrics[0].startTime, 0.5);
  assert.equal(chart.lyrics[0].endTime, 1);
  assert.equal(chart.lyrics[1].syllables.length, 1);
});
