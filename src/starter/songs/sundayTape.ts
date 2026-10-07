import { perform } from '../performance.ts';
import { bassOf, comp, nearVoicing, prog } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { diatonic, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Lo-fi neo-soul in D, 80 BPM with lazy, swung sixteenths: chord stabs with little pentatonic fills,
// a melody with double stops, and a solo on electric piano while the guitar comps.
const H = prog('Gmaj7 F#m7 Em7 A7 Gmaj7 F#m7 Bm7 A7');
const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];
const bar = (n: number) => n * 4;

const FILLS = ['F#4:1 A4 B4 D5 B4:2', 'E5:1 D5 B4 A4 B4:2', 'A4:1 B4 D5 E5 F#5:2', 'E5/2:2 D5:1 B4 A4:2'];
const MELODY = [
  'F#5:4 E5:2 D5:2 B4:4 .:2 A4:1 B4',
  'C#5:6 A4:2 E5:4 C#5:4',
  'D5:4 B4:2 G4:2 F#4:4 E4:2 F#4:2',
  'G4:3 A4:1 C#5:4 E5:4 G5:4',
  'F#5/2:8 E5:2 D5:2 E5:4',
  'C#5:4 A4:4 .:4 E4:2 F#4:2',
  'A4:2 B4:2 D5:4 F#5:4 E5:2 D5:2',
  'C#5:8 .:4 A4:2 C#5:2',
].join(' ');

/** Lazy swing: the second and fourth sixteenth of each beat come a little late. */
function swing<T extends { b: number; d?: number }>(items: T[]): T[] {
  return items.map((x) => {
    const f = x.b - Math.floor(x.b);
    return Math.abs(f - 0.25) < 1e-6 || Math.abs(f - 0.75) < 1e-6 ? { ...x, b: x.b + 0.07 } : x;
  });
}
/** Stabs on the chords, with a fill every other bar. */
function comping(at: number, fills: boolean): Note[] {
  const stabs = comp(H, 4, at, 'x..x..x.........', (c) => nearVoicing(c, 'E4'), { v: 0.6 });
  const fill = fills ? FILLS.flatMap((f, i) => seq(f, at + bar(2 * i + 1) + 2.5, { v: 0.7 })) : comp(H, 4, at, '..........x..x..', (c) => nearVoicing(c, 'E4'), { v: 0.5 });
  return swing([...stabs, ...fill]);
}
const doubleStops = (notes: Note[]): Note[] => notes.map((n) => (n.d >= 0.5 ? { ...n, p: [...diatonic([n], D_MAJOR, -2)[0].p, ...n.p] } : n));
const rhodes = (at: number, v: number) => swing(comp(H, 4, at, 'x-----x---x-----', (c) => nearVoicing(c, 'A3'), { v }));
const bass = (at: number) => swing(comp(H, 4, at, 'x.....x...x...x.', (c) => [bassOf(c, 'E1'), bassOf(c, 'E1') + 12, bassOf(c, 'E1') + 7, bassOf(c, 'E1')], { arp: [0, 0, 2, 1], v: 0.75 }));

// Bar map: intro 0, groove 4, melody 12, keys solo 20, melody up 28, last chord 36, end 38.
const [INTRO, GROOVE, MEL, KEYS, MEL2, LAST, END] = [0, 4, 12, 20, 28, 36, 38].map(bar);

const BOOM_BAP = { kick: 'x......x..x.....', snare: '....X..g....X...', hat: 'x.xgx.xgx.xgx.xg' };
function drums(): Hit[] {
  const out = [
    ...drumBars({ shaker: 'x.xxx.xxx.xxx.xx', rim: '....x.......x...' }, INTRO, 4),
    ...drumBars(BOOM_BAP, GROOVE, 8, { crash: true }),
    ...drumBars({ ...BOOM_BAP, ohat: '......x.......x.' }, MEL, 8),
    ...drumBars({ ...BOOM_BAP, hat: '', ride: 'x.xxx.xxx.xxx.xx' }, KEYS, 8, { crash: true }),
    ...drumBars({ ...BOOM_BAP, shaker: 'xxxxxxxxxxxxxxxx' }, MEL2, 8, { crash: true }),
    { b: LAST, k: 'crash' as const, v: 0.6 },
    { b: LAST, k: 'kick' as const, v: 0.8 },
  ];
  return swing(out).map((h) => ({ ...h, v: h.v * 0.85 }));
}

export const sundayTape: SongDef = perform({
  id: 'sunday-tape',
  name: 'Sunday Tape',
  artist: 'Mellow Static',
  album: 'Side B',
  genre: 'Lo-fi Neo-Soul',
  year: '2026',
  loadingPhrase: 'Lean back. Every other sixteenth arrives fashionably late.',
  tempo: [{ beat: 0, bpm: 80 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: INTRO, name: 'Tape Hiss' },
    { beat: GROOVE, name: 'Groove' },
    { beat: MEL, name: 'Melody' },
    { beat: KEYS, name: 'Keys Solo' },
    { beat: MEL2, name: 'Melody, Double Stops' },
    { beat: LAST, name: 'Fade' },
  ],
  player: [
    {
      inst: 'clean',
      gain: 1.25,
      chorus: 0.1,
      tone: 0.3,
      verb: 0.22,
      echo: 0.06,
      notes: [
        ...swing(comp(prog('Gmaj7 F#m7 Em7 A7'), 4, INTRO, 'x---------------', (c) => nearVoicing(c, 'E4'), { v: 0.5 })),
        ...comping(GROOVE, true),
        ...swing(seq(MELODY, MEL)),
        ...swing(doubleStops(seq(MELODY, MEL2, { v: 0.75 }))),
        ...seq('G3+B3+D4+F#4+A4!:8', LAST),
      ],
    },
    { inst: 'epiano', gain: 1.15, verb: 0.22, notes: swing(seq(MELODY, KEYS, { v: 0.7 })) },
  ],
  backing: [
    { inst: 'clean', gain: 0.9, pan: 0.15, verb: 0.18, notes: comping(KEYS, false) },
    { inst: 'epiano', gain: 0.85, pan: -0.2, verb: 0.22, notes: [...rhodes(GROOVE, 0.4), ...rhodes(MEL, 0.45), ...rhodes(KEYS, 0.35), ...rhodes(MEL2, 0.45), ...seq('G2+D3+F#3+B3:8', LAST, { v: 0.5 })] },
        { inst: 'pickbass', tone: 0.25, gain: 0.85, verb: 0, notes: [...bass(GROOVE), ...bass(MEL), ...bass(KEYS), ...bass(MEL2), { b: LAST, d: 6, p: [31], v: 0.75 }] },
    { inst: 'pad', tone: 0.2, gain: 0.7, verb: 0.3, notes: comp(H, 4, MEL2, 'x---------------', (c) => nearVoicing(c, 'D4'), { v: 0.4 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.7, verb: 0.12 }],
  solos: [[KEYS, MEL2]],
  lengthBeats: END,
  previewBeat: MEL,
  art: { from: '#2b1d2f', to: '#f2a7a0', ink: '#fff8ef', motif: 'wave' },
}, { bar: 4, phrase: 16, shape: [0.83, 0.97, 0.8], gate: 0.82, accent: 0.055 });
