import { perform } from '../performance.ts';
import { drumBars, HALF_TIME, ROCK, ROCK_DRIVE, ROCK_RIDE } from '../patterns.ts';
import { arp, chord, grid, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Pachelbel, Canon in D (c. 1700; public domain) as a rock instrumental. The ground bass loops
// D–A–Bm–F#m–G–D–G–A, one chord per half bar; each variation gets busier, from held notes to
// sixteenth-note runs.
const bar = (n: number) => n * 4;

const NAMES = ['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'];
const VOICING: Record<string, string> = { D: 'D4+F#4+A4', A: 'C#4+E4+A4', Bm: 'D4+F#4+B4', 'F#m': 'C#4+F#4+A4', G: 'D4+G4+B4' };
const TRIAD: Record<string, string> = { D: 'D4+F#4+A4', A: 'A3+C#4+E4', Bm: 'B3+D4+F#4', 'F#m': 'F#3+A3+C#4', G: 'G3+B3+D4' };
const POWER: Record<string, string> = { D: 'D3^5', A: 'A2^5', Bm: 'B2^5', 'F#m': 'F#2^5', G: 'G2^5' };
const ROOT: Record<string, string> = { D: 'D2', A: 'A1', Bm: 'B1', 'F#m': 'F#1', G: 'G1' };

/** Anything played once per chord of the ground, `cycles` times from bar `from`. */
function ground(from: number, cycles: number, per: (name: string) => string, v = 0.75): Note[] {
  const out: Note[] = [];
  for (let c = 0; c < cycles; c++) NAMES.forEach((n, i) => out.push(...seq(per(n), bar(from + c * 4) + i * 2, { v })));
  return out;
}

const V1 = 'F#5:8 E5 D5 C#5 B4 A4 B4 C#5';
const V2 = 'D5:8 C#5 B4 A4 G4 F#4 G4 E4';
const V3 = 'D4:4 F#4 A4 G4 | F#4 D4 F#4 E4 | D4 B3 D4 A4 | G4 B4 A4 G4';
const V4 = [
  'F#5:2 D5:1 E5 F#5:2 D5:1 E5 F#5 F#4 G4 A4 B4 C#5 D5 E5',
  'D5:2 B4:1 C#5 D5:2 D4:1 E4 F#4 G4 F#4 E4 F#4 D5 C#5 D5',
  'B4:2 D5:1 C#5 B4:2 A4:1 G4 A4 G4 F#4 G4 A4 B4 C#5 D5',
  'B4:2 D5:1 C#5 D5:2 C#5:1 B4 C#5 D5 E5 D5 C#5 D5 B4 C#5',
].join(' ');

/** Sweep-style sixteenth arpeggios over the ground, the second pass extending the pattern within the same register. */
function shred(from: number): Note[] {
  const chords = NAMES.map((n) => chord(TRIAD[n]));
  return [...arp(chords, [0, 1, 2, 3, 2, 1, 0, 1], 0.25, 8, bar(from), 0.8), ...arp(chords, [0, 1, 2, 3, 4, 3, 2, 1], 0.25, 8, bar(from + 4), 0.85)];
}

const RIFF = (n: string) => `${POWER[n]}:2 ${POWER[n]}*:1 ${POWER[n]}* ${POWER[n]}:2 ${POWER[n]}*:1 ${POWER[n]}*`;

function drums(): Hit[] {
  return [
    ...drumBars({ ride: 'x...x...x...x...' }, bar(4), 3),
    ...drumBars({ ride: 'x...x...x...x...' }, bar(7), 1, { fill: 'snare1' }),
    ...drumBars(HALF_TIME, bar(8), 4, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK, bar(12), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_RIDE, bar(16), 4, { crash: true, fill: 'toms2' }),
    ...drumBars(ROCK_DRIVE, bar(20), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_RIDE, bar(24), 4, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_DRIVE, bar(28), 4, { crash: true }),
    ...drumBars(ROCK_DRIVE, bar(32), 4, { crash: true, fill: 'roll2' }),
    ...drumBars(ROCK_RIDE, bar(36), 4, { crash: true, fill: 'build4' }),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(40)),
  ];
}

export const canon: SongDef = perform({
  id: 'canon',
  name: 'Canon in D',
  artist: 'Johann Pachelbel',
  album: 'Canon and Gigue',
  genre: 'Classical Rock',
  year: '1700',
  composer: 'Johann Pachelbel',
  loadingPhrase: 'Eight chords, over and over. Everything else is variation.',
  tempo: [{ beat: 0, bpm: 96 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Ground' },
    { beat: bar(4), name: 'Variation I' },
    { beat: bar(8), name: 'Variation II' },
    { beat: bar(12), name: 'Variation III' },
    { beat: bar(16), name: 'Variation IV' },
    { beat: bar(20), name: 'Riff' },
    { beat: bar(24), name: 'Variation IV reprise' },
    { beat: bar(28), name: 'Shred' },
    { beat: bar(36), name: 'Finale' },
  ],
  player: [
    { inst: 'clean', gain: 1, verb: 0.3, notes: ground(0, 1, (n) => `${TRIAD[n].split('+')[0]}:2 ${TRIAD[n].split('+')[1]} ${TRIAD[n].split('+')[2]} ${TRIAD[n].split('+')[1]}`, 0.7).map((x) => ({ ...x, p: [x.p[0] - 12] })) },
    {
      inst: 'lead',
      tone: 0.6,
      gain: 1,
      verb: 0.25,
      echo: 0.15,
      notes: [...seq(V1, bar(4)), ...seq(V2, bar(8)), ...seq(V3, bar(12)), ...seq(V4, bar(16)), ...seq(V4, bar(24), { v: 0.9 }), ...shred(28)],
    },
    { inst: 'drive', tone: 0.55, gain: 1, verb: 0.08, notes: [...ground(20, 1, RIFF), ...seq(V1, bar(36), { v: 0.9 }).map((x) => ({ ...x, p: [x.p[0] - 12, x.p[0]] })), ...seq('D3^5!:16 .:16', bar(40))] },
  ],
  backing: [
    { inst: 'strings', gain: 0.48, pan: -0.2, verb: 0.28, notes: [...ground(4, 5, (n) => `${VOICING[n]}:8`, 0.6), ...ground(24, 4, (n) => `${VOICING[n]}:8`, 0.6), ...seq('D4+F#4+A4:16', bar(40), { v: 0.6 })] },
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.05, notes: [...ground(12, 2, (n) => `(${POWER[n]}:2)x4`, 0.7), ...ground(24, 4, (n) => `(${POWER[n]}:2)x4`, 0.7)] },
    {
      inst: 'pickbass',
      gain: 1,
      verb: 0,
      notes: [...ground(0, 2, (n) => `${ROOT[n]}:8`), ...ground(8, 1, (n) => `${ROOT[n]}:4 ${ROOT[n]}`), ...ground(12, 7, (n) => `(${ROOT[n]}:2)x4`), ...seq('D2:16', bar(40))],
    },
    { inst: 'harpsichord', gain: 0.5, pan: 0.3, verb: 0.3, notes: ground(0, 1, (n) => `${VOICING[n]}:8`, 0.55) },
  ],
  drums: [{ kit: 'rock', hits: drums() }],
  solos: [[bar(28), bar(36)]],
  lengthBeats: bar(42),
  previewBeat: bar(16),
  art: { from: '#1a1026', to: '#b58a4c', ink: '#f7e7c4', motif: 'crest' },
}, { bar: 4, phrase: 16, shape: [0.8, 1, 0.84], gate: 0.92, accent: 0.05 });
