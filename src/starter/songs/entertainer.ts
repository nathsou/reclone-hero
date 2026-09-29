import { bassOf, comp, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Scott Joplin, The Entertainer (1902; public domain), as electro swing: the rag on piano, then on
// a plucked synth and a brassy supersaw, over stride piano and a four-on-the-floor shuffle.
const bar = (n: number) => n * 4;

const PICKUP = 'D5:1 D#5';
// Each bar here is two of Joplin's 2/4 bars.
const STRAIN = [
  'E5:1 C6:2 E5:1 C6:2 E5:1 C6:6 C6:1 D6 D#6',
  'E6:1 C6 D6 E6:2 B5:1 D6:2 C6:4 .:2 D5:1 D#5',
  'E5:1 C6:2 E5:1 C6:2 E5:1 C6:9',
  'A5:1 G5 F#5 A5 C6:2 E6 D6:1 C6 A5 D6:3 D5:1 D#5',
  'E5:1 C6:2 E5:1 C6:2 E5:1 C6:6 C6:1 D6 D#6',
  'E6:1 C6 D6 E6:2 B5:1 D6:2 C6:4 .:2 D5:1 D#5',
  'E5:1 C6:2 E5:1 C6:2 E5:1 C6:9',
  'E6:1 C6 D6 E6:2 B5:1 D6:2 C6:8',
].join(' ');
const STRAIN_H = prog('C C G7 C C C7 D7 G7 C C G7 C C C7 G7 C');
const SECOND = [
  'F5:1 A5:2 C6:1 A5:2 F5:2 C6:1 A5:2 F5:1 .:4',
  'E5:1 G5:2 C6:1 G5:2 E5:2 C6:1 G5:2 E5:1 .:4',
  'F5:1 A5:2 C6:1 A5:2 F5:2 D6:1 C6:2 A5:1 .:4',
  'G5:2 A5 A#5 B5 C6:4 .:4',
  'F5:1 A5:2 C6:1 A5:2 F5:2 C6:1 A5:2 F5:1 .:4',
  'E5:1 G5:2 C6:1 G5:2 E5:2 C6:1 G5:2 E5:1 .:4',
  'F5:1 A5:2 C6:1 F6:4 E6:2 D6 C6:4',
  'C6:2 G5 E5 C5:4 .:4 D5:1 D#5',
].join(' ');
const SECOND_H = prog('F F C7 C7 F Dm G7 C7 F F C7 C7 F Bb C C');
const CODA = 'E5:1 C6:2 E5:1 C6:2 E5:1 C6:6 C6:1 D6 D#6 | E6:1 C6 D6 E6:2 B5:1 D6:2 C6:8 | C5+E5+G5+C6!:4 .:4 C4+C5!:4 .:4';

/** stride: a bass note on the beat, a chord on the off-beat */
const strideBass = (h: string[], from: number) => comp(h, 2, bar(from), 'x.......', (c) => [bassOf(c, 'C2')], { v: 0.75 });
const strideChords = (h: string[], from: number) => comp(h, 2, bar(from), '....x...', (c) => voicing(c, 'E3'), { v: 0.55 });
const SWING = { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', clap: '....x.......x...' };

// Bar map: intro 0, rag 4, rag with band 12, second strain 20, rag 28, coda 36, end 39.
function drums(): Hit[] {
  return [
    ...drumBars({ hat: 'x.xxx.xxx.xxx.xx' }, bar(0), 4, { fill: 'snare1' }),
    ...drumBars({ kick: 'x...x...x...x...', hat: 'x.xxx.xxx.xxx.xx' }, bar(4), 8, { fill: 'snare1' }),
    ...drumBars(SWING, bar(12), 8, { crash: true, fill: 'snare1' }),
    ...drumBars({ ...SWING, ohat: '..x...x...x...x.' }, bar(20), 8, { crash: true, fill: 'build4' }),
    ...drumBars(SWING, bar(28), 8, { crash: true, fill: 'roll2' }),
    ...drumBars(SWING, bar(36), 2, { crash: true }),
    ...grid({ crash: 'X...X...', kick: 'X...X...' }, bar(38)),
  ];
}

export const entertainer: SongDef = {
  id: 'entertainer',
  name: 'The Entertainer',
  artist: 'Scott Joplin',
  album: 'A Rag Time Two Step',
  genre: 'Electro Swing',
  year: '1902',
  composer: 'Scott Joplin',
  loadingPhrase: 'Ragtime is syncopation: the tune lands just before the beat.',
  tempo: [{ beat: 0, bpm: 96 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Vamp' },
    { beat: bar(4), name: 'The Rag' },
    { beat: bar(12), name: 'The Rag, Full Band' },
    { beat: bar(20), name: 'Second Strain' },
    { beat: bar(28), name: 'Last Chorus' },
    { beat: bar(36), name: 'Tag' },
  ],
  player: [
    { inst: 'piano', gain: 1.2, verb: 0.3, notes: [...seq(PICKUP, bar(4) - 0.5), ...seq(STRAIN, bar(4))] },
    { inst: 'pluck', tone: 0.55, gain: 1, verb: 0.2, echo: 0.15, notes: [...seq(PICKUP, bar(12) - 0.5), ...seq(STRAIN, bar(12))] },
    { inst: 'supersaw', tone: 0.5, gain: 0.9, verb: 0.25, echo: 0.15, notes: [...seq(SECOND, bar(20)), ...seq(STRAIN, bar(28), { v: 0.9 }), ...seq(PICKUP, bar(36) - 0.5), ...seq(CODA, bar(36))] },
  ],
  backing: [
    { inst: 'piano', gain: 0.8, pan: -0.15, verb: 0.25, notes: [...strideBass([...prog('C C G7 G7 C C G7 G7'), ...STRAIN_H, ...STRAIN_H, ...SECOND_H, ...STRAIN_H], 0), ...strideChords([...prog('C C G7 G7 C C G7 G7'), ...STRAIN_H, ...STRAIN_H, ...SECOND_H, ...STRAIN_H], 0)] },
    { inst: 'synthbass', tone: 0.4, gain: 0.8, verb: 0, notes: comp([...STRAIN_H, ...SECOND_H, ...STRAIN_H, ...prog('C C C G7 C C')], 2, bar(12), 'x...x...', (c) => [bassOf(c, 'C1')], { v: 0.75 }) },
    { inst: 'strings', gain: 0.6, pan: 0.25, verb: 0.4, notes: comp(SECOND_H, 2, bar(20), 'x-------', (c) => voicing(c, 'A3'), { v: 0.5 }) },
  ],
  drums: [{ kit: 'electro', hits: drums(), gain: 0.8 }],
  solos: [],
  lengthBeats: bar(39),
  previewBeat: bar(12) - 0.5,
  art: { from: '#1a0f07', to: '#d4a13a', ink: '#fff3d6', motif: 'bars' },
};
