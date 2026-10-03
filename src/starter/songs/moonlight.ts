import { bassOf, comp, nearVoicing, parseChord, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars, GALLOP, ROCK_DRIVE } from '../patterns.ts';
import { diatonic, grid, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Beethoven, "Moonlight" Sonata, Op. 27 No. 2 (1801; public domain): the Adagio's rippling triplets,
// then the Presto agitato as melodic metal, its storm of rising arpeggios on lead guitar, each
// wave broken off by two hammered chords.
const bar = (n: number) => n * 4;
const G_SHARP_MINOR = [8, 10, 11, 1, 3, 4, 6];

const ADAGIO_H = prog('C#m C#m/B A G#7');
/** Presto: a rising arpeggio bar, then a bar of two chord hits, per chord of the lament bass. */
const PRESTO_H = prog('C#m C#m/B A G#7');
const THEME = 'D#5:6 E5:2 D#5:4 C#5:4 | B4:6 C#5:2 D#5:8 | E5:6 D#5:2 C#5:4 B4:4 | A#4:16 | D#5:6 E5:2 F#5:4 E5:4 | D#5:6 C#5:2 B4:8 | C#5:4 D#5:4 A#4:4 C#5:4 | G#4:16';
const THEME_H = prog('G#m G#m C#m D#7 G#m G#m C#m G#m');

/** Sixteen notes rising through a chord, four at a time, each group starting a step higher. */
function wave(chord: string, at: number): Note[] {
  const c = parseChord(chord);
  const tones = c.intervals.filter((i) => i < 12).map((i) => (c.root + i) % 12);
  // chord tones ascending from G#3 (56)
  const ladder: number[] = [];
  for (let p = 56; ladder.length < 10; p++) if (tones.includes(p % 12)) ladder.push(p);
  const out: Note[] = [];
  for (let g = 0; g < 4; g++) for (let k = 0; k < 4; k++) out.push({ b: at + g + k * 0.25, d: 0.25, p: [ladder[g + k]], v: k === 0 ? 0.85 : 0.75 });
  return out;
}
function storm(h: string[], from: number): Note[] {
  return h.flatMap((c, i) => wave(c, bar(from + i * 2)));
}
function hits(h: string[], from: number): Note[] {
  return h.flatMap((c, i) => seq('.:8 C4:2 .:2 C4:2 .:2', bar(from + i * 2 + 1)).map((n) => ({ ...n, p: powerOf(c, 'E2'), v: 0.95 })));
}

// Bar map (Adagio at 56 BPM): 0-3. Presto: storm 4, storm 12, theme 20, storm 28, theme 36, coda 44, end 48.
function drums(): Hit[] {
  const hitBars = (from: number, n: number) => {
    const out: Hit[] = [];
    for (let i = 0; i < n; i++) {
      out.push(...grid({ kick: 'x.x.x.x.x.x.x.x.', ride: 'x...x...x...x...' }, bar(from + i * 2)));
      out.push(...grid({ kick: '........X...X...', crash: '........X...X...', snare: '........X...X...' }, bar(from + i * 2 + 1)));
    }
    return out;
  };
  return [
    ...hitBars(4, 4),
    ...hitBars(12, 4),
    ...drumBars(ROCK_DRIVE, bar(20), 8, { crash: true, fill: 'toms2' }),
    ...hitBars(28, 4),
    ...drumBars(GALLOP, bar(36), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......', snare: 'X.......X.......' }, bar(44)),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......', snare: 'X.......X.......' }, bar(45)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X', tomLo: 'X' }, bar(46)),
  ];
}

const CODA = 'C#3^5!:8 G#2^5! | C#3^5!:8 G#2^5! | C#3^5!:16 | .:16';

export const moonlight: SongDef = {
  id: 'moonlight',
  name: 'Moonlight Sonata',
  artist: 'Ludwig van Beethoven',
  album: 'Piano Sonata No. 14, Op. 27 No. 2',
  genre: 'Classical Metal',
  year: '1801',
  composer: 'Ludwig van Beethoven',
  loadingPhrase: 'It opens quietly, by moonlight. Then comes the storm.',
  tempo: [
    { beat: 0, bpm: 56 },
    { beat: bar(4), bpm: 132 },
  ],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Adagio' },
    { beat: bar(4), name: 'Presto Agitato' },
    { beat: bar(20), name: 'Second Theme' },
    { beat: bar(28), name: 'The Storm Returns' },
    { beat: bar(36), name: 'Second Theme, Doubled' },
    { beat: bar(44), name: 'Coda' },
  ],
  player: [
    { inst: 'piano', gain: 1.2, verb: 0.45, notes: comp(ADAGIO_H, 4, bar(0), 'xxxxxxxxxxxx', (c) => nearVoicing(c, 'G#3'), { arp: [0, 1, 2], step: 1 / 3, v: 0.6 }) },
    { inst: 'lead', tone: 0.6, gain: 1, verb: 0.25, echo: 0.1, notes: [...storm(PRESTO_H, 4), ...storm(PRESTO_H, 12), ...seq(THEME, bar(20)), ...storm(PRESTO_H, 28), ...seq(THEME, bar(36), { transpose: 12, v: 0.9 })] },
    { inst: 'drive', tone: 0.55, gain: 1, verb: 0.08, notes: [...hits(PRESTO_H, 4), ...hits(PRESTO_H, 12), ...hits(PRESTO_H, 28), ...seq(CODA, bar(44))] },
  ],
  backing: [
    { inst: 'piano', gain: 0.8, pan: -0.15, verb: 0.45, notes: comp(ADAGIO_H, 4, bar(0), 'x---------------', (c) => [bassOf(c, 'C#2'), bassOf(c, 'C#2') + 12], { v: 0.6 }) },
    { inst: 'strings', gain: 0.8, pan: -0.25, verb: 0.45, notes: [...comp(PRESTO_H, 8, bar(4), 'x-------------------------------', (c) => voicing(c, 'G#3'), { v: 0.5 }), ...comp(PRESTO_H, 8, bar(12), 'x-------------------------------', (c) => voicing(c, 'G#3'), { v: 0.55 }), ...comp(THEME_H, 4, bar(20), 'x---------------', (c) => voicing(c, 'G#3'), { v: 0.55 }), ...comp(THEME_H, 4, bar(36), 'x---------------', (c) => voicing(c, 'G#3'), { v: 0.55 }), ...comp(PRESTO_H, 8, bar(28), 'x-------------------------------', (c) => voicing(c, 'G#3'), { v: 0.55 })] },
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.05, notes: [...comp(THEME_H, 4, bar(20), 'm.m.x.m.m.m.x.m.', (c) => powerOf(c, 'E2'), { v: 0.7 }), ...comp(THEME_H, 4, bar(36), 'm.m.x.m.m.m.x.m.', (c) => powerOf(c, 'E2'), { v: 0.7 })] },
    { inst: 'lead', tone: 0.5, gain: 0.55, pan: 0.35, verb: 0.3, notes: diatonic(seq(THEME, bar(36), { transpose: 12, v: 0.65 }), G_SHARP_MINOR, -2) },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...comp(PRESTO_H, 8, bar(4), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'C#1')]), ...comp(PRESTO_H, 8, bar(12), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'C#1')]), ...comp(THEME_H, 4, bar(20), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'C#1')]), ...comp(PRESTO_H, 8, bar(28), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'C#1')]), ...comp(THEME_H, 4, bar(36), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'C#1')]), ...seq('C#2:8 G#1 | C#2:8 G#1 | C#2:16', bar(44))] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[bar(28), bar(36)]],
  lengthBeats: bar(48),
  previewBeat: bar(4),
  art: { from: '#03040c', to: '#2c3e66', ink: '#f4f1d0', motif: 'orbit' },
};
