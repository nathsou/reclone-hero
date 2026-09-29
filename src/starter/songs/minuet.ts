import { bassOf, comp, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { diatonic, grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Minuet in G, BWV Anh. 114 (Christian Petzold, from the Anna Magdalena Bach notebook, 1725; public
// domain), as a bouncy chiptune waltz. Quarter and eighth notes only: a friendly first song.
const BAR = 3;
const bar = (n: number) => n * BAR;
const G_MAJOR = [7, 9, 11, 0, 2, 4, 6];

const A = 'D5:4 G4:2 A4 B4 C5 | D5:4 G4 G4 | E5:4 C5:2 D5 E5 F#5 | G5:4 G4 G4 | C5:4 D5:2 C5 B4 A4 | B4:4 C5:2 B4 A4 G4';
const PART_A = `${A} | F#4:4 G4:2 A4 B4 G4 | A4:12 | ${A} | A4:4 B4:2 A4 G4 F#4 | G4:12`;
const PART_A_H = prog('G G C G Am G D D G G C G Am G D G');
const PART_B = [
  'B5:4 G5:2 A5 B5 G5 | A5:4 D5:2 E5 F#5 D5 | G5:4 E5:2 F#5 G5 D5 | C#5:4 B4:2 C#5 A4:4',
  'A4:2 B4 C#5 D5 E5 F#5 | G5:4 F#5 E5 | F#5:4 A4 C#5 | D5:12',
  'D5:4 G4:2 F#4 G4:4 | E5:4 G4:2 F#4 G4:4 | D5:4 C5 B4 | A4:2 G4 F#4 G4 A4:4',
  'D4:2 E4 F#4 G4 A4 B4 | C5:4 B4 A4 | B4:2 D5 G4:4 F#4 | G4:12',
].join(' | ');
const PART_B_H = prog('G D Em A A Em A D G C G D D Am D G');

const oomPahPah = (h: string[], from: number, v = 0.6) => comp(h, BAR, bar(from), '....x...x...', (c) => voicing(c, 'B3'), { v });
const bass = (h: string[], from: number) => comp(h, BAR, bar(from), 'x-----------', (c) => [bassOf(c, 'G1')], { v: 0.8 });
const WALTZ = { kick: 'x...........', snare: '....x...x...', hat: 'x.x.x.x.x.x.' };

// Bar map: A 0, B 16, A 32 (with the band), B 48, end 64.
function drums(): Hit[] {
  return [
    ...drumBars({ hat: '....x...x...' }, bar(8), 8, { beats: BAR }),
    ...drumBars({ kick: 'x...........', hat: '....x...x...' }, bar(16), 16, { beats: BAR }),
    ...drumBars(WALTZ, bar(32), 16, { beats: BAR, crash: true }),
    ...drumBars({ ...WALTZ, ohat: '..x...x...x.' }, bar(48), 16, { beats: BAR, crash: true }),
    ...grid({ crash: 'X', kick: 'X' }, bar(64)),
  ];
}

export const minuet: SongDef = {
  id: 'minuet-in-g',
  name: 'Minuet in G',
  artist: 'Christian Petzold',
  album: 'Notebook for Anna Magdalena Bach',
  genre: 'Classical Chiptune',
  year: '1725',
  composer: 'Christian Petzold',
  loadingPhrase: 'One, two, three; one, two, three. Long attributed to Bach.',
  tempo: [{ beat: 0, bpm: 138 }],
  timeSigs: [{ beat: 0, num: 3, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Minuet' },
    { beat: bar(16), name: 'Second Strain' },
    { beat: bar(32), name: 'Minuet, Full Band' },
    { beat: bar(48), name: 'Second Strain, Full Band' },
  ],
  player: [{ inst: 'pluck', tone: 0.45, gain: 1.3, verb: 0.15, echo: 0.1, notes: [...seq(PART_A + ' | ' + PART_B, bar(0)), ...seq(PART_A + ' | ' + PART_B, bar(32), { v: 0.85 })] }],
  backing: [
    { inst: 'bell', gain: 0.3, pan: 0.3, verb: 0.4, notes: diatonic(seq(PART_A + ' | ' + PART_B, bar(32), { v: 0.5 }), G_MAJOR, -2) },
    { inst: 'piano', gain: 0.8, pan: -0.15, verb: 0.3, notes: [...oomPahPah([...PART_A_H, ...PART_B_H], 0), ...oomPahPah([...PART_A_H, ...PART_B_H], 32)] },
    { inst: 'synthbass', tone: 0.35, gain: 0.6, verb: 0, notes: [...bass([...PART_A_H, ...PART_B_H], 0), ...bass([...PART_A_H, ...PART_B_H], 32), ...seq('G1:12', bar(64))] },
    { inst: 'pad', tone: 0.3, gain: 0.6, verb: 0.4, notes: comp([...PART_A_H, ...PART_B_H], BAR, bar(32), 'x-----------', (c) => voicing(c, 'G3'), { v: 0.5 }) },
  ],
  drums: [{ kit: 'electro', hits: drums(), gain: 0.85 }],
  solos: [],
  lengthBeats: bar(65),
  previewBeat: bar(32),
  art: { from: '#0f2a1d', to: '#9be15d', ink: '#fbffe8', motif: 'rings' },
};
