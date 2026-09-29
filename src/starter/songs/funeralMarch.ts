import { bassOf, comp, prog, voicing } from '../arrange.ts';
import { drumBars, HALF_TIME } from '../patterns.ts';
import { diatonic, grid, seq, transpose } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Chopin, Funeral March (Piano Sonata No. 2, 1839; public domain), as doom metal in B-flat minor:
// the march as crushing power chords, then on lead guitar, with the trio's consolation on a clean
// guitar in between.
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
const TRIO = 'F4:8 Eb4:4 Db4:4 | C4:12 Bb3:4 | Ab3:8 Bb3:4 C4:4 | Db4:16 | F4:8 Gb4:4 F4:4 | Eb4:12 Db4:4 | C4:8 Db4:4 Eb4:4 | Db4:16';
const TRIO_H = prog('Db Ab Ab Db Db Ab Ab7 Db');
const CODA = 'Bb2^5!:16 | F2^5!:16 | Bb2^5!:16 | .:16';

/** the march as power chords: every melody note becomes a fifth an octave down */
const heavy = transpose(seq(MARCH, 0), -12).map((n) => ({ ...n, p: [n.p[0], n.p[0] + 7] }));
const at = (from: number) => heavy.map((n) => ({ ...n, b: n.b + bar(from) }));
const DOOM = { kick: 'x.......x.x.....', snare: '........X.......', ride: 'x...x...x...x...' };

// Bar map: tolls 0, march 4, march on lead 12, trio 20, march 28, coda 36, end 40.
function drums(): Hit[] {
  return [
    ...drumBars({ tomLo: 'x.......x.......' }, bar(0), 4),
    ...drumBars(DOOM, bar(4), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(HALF_TIME, bar(12), 8, { crash: true, fill: 'toms2' }),
    ...drumBars({ ride: 'x...x...x...x...', kick: 'x.......x.......' }, bar(20), 8, { fill: 'build4' }),
    ...drumBars(DOOM, bar(28), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X', kick: 'X', tomLo: 'X' }, bar(36)),
    ...grid({ crash: 'X', kick: 'X', tomLo: 'X' }, bar(37)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X', tomLo: 'X' }, bar(38)),
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
  loadingPhrase: 'Slow and heavy. Let every chord ring its full length.',
  tempo: [{ beat: 0, bpm: 72 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Tolling' },
    { beat: bar(4), name: 'Marche Funèbre' },
    { beat: bar(12), name: 'Procession' },
    { beat: bar(20), name: 'Trio' },
    { beat: bar(28), name: 'Return' },
    { beat: bar(36), name: 'Requiem' },
  ],
  player: [
    { inst: 'drive', tone: 0.45, gain: 1, verb: 0.12, notes: [...at(4), ...seq(CODA, bar(36))] },
    { inst: 'lead', tone: 0.55, gain: 1, verb: 0.35, echo: 0.2, notes: [...seq(MARCH, bar(12), { transpose: 12 }), ...seq(MARCH, bar(28), { transpose: 12, v: 0.9 })] },
    { inst: 'clean', gain: 2.5, verb: 0.45, echo: 0.2, notes: seq(TRIO, bar(20), { transpose: 12 }) },
  ],
  backing: [
    { inst: 'bell', gain: 0.5, verb: 0.6, notes: seq('(Bb2:8 F2:8)x4', bar(0), { v: 0.6 }) },
    { inst: 'organ', gain: 0.8, pan: -0.15, verb: 0.55, notes: [...comp(prog('Bbm Bbm Bbm Bbm'), 4, bar(0), 'x---------------', (c) => voicing(c, 'F3'), { v: 0.5 }), ...comp(MARCH_H, 4, bar(4), 'x---------------', (c) => voicing(c, 'F3'), { v: 0.55 }), ...comp(MARCH_H, 4, bar(12), 'x---------------', (c) => voicing(c, 'F3'), { v: 0.55 })] },
    { inst: 'drive', tone: 0.35, gain: 0.55, verb: 0.1, notes: [...at(12), ...at(28)] },
    { inst: 'strings', gain: 0.8, pan: 0.2, verb: 0.55, notes: [...comp(TRIO_H, 4, bar(20), 'x---------------', (c) => voicing(c, 'F3'), { v: 0.55 }), ...comp(MARCH_H, 4, bar(28), 'x---------------', (c) => voicing(c, 'F3'), { v: 0.55 })] },
    { inst: 'lead', tone: 0.45, gain: 0.55, pan: 0.35, verb: 0.35, notes: diatonic(seq(MARCH, bar(28), { transpose: 12, v: 0.65 }), BB_MINOR, -2) },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...comp([...MARCH_H, ...MARCH_H], 4, bar(4), 'x-------x-------', (c) => [bassOf(c, 'D1')]), ...comp(TRIO_H, 4, bar(20), 'x-------x-------', (c) => [bassOf(c, 'C1')]), ...comp(MARCH_H, 4, bar(28), 'x-------x-------', (c) => [bassOf(c, 'D1')]), ...seq('Bb1:16 F1 Bb1', bar(36))] },
    { inst: 'choir', tone: 0.3, gain: 0.7, verb: 0.55, notes: comp(prog('Bbm F Bbm'), 4, bar(36), 'x---------------', (c) => voicing(c, 'F3'), { v: 0.55 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.9, verb: 1.3 }],
  solos: [],
  lengthBeats: bar(40),
  previewBeat: bar(4),
  art: { from: '#050505', to: '#3b3b44', ink: '#d9d4c7', motif: 'crest' },
};

