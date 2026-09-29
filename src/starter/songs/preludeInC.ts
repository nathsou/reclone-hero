import { drumBars, SYNTHWAVE } from '../patterns.ts';
import { chord, grid } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Bach, Prelude in C major, BWV 846 (Well-Tempered Clavier I, 1722; public domain), as synthwave.
// Every bar is one five-note chord broken the same way, so the player gets a whole song of
// hammer-on arpeggios over Bach's harmony, while the band slowly fills in underneath.
const bar = (n: number) => n * 4;

/** The prelude's chords, lowest note first, one per bar. */
const BARS = [
  'C4 E4 G4 C5 E5',
  'C4 D4 A4 D5 F5',
  'B3 D4 G4 D5 F5',
  'C4 E4 G4 C5 E5',
  'C4 E4 A4 E5 A5',
  'C4 D4 F#4 A4 D5',
  'B3 D4 G4 D5 G5',
  'B3 C4 E4 G4 C5',
  'A3 C4 E4 G4 C5',
  'D3 A3 D4 F#4 C5',
  'G3 B3 D4 G4 B4',
  'G3 Bb3 E4 G4 C#5',
  'F3 A3 D4 A4 D5',
  'F3 Ab3 D4 F4 B4',
  'E3 G3 C4 G4 C5',
  'E3 F3 A3 C4 F4',
  'D3 F3 A3 C4 F4',
  'G2 D3 G3 B3 F4',
  'C3 E3 G3 C4 E4',
  'C3 G3 Bb3 C4 E4',
  'F2 F3 A3 C4 E4',
  'F#2 C3 A3 C4 Eb4',
  'Ab2 F3 B3 C4 D4',
  'G2 F3 G3 B3 D4',
  'G2 E3 G3 C4 E4',
  'G2 D3 G3 C4 F4',
  'G2 D3 G3 B3 F4',
  'G2 Eb3 A3 C4 F#4',
  'G2 E3 G3 C4 G4',
  'G2 D3 G3 C4 F4',
  'G2 D3 G3 B3 F4',
  'C2 C3 G3 Bb3 E4',
].map((s) => chord(s.split(' ').join('+')));
const LAST = chord('C2+C3+E3+G3+C4');

/** Bach's figure: the five notes up, the top three again, twice a bar. */
function figure(from: number, bars: number[][], transpose = 0, v = 0.75): Note[] {
  const out: Note[] = [];
  const order = [0, 1, 2, 3, 4, 2, 3, 4];
  bars.forEach((c, i) => {
    for (let k = 0; k < 16; k++) out.push({ b: bar(from + i) + k * 0.25, d: 0.25, p: [c[order[k % 8]] + transpose], v: k % 8 === 0 ? v + 0.1 : v });
  });
  return out;
}

/** Bass in eighths, one or two octaves under the prelude's own bass note. */
const eighths = (from: number, bars: number[][]): Note[] =>
  bars.flatMap((c, i) => Array.from({ length: 8 }, (_, k) => ({ b: bar(from + i) + k * 0.5, d: 0.5, p: [c[0] >= 48 ? c[0] - 24 : c[0] - 12], v: 0.75 })));

const held = (from: number, bars: number[][], pick: (c: number[]) => number[], v = 0.6): Note[] => bars.map((c, i) => ({ b: bar(from + i), d: 4, p: pick(c), v }));

// Bar map: intro 0, prelude 4 (32 bars), last chord 36, reprise 38 (8 bars), end 46.
function drums(): Hit[] {
  return [
    ...drumBars({ hat: 'x.x.x.x.x.x.x.x.' }, bar(12), 4),
    ...drumBars(SYNTHWAVE, bar(16), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(SYNTHWAVE, bar(24), 8, { crash: true, fill: 'snare1' }),
    ...drumBars({ ...SYNTHWAVE, ohat: '..x...x...x...x.' }, bar(32), 4, { crash: true, fill: 'build4' }),
    ...grid({ crash: 'X', kick: 'X' }, bar(36)),
    ...drumBars({ ...SYNTHWAVE, ohat: '..x...x...x...x.' }, bar(38), 8, { crash: true, fill: 'toms1' }),
    ...grid({ crash: 'X', kick: 'X' }, bar(46)),
  ];
}

export const preludeInC: SongDef = {
  id: 'prelude-c',
  name: 'Prelude in C',
  artist: 'Johann Sebastian Bach',
  album: 'The Well-Tempered Clavier, Book I',
  genre: 'Classical Synthwave',
  year: '1722',
  composer: 'Johann Sebastian Bach',
  loadingPhrase: 'One pattern, thirty-five chords. Find the flow and ride it.',
  tempo: [{ beat: 0, bpm: 100 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Tuning Up' },
    { beat: bar(4), name: 'Prelude' },
    { beat: bar(16), name: 'Night Drive' },
    { beat: bar(28), name: 'Pedal Point' },
    { beat: bar(38), name: 'Reprise' },
  ],
  player: [
    {
      inst: 'pluck',
      tone: 0.6,
      gain: 1,
      verb: 0.25,
      echo: 0.25,
      notes: [...figure(4, BARS), { b: bar(36), d: 8, p: LAST, v: 0.8 }, ...figure(38, BARS.slice(0, 7), 12, 0.8), { b: bar(45), d: 4, p: LAST.map((p) => p + 12), v: 0.85 }],
    },
  ],
  backing: [
    { inst: 'pad', tone: 0.35, gain: 0.9, verb: 0.45, pump: 0.2, notes: [...held(0, [BARS[0], BARS[0], BARS[1], BARS[0]], (c) => c.slice(1)), ...held(4, BARS, (c) => c.slice(1)), { b: bar(36), d: 8, p: LAST.slice(1), v: 0.6 }, ...held(38, BARS.slice(0, 8), (c) => c.slice(1))] },
    { inst: 'synthbass', tone: 0.4, gain: 1, verb: 0, notes: [...eighths(12, BARS.slice(8)), ...eighths(38, BARS.slice(0, 8))] },
    { inst: 'bell', gain: 0.35, pan: 0.3, verb: 0.55, echo: 0.35, notes: held(16, BARS.slice(12), (c) => [c[4] + 12], 0.55).map((n) => ({ ...n, d: 2 })) },
    { inst: 'strings', gain: 0.7, pan: -0.3, verb: 0.5, notes: held(28, BARS.slice(24), (c) => [c[0] + 12, c[0] + 24], 0.55) },
  ],
  drums: [{ kit: 'electro', hits: drums(), verb: 1.4 }],
  solos: [],
  lengthBeats: bar(47),
  previewBeat: bar(16),
  art: { from: '#060b1f', to: '#2f7d8c', ink: '#dff9ff', motif: 'grid' },
};
