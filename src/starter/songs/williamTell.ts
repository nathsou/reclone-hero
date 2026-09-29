import { bassOf, comp, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars, GALLOP, HALF_TIME, PUNK } from '../patterns.ts';
import { grid, seq, transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Rossini, William Tell Overture, finale (1829; public domain), as gallop punk in E: the famous
// da-da-DUM trumpet line, a second strain, a power-chord stampede, and a last lift up to F.
const bar = (n: number) => n * 4;

const FANFARE = 'B4:1 B4 B4:2 E5:4 B4:1 B4 B4:2 G#5:4 | B4:1 B4 B4:2 E5:2 G#5 B5:8';
const A = [
  'B4:1 B4 B4:2 B4:1 B4 B4:2 B4:1 B4 E5:2 F#5:2 G#5',
  'B4:1 B4 B4:2 B4:1 B4 B4:2 B4:1 B4 G#4:2 E4:2 G#4',
  'B4:1 B4 B4:2 B4:1 B4 B4:2 B4:1 B4 E5:2 F#5:2 G#5',
  'E5:1 G#5 F#5:2 D#5:1 F#5 B4:2 E5:4 .:4',
].join(' ');
const A_H = prog('E E E E E E B7 E');
const B = [
  'G#5:1 G#5 G#5:2 G#5:1 G#5 G#5:2 A5:2 G#5 F#5 E5',
  'F#5:1 F#5 F#5:2 F#5:1 F#5 F#5:2 G#5:2 F#5 E5 D#5',
  'E5:1 E5 E5:2 E5:1 E5 E5:2 F#5:2 E5 D#5 C#5',
  'B4:4 E5 B4 .:4',
].join(' ');
const B_H = prog('E A B7 B7 A C#m B7 E');
const STAMPEDE_H = prog('E E A A B B E E');
const CODA = 'E3^5!:4 B2^5! E3^5! B2^5! | E3^5!:4 B2^5! E3^5! B2^5! | E3^5!:2 E3^5 E3^5 E3^5 E3^5!:8 | E3^5!:16';

/** the gallop: sixteenth, sixteenth, eighth */
const gallop = (h: string[], from: number, pitches: (c: string) => number[], v = 0.75) => comp(h, 2, bar(from), 'xxx-', pitches, { v });
const up = (notes: Note[], s: number) => transpose(notes, s);

// Bar map: fanfare 0, A 4, B 12, stampede 20, A 28, breakdown 36, A in F 44, coda 52, end 56.
function drums(): Hit[] {
  return [
    ...grid({ crash: 'X...X...', kick: 'X...X...' }, bar(0)),
    ...grid({ snare: 'x.x.x.x.xxxxXXXX' }, bar(1)),
    ...drumBars({ kick: 'xxx.xxx.xxx.xxx.', hat: 'x.x.x.x.x.x.x.x.' }, bar(2), 2, { fill: 'snare1' }),
    ...drumBars(GALLOP, bar(4), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(PUNK, bar(12), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(GALLOP, bar(20), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(GALLOP, bar(28), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(HALF_TIME, bar(36), 7, { crash: true }),
    ...drumBars(HALF_TIME, bar(43), 1, { fill: 'build4' }),
    ...drumBars(GALLOP, bar(44), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X...X...X...X...', kick: 'X...X...X...X...', snare: 'X...X...X...X...' }, bar(52)),
    ...grid({ crash: 'X...X...X...X...', kick: 'X...X...X...X...', snare: 'X...X...X...X...' }, bar(53)),
    ...grid({ kick: 'X.X.X.X.X.......', snare: 'X.X.X.X.X.......' }, bar(54)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(55)),
  ];
}

export const williamTell: SongDef = {
  id: 'william-tell',
  name: 'William Tell Overture',
  artist: 'Gioachino Rossini',
  album: 'Guillaume Tell',
  genre: 'Classical Punk',
  year: '1829',
  composer: 'Gioachino Rossini',
  loadingPhrase: 'Sixteenth, sixteenth, eighth. Giddy up.',
  tempo: [{ beat: 0, bpm: 152 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Fanfare' },
    { beat: bar(4), name: 'Gallop' },
    { beat: bar(12), name: 'Second Strain' },
    { beat: bar(20), name: 'Stampede' },
    { beat: bar(28), name: 'Gallop Again' },
    { beat: bar(36), name: 'Second Strain, Half Time' },
    { beat: bar(44), name: 'Up a Step' },
    { beat: bar(52), name: 'Finale' },
  ],
  player: [
    { inst: 'lead', tone: 0.65, gain: 1, verb: 0.2, echo: 0.1, notes: [...seq(FANFARE, bar(0)), ...seq(A + ' ' + A, bar(4)), ...seq(B + ' ' + B, bar(12)), ...seq(A + ' ' + A, bar(28)), ...seq(B + ' ' + B, bar(36)), ...seq(A + ' ' + A, bar(44), { transpose: 1, v: 0.9 })] },
    { inst: 'drive', tone: 0.6, gain: 1, verb: 0.06, notes: [...gallop([...STAMPEDE_H, ...STAMPEDE_H], 20, (c) => powerOf(c, 'E2')), ...seq(CODA, bar(52), { transpose: 1 })] },
  ],
  backing: [
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.05, notes: [...gallop([...A_H, ...A_H], 4, (c) => powerOf(c, 'E2'), 0.65), ...gallop([...B_H, ...B_H], 12, (c) => powerOf(c, 'E2'), 0.65), ...gallop([...A_H, ...A_H], 28, (c) => powerOf(c, 'E2'), 0.65), ...up(gallop([...A_H, ...A_H], 44, (c) => powerOf(c, 'E2'), 0.7), 1)] },
    { inst: 'strings', gain: 0.8, pan: -0.25, verb: 0.4, notes: [...comp([...B_H, ...B_H], 2, bar(12), 'x-------', (c) => voicing(c, 'G#3'), { v: 0.6 }), ...comp([...B_H, ...B_H], 2, bar(36), 'x-------', (c) => voicing(c, 'G#3'), { v: 0.6 })] },
    {
      inst: 'pickbass',
      gain: 1,
      verb: 0,
      notes: [
        ...seq('E2:16 .:16', bar(0)),
        ...seq('(E1:1 E1 E1:2)x8', bar(2)),
        ...gallop([...A_H, ...A_H, ...B_H, ...B_H, ...STAMPEDE_H, ...STAMPEDE_H, ...A_H, ...A_H], 4, (c) => [bassOf(c, 'E1')]),
        ...comp([...B_H, ...B_H], 2, bar(36), 'x-------', (c) => [bassOf(c, 'E1')]),
        ...up(gallop([...A_H, ...A_H], 44, (c) => [bassOf(c, 'E1')]), 1),
        ...seq('F1:4 C2 F1 C2 | F1:4 C2 F1 C2 | F1:2 F1 F1 F1 F1:8 | F1:16', bar(52)),
      ],
    },
    { inst: 'organ', gain: 0.6, pan: 0.2, verb: 0.3, notes: comp([...STAMPEDE_H, ...STAMPEDE_H], 2, bar(20), 'x.x.x.x.', (c) => voicing(c, 'B3'), { v: 0.6 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.85 }],
  solos: [],
  lengthBeats: bar(56),
  previewBeat: bar(4),
  art: { from: '#1c1206', to: '#c98a1b', ink: '#fff0cc', motif: 'sun' },
};
