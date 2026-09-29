import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { drumBars, HALF_TIME } from '../patterns.ts';
import { diatonic, grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Chopin, Funeral March (Piano Sonata No. 2, 1839; public domain), as doom metal in B-flat minor:
// a clean-guitar prelude, the march as crushing palm-muted chords, then an ornamented lead, the
// trio's consolation, a solo, and the march once more with twin guitars.
const bar = (n: number) => n * 4;
const BB_MINOR = [10, 0, 1, 3, 5, 6, 8];

const MARCH = [
  'Bb3:4 Bb3:3 Bb3:1 Bb3:8',
  'Db4:3 C4:1 C4:3 Bb3:1 Bb3:3 A3:1 Bb3:4',
  'Bb3:4 Bb3:3 Bb3:1 Bb3:8',
  'Db4:3 C4:1 C4:3 Bb3:1 Bb3:3 A3:1 Bb3:4',
  'Db4:4 Db4:3 Db4:1 Db4:8',
  'F4:3 Eb4:1 Eb4:3 Db4:1 Db4:3 C4:1 Db4:4',
  'Bb3:4 Bb3:3 Bb3:1 Bb3:8',
  'Db4:3 C4:1 C4:3 Bb3:1 Bb3:3 A3:1 Bb3:4',
].join(' ');
const MARCH_H = prog('Bbm Bbm Bbm F7 Gb Db Bbm F7');

/** The march as power chords; the long notes become palm-muted chugs. */
const HEAVY_A = 'Bb2^5!:4 Bb2^5:3 Bb2^5:1 (Bb2^5*:2)x4';
const HEAVY_B = 'Db3^5:3 C3^5:1 C3^5:3 Bb2^5:1 Bb2^5:3 A2^5:1 Bb2^5:4';
const HEAVY_C = 'Db3^5!:4 Db3^5:3 Db3^5:1 (Db3^5*:2)x4';
const HEAVY_D = 'F3^5:3 Eb3^5:1 Eb3^5:3 Db3^5:1 Db3^5:3 C3^5:1 Db3^5:4';
const HEAVY = [HEAVY_A, HEAVY_B, HEAVY_A, HEAVY_B, HEAVY_C, HEAVY_D, HEAVY_A, HEAVY_B].join(' ');

/** The melody on lead guitar, with turns and runs filling its long notes. */
const LEAD = [
  'Bb4:4 Bb4:3 Bb4:1 Bb4:4 A4:1 Bb4 C5 Db5',
  'Db5:3 C5:1 C5:3 Bb4:1 Bb4:3 A4:1 Bb4:2 F4:1 Ab4',
  'Bb4:4 Bb4:3 Bb4:1 Bb4:2 Db5:1 F5 Bb5:4',
  'Db5:3 C5:1 C5:3 Bb4:1 Bb4:3 A4:1 Bb4:4',
  'Db5:4 Db5:3 Db5:1 Db5:4 Eb5:1 F5 Gb5 Ab5',
  'F5:3 Eb5:1 Eb5:3 Db5:1 Db5:3 C5:1 Db5:2 Bb4:1 Db5',
  'Bb4:4 Bb4:3 Bb4:1 Bb4:2 C5:1 Db5 F5 Eb5 Db5 C5',
  'Db5:3 C5:1 C5:3 Bb4:1 Bb4:3 A4:1 Bb4:4',
].join(' ');
const TRIO = 'F4:8 Eb4:4 Db4:4 | C4:12 Bb3:4 | Ab3:8 Bb3:4 C4:4 | Db4:16 | F4:8 Gb4:4 F4:4 | Eb4:12 Db4:4 | C4:8 Db4:4 Eb4:4 | Db4:16';
const TRIO_H = prog('Db Ab Ab Db Db Ab Ab7 Db');
const SOLO = [
  'Bb4:1 Db5 Eb5 F5 Ab5 F5 Eb5 Db5 Bb4:2 Db5 F5 Bb5',
  'A5/2:6 F5:2 Eb5:1 F5 Eb5 Db5 C5:4',
  'Bb4:1 C5 Db5 Eb5 F5 Gb5 F5 Eb5 Db5:2 F5 Bb5:4',
  'A5:2 C6 Eb6 C6 A5:4 F5:4',
  'Gb5:1 F5 Eb5 Db5 Gb5 F5 Eb5 Db5 Bb5/2:8',
  'Ab5:1 F5 Db5 F5 Ab5 F5 Db5 F5 Ab5:2 Bb5 C6 Db6',
  'Bb5:1 F5 Db5 Bb4 F5 Db5 Bb4 F4 Db5:2 C5 Bb4 A4',
  'Bb4:12 .:4',
].join(' ');
const SOLO_H = prog('Bbm F7 Bbm F7 Gb Db Bbm F7');
const INTRO_H = prog('Bbm Gb Bbm F7');
const CODA = 'Bb2^5!:16 | Gb2^5!:8 F2^5! | Bb2^5!:16 | .:16';

const DOOM = { kick: 'x.......x.x.....', snare: '........X.......', ride: 'x...x...x...x...' };
const pads = (h: string[], from: number, v = 0.5) => comp(h, 4, bar(from), 'x---------------', (c) => voicing(c, 'F3'), { v });
const roots = (h: string[], from: number) => comp(h, 4, bar(from), 'x-------x-------', (c) => [bassOf(c, 'D1')], { v: 0.8 });

// Bar map: prelude 0, march 4, procession 12, trio 20, solo 28, last march 36, coda 44, end 48.
function drums(): Hit[] {
  return [
    ...drumBars({ ride: '........x.......' }, bar(0), 3),
    ...grid({ ride: 'x...x...x...x...', tomLo: '........x.x.X.X.' }, bar(3)),
    ...drumBars(DOOM, bar(4), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(HALF_TIME, bar(12), 8, { crash: true, fill: 'toms2' }),
    ...drumBars({ ride: 'x...x...x...x...', kick: 'x.......x.......' }, bar(20), 8, { fill: 'build4' }),
    ...drumBars(HALF_TIME, bar(28), 8, { crash: true, fill: 'roll2' }),
    ...drumBars(DOOM, bar(36), 8, { crash: true, fill: 'toms2' }),
    ...grid({ crash: 'X', kick: 'X', tomLo: 'X' }, bar(44)),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......', tomLo: 'X.......X.......' }, bar(45)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X', tomLo: 'X' }, bar(46)),
  ];
}

