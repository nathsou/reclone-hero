import { comp, nearVoicing, prog } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { grid, seq, transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// A twelve-bar blues shuffle in A, in 12/8 (80 dotted-quarter beats a minute): a boogie riff for
// the head, two choruses of solo with bends, and the old chromatic slide to finish. Riffs count in
// sixteenths: a triplet eighth is 2, a beat (dotted quarter) is 6, a bar is 24.
const BAR = 6; // quarter-note beats per 12/8 bar
const bar = (n: number) => n * BAR;
const H = prog('A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7');

/** The boogie: root with the fifth, sixth, flat seventh and sixth, long-short. */
const BOOGIE: Record<string, string> = {
  A7: 'A2+E3:4 A2+E3*:2 A2+F#3:4 A2+F#3*:2 A2+G3:4 A2+G3*:2 A2+F#3:4 A2+F#3*:2',
  D7: 'D3+A3:4 D3+A3*:2 D3+B3:4 D3+B3*:2 D3+C4:4 D3+C4*:2 D3+B3:4 D3+B3*:2',
  E7: 'E2+B2:4 E2+B2*:2 E2+C#3:4 E2+C#3*:2 E2+D3:4 E2+D3*:2 E2+C#3:4 E2+C#3*:2',
};
const TURN = 'A2+E3:4 A2+E3:2 C#3+A3:4 C3+A3:2 B2+A3:4 A#2+A3:2 A2+A3:6';
const STOP = 'E2+B2+D3+G#3!:6 .:6 E2+B2+D3+G#3:4 E2+B2+D3+G#3:2 .:6';
const HEAD = [...H.slice(0, 10).map((c) => BOOGIE[c]), TURN, STOP].join(' ');
const ENDING = [...H.slice(0, 10).map((c) => BOOGIE[c]), TURN, 'A#2+D3+G#3!:6 A2+C#3+G3+B3!:18'].join(' ');

const SOLO_1 = [
  'C5/1:4 A4:2 C5:4 A4:2 E5:6 D5:4 C5:2',
  'A4:12 .:6 G4:2 A4 C5',
  'D5/2:6 C5:4 A4:2 C5:4 A4:2 G4:4 E4:2',
  'G4:4 A4:2 G4:4 E4:2 D4:6 E4:6',
  'F#4:6 A4:4 C5:2 D5:6 C5:4 A4:2',
  'C5:4 D5:2 F5:4 D5:2 C5:6 A4:6',
  'E5/2:12 C5:4 A4:2 C5:6',
  'A4:6 .:6 C5:2 C#5 E5 G5:6',
  'B5/2:12 A5:4 G5:2 E5:6',
  'D5/2:6 C5:4 A4:2 F#4:6 A4:6',
  'A4:4 C5:2 C#5:4 E5:2 A5:6 G5:4 E5:2',
  'E5:4 D5:2 B4:4 G#4:2 B4:12',
];
const SOLO_2 = [
  'A5/2:12 A5:4 G5:2 E5:4 G5:2',
  '(A5:2 G5 E5)x2 (G5:2 E5 D5)x2',
  '(C6/1:2 A5 G5)x2 A5:12',
  'E5:4 G5:2 A5:4 C6:2 D6/2:12',
  'D6:6 C6:4 A5:2 F#5:6 D5:6',
  '(F5:2 D5 C5)x2 A4:4 C5:2 D5:6',
  'E5:4 G5:2 A5:4 C6:2 E6/2:12',
  '(E6:2 C6 A5)x2 (G5:2 E5 C5)x2',
  'B5/2:6 B5/2:6 B5/2:6 A5:4 G5:2',
  'A5:4 F#5:2 D5:4 C5:2 A4:6 C5:6',
  'A4:2 C5 C#5 E5 A5 C#6 E6:12',
  'D6:4 B5:2 G#5:4 E5:2 B4+E5+G#5!:12',
];

/** Walking bass, long-short, from each chord's root. */
const WALK = 'A1:4 C#2:2 E2:4 F#2:2 G2:4 F#2:2 E2:4 C#2:2';
const SHIFT: Record<string, number> = { A7: 0, D7: 5, E7: -5 };
const walk = (at: number, chords = H): Note[] => chords.flatMap((c, i) => transpose(seq(WALK, at + bar(i)), SHIFT[c]));
const organ = (at: number, v: number) => comp(H, BAR, at, 'x-----------------------', (c) => nearVoicing(c, 'C4'), { v });

// Bar map: intro 0 (the last four bars of the form), head 4, solo 16, solo 28, head and ending 40.
const HEAD1 = bar(4);
const S1 = bar(16);
const S2 = bar(28);
const LAST = bar(40);
const END = bar(52);

const SHUFFLE = { kick: 'x.....x.....', snare: '...x.....x..', ride: 'x.xx.xx.xx.x' };
const SHUFFLE_HAT = { kick: 'x.....x.....', snare: '...x.....x..', hat: 'x.xx.xx.xx.x' };
function drums(): Hit[] {
  const bars = (g: Record<string, string>, at: number, n: number, crash = false) => drumBars(g, at, n, { beats: BAR, step: 0.5, crash });
  return [
    ...bars({ hat: 'x.xx.xx.xx.x' }, 0, 3),
    ...grid({ snare: 'x.xx.xx.xXXX' }, bar(3), 0.5),
    ...bars(SHUFFLE_HAT, HEAD1, 12, true),
    ...bars(SHUFFLE, S1, 12, true),
    ...bars({ ...SHUFFLE, kick: 'x..x..x..x..' }, S2, 12, true),
    ...bars(SHUFFLE_HAT, LAST, 11, true),
    ...grid({ kick: 'X..X', snare: 'X..X', crash: '...X' }, LAST + bar(11), 0.5),
  ];
}

export const rustBelt: SongDef = {
  id: 'rust-belt-shuffle',
  name: 'Rust Belt Shuffle',
  artist: 'Delta Nine',
  album: 'Night Shift Blues',
  genre: 'Blues',
  year: '2026',
  loadingPhrase: 'Shuffle: long-short, long-short. Bends go up to the note, not past it.',
  tempo: [{ beat: 0, bpm: 120 }],
  timeSigs: [{ beat: 0, num: 12, den: 8 }],
  sections: [
    { beat: 0, name: 'Intro' },
    { beat: HEAD1, name: 'Head' },
    { beat: S1, name: 'Solo, First Chorus' },
    { beat: S2, name: 'Solo, Second Chorus' },
    { beat: LAST, name: 'Head Out' },
  ],
  player: [
    { inst: 'lead', tone: 0.5, gain: 1, verb: 0.3, echo: 0.05, notes: [...seq(SOLO_1.slice(8).join(' '), 0), ...seq(SOLO_1.join(' '), S1), ...seq(SOLO_2.join(' '), S2)] },
    { inst: 'drive', tone: 0.35, gain: 0.9, verb: 0.15, notes: [...seq(HEAD, HEAD1), ...seq(ENDING, LAST)] },
  ],
  backing: [
    { inst: 'organ', gain: 0.9, pan: -0.25, verb: 0.35, notes: [...comp(H.slice(8), BAR, 0, 'x-----------------------', (c) => nearVoicing(c, 'C4'), { v: 0.4 }), ...organ(HEAD1, 0.45), ...organ(S1, 0.5), ...organ(S2, 0.55), ...organ(LAST, 0.5).filter((n) => n.b < LAST + bar(11))] },
    { inst: 'drive', tone: 0.3, gain: 0.5, pan: 0.3, verb: 0.1, notes: [...seq(HEAD, S1), ...seq(HEAD, S2)] },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...walk(0, H.slice(8)), ...walk(HEAD1), ...walk(S1), ...walk(S2), ...walk(LAST, H.slice(0, 11)), ...seq('A#1:6 A1:18', LAST + bar(11))] },
    { inst: 'piano', gain: 1.4, pan: 0.2, verb: 0.3, notes: comp(H, BAR, S2, '....x.....x.....x.....x.', (c) => nearVoicing(c, 'E4'), { v: 0.45 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[S1, LAST]],
  lengthBeats: END + 2,
  previewBeat: S1,
  art: { from: '#0d1a2b', to: '#2f6fb3', ink: '#ffd98a', motif: 'bars' },
};
