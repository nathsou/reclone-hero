import { drumBars, PUNK, ROCK, ROCK_DRIVE, ROCK_RIDE } from '../patterns.ts';
import { diatonic, grid, seq, transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Beethoven, "Ode to Joy" (Symphony No. 9, 1824; public domain) as upbeat pop-punk in D major,
// with a twin-guitar harmony and a lift to E major for the last verse. The gentlest song of the set:
// quarter-note melodies, open power chords.
const bar = (n: number) => n * 4;
const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];

const A1 = 'F#4:4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4:6 E4:2 E4:8';
const A2 = 'F#4:4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4:6 D4:2 D4:8';
const B = 'E4:4 E4 F#4 D4 | E4:4 F#4:2 G4 F#4:4 D4 | E4:4 F#4:2 G4 F#4:4 E4 | D4:4 E4 A3:8';
const MELODY = `${A1} ${A2} ${B} ${A2}`;
/** Chords, one per half bar, for the 16-bar melody. */
const CHORDS = [
  ...['D', 'D', 'A', 'A', 'D', 'D', 'D', 'A'],
  ...['D', 'D', 'A', 'A', 'D', 'D', 'A', 'D'],
  ...['A', 'D', 'A', 'D', 'A', 'A', 'D', 'A'],
  ...['D', 'D', 'A', 'A', 'D', 'D', 'A', 'D'],
];

const SOLO = [
  'F#4:2 E4 F#4 G4 A4 B4 A4 G4',
  'A4:2 B4 A4 G4 F#4 G4 F#4 E4',
  'D4:2 F#4 A4 F#4 E4 F#4 G4 A4',
  'F#4:4 E4:2 D4 E4:8',
  'F#4:2 A4 D5 A4 G4 B4 D5 B4',
  'A4:2 C#5 E5 C#5 B4 A4 G4 E4',
  'D4:2 E4 F#4 A4 D5 C#5 B4 A4',
  'E4:4 D4:2 C#4 D4:8',
].join(' ');
const SOLO_CHORDS = ['D', 'D', 'A', 'A', 'D', 'D', 'D', 'A', 'D', 'G', 'A', 'A', 'D', 'D', 'A', 'D'];

const POWER: Record<string, string> = { D: 'D3^5', A: 'A2^5', G: 'G2^5', E: 'E2^5', B: 'B2^5' };
const ROOT: Record<string, string> = { D: 'D2', A: 'A1', G: 'G1', E: 'E2', B: 'B1' };

/** Eighth-note power chords on a list of half-bar chords. */
function rhythm(from: number, chords: string[], shift = 0): Note[] {
  return transpose(
    chords.flatMap((c, i) => seq(`(${POWER[c]}:2)x4`, bar(from) + i * 2, { v: 0.72 })),
    shift,
  );
}
function bass(from: number, chords: string[], shift = 0): Note[] {
  return transpose(
    chords.flatMap((c, i) => seq(`(${ROOT[c]}:2)x4`, bar(from) + i * 2, { v: 0.8 })),
    shift,
  );
}

const INTRO = 'D3^5!:16 A2^5:16 D3^5:16 A2^5!:8 A2^5:2 A2^5 B2^5 C#3^5';
const INTRO_BASS = 'D2:16 A1 D2 A1:8 A1:2 A1 B1 C#2';
const BREAK = '(D3^5:2)x7 D3^5!:2 (A2^5:2)x7 A2^5!:2 (G2^5:2)x7 G2^5!:2 A2^5:4 B2^5 C#3^5 E3^5';
const BREAK_BASS = '(D2:2)x8 (A1:2)x8 (G1:2)x8 A1:4 B1 C#2 E2';
const OUTRO = 'E3^5!:8 B2^5:8 C#3^5:8 A2^5:8 E3^5!:16 .:16';
const OUTRO_BASS = 'E2:8 B1 C#2 A1 E2:16';

function drums(): Hit[] {
  return [
    ...drumBars({ kick: 'x.......x.......', crash: 'x...............', snare: '............x...' }, bar(0), 3),
    ...drumBars(ROCK, bar(3), 1, { fill: 'toms2' }),
    ...drumBars(ROCK, bar(4), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK, bar(12), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_DRIVE, bar(20), 4, { crash: true, fill: 'build4' }),
    ...drumBars(PUNK, bar(24), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(PUNK, bar(32), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(ROCK_RIDE, bar(40), 8, { crash: true, fill: 'roll2' }),
    ...drumBars(PUNK, bar(48), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(PUNK, bar(56), 8, { crash: true, fill: 'toms2' }),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......', snare: '....X.......X...' }, bar(64)),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......', snare: '....X.......X...' }, bar(65)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(66)),
  ];
}

export const odeToJoy: SongDef = {
  id: 'ode-to-joy',
  name: 'Ode to Joy',
  artist: 'Ludwig van Beethoven',
  album: 'Symphony No. 9',
  genre: 'Classical Punk',
  year: '1824',
  composer: 'Ludwig van Beethoven',
  loadingPhrase: 'A good first song: steady quarter notes, and you already know the tune.',
  tempo: [{ beat: 0, bpm: 150 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Intro' },
    { beat: bar(4), name: 'Theme' },
    { beat: bar(20), name: 'Break' },
    { beat: bar(24), name: 'Twin Guitars' },
    { beat: bar(40), name: 'Variation' },
    { beat: bar(48), name: 'Key Change' },
    { beat: bar(64), name: 'Outro' },
  ],
  player: [
    { inst: 'drive', tone: 0.5, gain: 1, verb: 0.08, notes: [...seq(INTRO, bar(0)), ...seq(BREAK, bar(20)), ...seq(OUTRO, bar(64))] },
    {
      inst: 'lead',
      tone: 0.55,
      gain: 1,
      verb: 0.22,
      echo: 0.12,
      notes: [...seq(MELODY, bar(4)), ...seq(MELODY, bar(24), { transpose: 12 }), ...seq(SOLO, bar(40), { transpose: 12 }), ...seq(MELODY, bar(48), { transpose: 14, v: 0.9 })],
    },
  ],
  backing: [
    {
      inst: 'drive',
      tone: 0.4,
      gain: 0.55,
      verb: 0.05,
      notes: [...rhythm(4, CHORDS), ...rhythm(24, CHORDS), ...rhythm(40, SOLO_CHORDS), ...rhythm(48, CHORDS, 2)],
    },
    // the twin: a diatonic third under the melody
    { inst: 'lead', tone: 0.45, gain: 0.6, pan: 0.35, verb: 0.2, notes: diatonic(seq(MELODY, bar(24), { transpose: 12, v: 0.7 }), D_MAJOR, -2) },
    {
      inst: 'pickbass',
      gain: 1,
      verb: 0,
      notes: [
        ...seq(INTRO_BASS, bar(0)),
        ...bass(4, CHORDS),
        ...seq(BREAK_BASS, bar(20)),
        ...bass(24, CHORDS),
        ...bass(40, SOLO_CHORDS),
        ...bass(48, CHORDS, 2),
        ...seq(OUTRO_BASS, bar(64)),
      ],
    },
    { inst: 'organ', gain: 0.7, pan: -0.25, verb: 0.3, notes: transpose(diatonic(seq(MELODY, bar(48), { v: 0.55 }), D_MAJOR, -2), 2) },
  ],
  drums: [{ kit: 'rock', hits: drums() }],
  solos: [[bar(40), bar(48)]],
  lengthBeats: bar(68),
  previewBeat: bar(24),
  art: { from: '#0d2a4a', to: '#f5b82e', ink: '#fff6d8', motif: 'rings' },
};
