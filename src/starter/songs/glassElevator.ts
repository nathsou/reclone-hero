import { drumBars } from '../patterns.ts';
import { grid, loop, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Funk in E, 104 BPM: a scratchy sixteenth-note rhythm part on an E9, a unison riff with the bass
// in the chorus, horn stabs and a clean-toned solo.
const bar = (n: number) => n * 4;
const E9 = 'E3+G#3+D4+F#4';
const A9 = 'A2+C#3+G3+B3';

const SCRATCH = `${E9}!:1 ${E9}* . ${E9}* ${E9} . ${E9}* ${E9}* . ${E9}* ${E9}!:1 ${E9}* . ${E9}* ${E9}:2`;
const SCRATCH_B = `${E9}!:1 ${E9}* . ${E9}* ${E9} . ${E9}* ${E9}* ${E9}*:1 ${E9}* ${E9}* ${E9}* D3+F#3+C4+E4!:2 D#3+G3+C#4+F4!:2`;
const VERSE = `${SCRATCH} ${SCRATCH_B}`;
const RIFF = [
  'E3:1 . E3 G3 . A3 . B3:1 D4:2 B3:1 A3 G3:2 E3:2',
  'A3:1 . A3 C#4 . E4 . G4:1 F#4:2 E4:1 C#4 A3:2 .:2',
].join(' ');
const PRE = `${A9}!:2 .:2 ${A9}*:1 ${A9}* ${A9}:2 .:4 ${A9}!:4 | ${A9}!:2 .:2 ${A9}*:1 ${A9}* ${A9}:2 .:4 ${A9}!:4 | C3+E3+A#3+D4!:3 C3+E3+A#3+D4:5 B2+D#3+A3+C#4!:3 B2+D#3+A3+C#4:5 | B2+D#3+A3+C#4!:1 .:3 .:12`;
const SOLO = [
  'B4:2 D5:1 E5 G5:2 E5:1 D5 B4:2 A4:1 G4 E4:4',
  'G4:1 A4 B4 D5 E5:2 D5:1 B4 D5:2 B4:1 A4 G4:2 A4',
  'E5:1 E5 G5 E5 A5:2 G5:1 E5 D5:1 E5 D5 B4 A4:2 B4',
  'D5/2:4 B4:2 A4 G4:1 A4 G4 E4 G4:4',
  'E5:1 F#5 G5 A5 B5:2 A5:1 G5 F#5:2 E5 D5:1 E5 F#5:2',
  'B5/2:6 A5:1 G5 E5:2 D5 E5:4',
  '(E5:1 D5 B4 D5)x3 E5:4',
  'G5:1 E5 D5 B4 A4 G4 E4 D4 E4:8',
].join(' ');

const BASS_V = 'E1:2 E2:1 . E1 . D2 E2 . E1 G1 . A1 . B1:2';
const BASS_V2 = 'E1:2 E2:1 . E1 . D2 E2 . E1 G1 A1 D2:2 D#2';
const BASS_RIFF = RIFF.replace(/([A-G]#?)(\d)/g, (_, n: string, o: string) => `${n}${Number(o) - 2}`);
const BASS_PRE = 'A1:2 .:2 A2:1 .:3 A1:2 G1:2 A1:4 | A1:2 .:2 A2:1 .:3 A1:2 G1:2 A1:4 | C2:3 C2:5 B1:3 B1:5 | B1:1 .:15';
const HORNS = '.:2 D5+F#5+B5!:1 .:3 D5+F#5+B5:1 .:1 E5+G#5+D6!:2 .:6';
const CLAV = `(.:1 E4+G#4+D5*:1 .:2)x4`;

// Bar map: intro 0, verse 4, pre 12, chorus 16, verse 24, chorus 32, solo 40, chorus 48, outro 56.
const V = [bar(4), bar(24)];
const C = [bar(16), bar(32), bar(48)];

const FUNK = { kick: 'x..x..x...x..x..', snare: '....X..g.g..X..g', hat: 'xxxxxxxxxxxxxxox' };
const FUNK_OPEN = { kick: 'x..x..x...x..x..', snare: '....X..g.g..X...', ohat: 'x.x.x.x.x.x.x.x.' };
function drums(): Hit[] {
  return [
    ...drumBars({ hat: 'xxxxxxxxxxxxxxxx' }, bar(0), 4, { fill: 'snare1' }),
    ...drumBars(FUNK, V[0], 8, { crash: true, fill: 'snare1' }),
    ...drumBars(FUNK, bar(12), 4, { fill: 'build4' }),
    ...drumBars(FUNK_OPEN, C[0], 8, { crash: true, fill: 'toms1' }),
    ...drumBars(FUNK, V[1], 8, { crash: true, fill: 'build4' }),
    ...drumBars(FUNK_OPEN, C[1], 8, { crash: true, fill: 'snare1' }),
    ...drumBars({ ...FUNK, hat: '', ride: 'x.x.x.x.x.x.x.x.' }, bar(40), 8, { crash: true, fill: 'build4' }),
    ...drumBars(FUNK_OPEN, C[2], 8, { crash: true, fill: 'toms2' }),
    ...drumBars(FUNK, bar(56), 1, { crash: true }),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(57)),
  ];
}

export const glassElevator: SongDef = {
  id: 'glass-elevator',
  name: 'Glass Elevator',
  artist: 'The Velvet Switch',
  album: 'Floor Seven',
  genre: 'Funk',
  year: '2026',
  loadingPhrase: 'Funk lives in the gaps: the muted scratches are as important as the chords.',
  tempo: [{ beat: 0, bpm: 104 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Intro' },
    { beat: V[0], name: 'Verse 1' },
    { beat: bar(12), name: 'Pre-Chorus' },
    { beat: C[0], name: 'Chorus' },
    { beat: V[1], name: 'Verse 2' },
    { beat: C[1], name: 'Chorus 2' },
    { beat: bar(40), name: 'Guitar Solo' },
    { beat: C[2], name: 'Last Chorus' },
    { beat: bar(56), name: 'Outro' },
  ],
  player: [
    {
      inst: 'clean',
      gain: 1.1,
      verb: 0.12,
      notes: [
        ...loop(seq(VERSE), 2, bar(2), bar(0)),
        ...loop(seq(VERSE), 4, bar(2), V[0]),
        ...seq(PRE, bar(12)),
        ...C.flatMap((c) => loop(seq(RIFF), 4, bar(2), c)),
        ...loop(seq(VERSE), 4, bar(2), V[1]),
        ...seq(SOLO, bar(40)),
        ...seq(`${E9}!:2 .:2 ${E9}*:1 ${E9}* ${E9}!:2 .:8 E2+B2+E3+G#3+D4+F#4!:8`, bar(56)),
      ],
    },
  ],
  backing: [
    { inst: 'pickbass', tone: 0.6, gain: 1, verb: 0, notes: [...loop(seq(`${BASS_V} ${BASS_V2}`), 4, bar(2), V[0]), ...seq(BASS_PRE, bar(12)), ...C.flatMap((c) => loop(seq(BASS_RIFF), 4, bar(2), c)), ...loop(seq(`${BASS_V} ${BASS_V2}`), 4, bar(2), V[1]), ...loop(seq(`${BASS_V} ${BASS_V2}`), 4, bar(2), bar(40)), ...seq('E1:2 E2:1 . E1:4 .:8 E1:4', bar(56))] },
    { inst: 'brass', tone: 0.65, gain: 1, pan: 0.3, verb: 0.2, notes: [...C.flatMap((c) => loop(seq(HORNS), 8, bar(1), c)), ...seq('E4+G#4+D5+F#5!:4', bar(57))] },
    { inst: 'harpsichord', gain: 0.5, pan: -0.35, verb: 0.1, notes: [...loop(seq(CLAV), 8, bar(1), V[0]), ...loop(seq(CLAV), 8, bar(1), V[1]), ...loop(seq(CLAV), 8, bar(1), bar(40))] },
    { inst: 'organ', gain: 0.8, pan: 0.2, verb: 0.25, notes: [...C.flatMap((c) => loop(seq('E3+G#3+D4+F#4:16 A3+C#4+G4+B4:16'), 4, bar(2), c)), ...seq('E3+G#3+D4+F#4:32 C3+E3+A#3+D4:16 E3+G#3+D4+F#4:16', bar(40)), ...seq('E3+G#3+D4+F#4:32 A3+C#4+G4+B4:32', bar(44))] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[bar(40), bar(48)]],
  lengthBeats: bar(58),
  previewBeat: C[0],
  art: { from: '#1a0b2e', to: '#ff9f1c', ink: '#fff4e0', motif: 'bars' },
};