export const funeralMarch: SongDef = {
  id: 'funeral-march',
  name: 'Funeral March',
  artist: 'Frédéric Chopin',
  album: 'Piano Sonata No. 2, Op. 35',
  genre: 'Classical Doom',
  year: '1839',
  composer: 'Frédéric Chopin',
  loadingPhrase: 'Slow and heavy: keep the chugs tight and let the long chords ring.',
  tempo: [{ beat: 0, bpm: 76 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Prelude' },
    { beat: bar(4), name: 'Marche Funèbre' },
    { beat: bar(12), name: 'Procession' },
    { beat: bar(20), name: 'Trio' },
    { beat: bar(28), name: 'Lament' },
    { beat: bar(36), name: 'The Last March' },
    { beat: bar(44), name: 'Requiem' },
  ],
  player: [
    {
      inst: 'clean',
      gain: 2.2,
      verb: 0.45,
      echo: 0.2,
      notes: [...comp(INTRO_H, 4, bar(0), 'x.x.x.x.x.x.x.x.', (c) => nearVoicing(c, 'F3'), { arp: [0, 1, 2, 3, 2, 1, 2, 1], v: 0.6 }), ...seq(TRIO, bar(20), { transpose: 12 })],
    },
    { inst: 'drive', tone: 0.45, gain: 1, verb: 0.12, notes: [...seq(HEAVY, bar(4)), ...seq(HEAVY, bar(36)), ...seq(CODA, bar(44))] },
    { inst: 'lead', tone: 0.55, gain: 1, verb: 0.35, echo: 0.2, notes: [...seq(LEAD, bar(12)), ...seq(SOLO, bar(28))] },
  ],
  backing: [
    { inst: 'strings', gain: 0.75, pan: 0.2, verb: 0.55, notes: [...pads(INTRO_H, 0, 0.4), ...pads([...MARCH_H, ...MARCH_H], 4), ...pads(TRIO_H, 20), ...pads(SOLO_H, 28), ...pads(MARCH_H, 36)] },
    { inst: 'drive', tone: 0.35, gain: 0.5, verb: 0.1, notes: [...seq(HEAVY, bar(12), { v: 0.7 }), ...comp(SOLO_H, 4, bar(28), 'x.......x.......', (c) => [bassOf(c, 'E2'), bassOf(c, 'E2') + 7], { v: 0.7 })] },
    { inst: 'lead', tone: 0.5, gain: 0.7, pan: -0.3, verb: 0.35, notes: seq(MARCH, bar(36), { transpose: 12, v: 0.7 }) },
    { inst: 'lead', tone: 0.45, gain: 0.55, pan: 0.35, verb: 0.35, notes: diatonic(seq(MARCH, bar(36), { transpose: 12, v: 0.65 }), BB_MINOR, -2) },
    { inst: 'choir', tone: 0.3, gain: 0.6, verb: 0.55, notes: [...pads(MARCH_H, 36), ...pads(prog('Bbm Gb Bbm'), 44)] },
    { inst: 'pickbass', gain: 1.3, verb: 0, notes: [...seq('Bb1:16 Gb1 Bb1 F1', bar(0), { v: 0.6 }), ...roots([...MARCH_H, ...MARCH_H], 4), ...roots(TRIO_H, 20), ...roots([...SOLO_H, ...MARCH_H], 28), ...seq('Bb1:16 Gb1:8 F1 Bb1:16', bar(44))] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 1.25, verb: 1.3 }],
  solos: [[bar(28), bar(36)]],
  lengthBeats: bar(48),
  previewBeat: bar(4),
  art: { from: '#050505', to: '#3b3b44', ink: '#d9d4c7', motif: 'crest' },
};
