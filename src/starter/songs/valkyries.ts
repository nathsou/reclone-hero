import { bassOf, comp, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { diatonic, grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Wagner, Ride of the Valkyries (Die Walküre, 1856; public domain), as symphonic metal in its own
// 9/8: the horn call on lead guitar over galloping triplet chugs, strings and choir.
const BAR = 4.5; // nine eighth notes
const bar = (n: number) => n * BAR;
const B_MINOR = [11, 1, 2, 4, 6, 7, 9];

// Sixteenth-note units: eighteen to the bar.
const THEME = [
  'F#4:1 B4:2 F#4:1 B4:2 D5:6 B4:6',
  'B4:1 D5:2 B4:1 D5:2 F#5:6 D5:6',
  'D5:1 F#5:2 D5:1 F#5:2 A5:6 A4:6',
  'A4:1 D5:2 A4:1 D5:2 F#5:12',
  'A4:1 C#5:2 A4:1 C#5:2 E5:6 C#5:6',
  'C#5:1 E5:2 C#5:1 E5:2 A5:6 E5:6',
  'E5:1 G5:2 E5:1 G5:2 B5:6 B4:6',
  'B4:1 E5:2 B4:1 E5:2 G5:6 F#5:6',
].join(' ');
const THEME_H = prog('Bm Bm D D A A Em F#');
const RIDE_H = prog('Bm G Em F# Bm G C#m F#');

/** triplet chugs: three eighths to each dotted-quarter beat */
const chugs = (h: string[], from: number, v = 0.75) => comp(h, BAR, bar(from), 'x.x.x.', (c) => powerOf(c, 'E2'), { v });
const pads = (h: string[], from: number, low = 'F#3') => comp(h, BAR, bar(from), 'x-----------------', (c) => voicing(c, low), { v: 0.6 });
const bass = (h: string[], from: number) => comp(h, BAR, bar(from), 'x.x.x.', (c) => [bassOf(c, 'B1')], { v: 0.8 });
const METAL = { kick: 'x.x.x.x.x.x.x.x.x.', snare: '......X.....X.....', ride: 'x.....x.....x.....' };

// Bar map: intro 0, theme 4, theme with choir 12, ride 20, theme 28, theme 36, coda 44, end 48.
function drums(): Hit[] {
  return [
    ...drumBars({ tomLo: 'x.....x.....x.....', kick: 'x.................' }, bar(0), 3, { beats: BAR }),
    ...drumBars({ snare: 'x.x.x.xxxxxxXXXXXX' }, bar(3), 1, { beats: BAR }),
    ...drumBars(METAL, bar(4), 8, { beats: BAR, crash: true }),
    ...drumBars(METAL, bar(12), 8, { beats: BAR, crash: true }),
    ...drumBars({ ...METAL, snare: '...X.....X.....X..' }, bar(20), 8, { beats: BAR, crash: true }),
    ...drumBars(METAL, bar(28), 8, { beats: BAR, crash: true }),
    ...drumBars(METAL, bar(36), 8, { beats: BAR, crash: true }),
    ...grid({ crash: 'X.................', kick: 'X.................' }, bar(44)),
    ...grid({ crash: 'X.................', kick: 'X.................' }, bar(45)),
    ...grid({ crash: 'X.................', kick: 'X.................' }, bar(46)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X', tomLo: 'X' }, bar(47)),
  ];
}

export const valkyries: SongDef = {
  id: 'valkyries',
  name: 'Ride of the Valkyries',
  artist: 'Richard Wagner',
  album: 'Die Walküre',
  genre: 'Symphonic Metal',
  year: '1856',
  composer: 'Richard Wagner',
  loadingPhrase: 'Nine eighths to the bar: feel it in threes and hang on.',
  tempo: [{ beat: 0, bpm: 132 }],
  timeSigs: [{ beat: 0, num: 9, den: 8 }],
  sections: [
    { beat: bar(0), name: 'Gathering Storm' },
    { beat: bar(4), name: 'The Ride' },
    { beat: bar(12), name: 'Battle Cry' },
    { beat: bar(20), name: 'Gallop' },
    { beat: bar(28), name: 'The Ride Again' },
    { beat: bar(44), name: 'Valhalla' },
  ],
  player: [
    { inst: 'drive', tone: 0.55, gain: 1, verb: 0.08, notes: [...chugs(prog('Bm Bm Bm Bm'), 0), ...chugs(RIDE_H, 20), ...seq('B2^5!:18 G2^5!:18 F#2^5!:18 B2^5!:18', bar(44))] },
    { inst: 'lead', tone: 0.65, gain: 1, verb: 0.25, echo: 0.1, notes: [...seq(THEME + ' ' + THEME, bar(4)), ...seq(THEME + ' ' + THEME, bar(28), { v: 0.9 })] },
  ],
  backing: [
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.05, notes: [...chugs([...THEME_H, ...THEME_H], 4, 0.65), ...chugs([...THEME_H, ...THEME_H], 28, 0.65)] },
    { inst: 'strings', gain: 0.9, pan: -0.25, verb: 0.45, notes: [...comp(prog('Bm Bm Bm Bm'), BAR, bar(0), 'xxxxxxxxxxxxxxxxxx', (c) => voicing(c, 'B3'), { v: 0.4 }), ...pads([...THEME_H, ...THEME_H], 4), ...pads([...THEME_H, ...THEME_H], 28), ...pads(prog('Bm G F# Bm'), 44)] },
    { inst: 'choir', tone: 0.35, gain: 0.8, pan: 0.2, verb: 0.5, notes: [...pads(THEME_H, 12, 'B3'), ...pads(RIDE_H, 20, 'B3'), ...pads(THEME_H, 36, 'B3')] },
    { inst: 'lead', tone: 0.5, gain: 0.55, pan: 0.35, verb: 0.3, notes: diatonic(seq(THEME, bar(36), { v: 0.7 }), B_MINOR, -2) },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...bass(prog('Bm Bm Bm Bm'), 0), ...bass([...THEME_H, ...THEME_H, ...RIDE_H, ...THEME_H, ...THEME_H], 4), ...seq('B1:18 G1 F#1 B1', bar(44))] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [],
  lengthBeats: bar(48),
  previewBeat: bar(4),
  art: { from: '#120708', to: '#7a2e1d', ink: '#ffd9b3', motif: 'shards' },
};
