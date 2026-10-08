import { perform } from '../performance.ts';
import { abc } from '../abc.ts';
import { bassOf, comp, nearVoicing, powerOf, prog } from '../arrange.ts';
import { drumBars, GALLOP, ROCK_DRIVE, ROCK_RIDE } from '../patterns.ts';
import { diatonic, grid } from '../score.ts';
import type { Hit, Note, SongDef, TempoPoint } from '../score.ts';

// Niccolò Paganini, Caprice No. 24 in A minor (1817; public domain), as neoclassical metal: the
// theme on a lone violin, then the band, the triplet variation as guitar sweeps, and the theme
// again in harmony over a galloping double kick. Theme and variation after the transcription in
// Lester Bailey's collection (via John Chambers' ABC mirror).
const THEME = abc(`
M:2/4
L:1/16
K:Am
|:A2>A2 AcBA | e2>E2 E^G^FE | A2>A2 AcBA | e4 E2 z2 :|
|:a2>a2 a_bag | f2>d2 dfed | g2>g2 gagf | e2>c2 cedc |
f2>B2 BdcB | e2>A2 AcBA | F2>^d2 Ee=dB | A4 A,2 z2 :|
`);
const SWEEPS = abc(`
M:2/4
L:1/8
K:Am
|:(3ecA (3cea | (3b^ge (3B^GE | (3Ace (3aec | e2 E z :|
|:(3ae^c (3AE^C | (3DEA (3dfa | (3gdB (3GDB, | (3CEG (3ceg |
(3fdB (3^GEd | (3cec (3AEC | (3DFA (3Ee^G | A2 A, z :|
`);
const A = prog('Am E Am E');
const B = prog('A7 Dm G7 C Bdim Am E7 Am');
/** One chord a bar (two beats), for the whole theme as played (AABB). */
const H = [...A, ...A, ...B, ...B];
const LEN = THEME.length; // 48 beats
const bar = (n: number) => n * 2;
const [INTRO, BAND, VAR, HARM, END] = [0, 1, 2, 3, 4].map((i) => i * LEN);
const A_HARMONIC = [9, 11, 0, 2, 4, 5, 8];

const at = (notes: Note[], from: number, shift = 0): Note[] => notes.map((n) => ({ ...n, b: n.b + from, p: n.p.map((p) => p + shift) }));
/** A third below in A harmonic minor; chromatic notes stay single. */
const thirds = (notes: Note[]): Note[] =>
  notes.map((n) => {
    const low = diatonic([n], A_HARMONIC, -2)[0].p[0];
    return low === n.p[0] ? n : { ...n, p: [low, n.p[0]] };
  });
const chugs = (from: number, rhythm: string) => comp(H, 2, from, rhythm, (c) => powerOf(c.replace(/7|dim/, ''), 'E2'), { v: 0.75 });
const bass = (from: number, rhythm: string) => comp(H, 2, from, rhythm, (c) => [bassOf(c, 'E1')], { v: 0.8 });

const tempo: TempoPoint[] = [
  { beat: INTRO, bpm: 112 },
  { beat: BAND, bpm: 128 },
  { beat: HARM, bpm: 136 },
];

function drums(): Hit[] {
  // 4/4 grooves over pairs of 2/4 bars
  return [
    ...drumBars(ROCK_DRIVE, BAND, 11, { crash: true }),
    ...drumBars(ROCK_DRIVE, BAND + 44, 1, { fill: 'roll2' }),
    ...drumBars(ROCK_RIDE, VAR, 11, { crash: true }),
    ...drumBars(ROCK_RIDE, VAR + 44, 1, { fill: 'build4' }),
    ...drumBars(GALLOP, HARM, 11, { crash: true }),
    ...drumBars(GALLOP, HARM + 44, 1, { fill: 'toms2' }),
    ...grid({ crash: 'X.......', kick: 'X.......', snare: 'X.......' }, END),
  ];
}

export const caprice24: SongDef = perform({
  id: 'caprice-24',
  name: 'Caprice No. 24',
  artist: 'Niccolò Paganini',
  album: '24 Caprices for Solo Violin, Op. 1',
  genre: 'Neoclassical Metal',
  year: '1817',
  composer: 'Niccolò Paganini',
  loadingPhrase: 'Paganini was said to have sold his soul for his technique. Sweep picking is cheaper.',
  tempo,
  timeSigs: [{ beat: 0, num: 2, den: 4 }],
  sections: [
    { beat: INTRO, name: 'Violin Solo' },
    { beat: BAND, name: 'Theme' },
    { beat: VAR, name: 'Sweeps' },
    { beat: VAR + bar(8), name: 'Sweeps, Round the Fifths' },
    { beat: HARM, name: 'Harmony' },
    { beat: END, name: 'Fine' },
  ],
  player: [
    { inst: 'fiddle', tone: 0.4, gain: 1, verb: 0.18, notes: at(THEME.notes, INTRO) },
    { inst: 'lead', tone: 0.6, gain: 1, verb: 0.2, echo: 0.08, notes: [...at(THEME.notes, BAND), ...at(SWEEPS.notes, VAR), ...thirds(at(THEME.notes, HARM))] },
    { inst: 'drive', tone: 0.55, gain: 0.9, verb: 0.1, notes: [{ b: END, d: 4, p: [45, 52, 57], v: 1 }] },
  ],
  backing: [
    { inst: 'strings', tone: 0.4, gain: 0.35, pan: -0.2, verb: 0.45, notes: comp(H, 2, INTRO, 'x-------', (c) => nearVoicing(c, 'C4'), { v: 0.35 }) },
    { inst: 'drive', tone: 0.45, gain: 0.55, verb: 0.05, notes: [...chugs(BAND, 'x.mmx.mm'), ...chugs(VAR, 'x-------'), ...chugs(HARM, 'xmmmxmmm')] },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...bass(BAND, 'x.x.x.x.'), ...bass(VAR, 'x...x...'), ...bass(HARM, 'xxxxxxxx'), { b: END, d: 4, p: [33], v: 0.9 }] },
    { inst: 'strings', tone: 0.5, gain: 0.5, pan: 0.3, verb: 0.4, notes: [...at(THEME.notes, HARM).map((n) => ({ ...n, v: 0.6 })), { b: END, d: 4, p: [57, 60, 64, 69], v: 0.7 }] },
    { inst: 'organ', tone: 0.4, gain: 0.65, pan: -0.3, verb: 0.4, notes: comp(H, 2, VAR, 'x-------', (c) => nearVoicing(c, 'A3'), { v: 0.5 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[VAR, HARM]],
  lengthBeats: END + 4,
  previewBeat: VAR,
  art: { from: '#1a0505', to: '#a31d1d', ink: '#ffe6c7', motif: 'shards' },
}, { bar: 2, phrase: 8, shape: [0.85, 1, 0.82], gate: 0.88, accent: 0.08 });
