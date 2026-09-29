import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Johann Strauss II, The Blue Danube (1866; public domain), as a shimmering electro waltz in D.
const BAR = 3;
const bar = (n: number) => n * BAR;

// Twelve sixteenths to the bar; each line is four bars.
const WALTZ = [
  'D4:4 D4 F#4 | A4:12 | .:4 A5 A5 | .:4 F#5 F#5',
  'D4:4 D4 F#4 | A4:12 | .:4 A5 A5 | .:4 G5 G5',
  'C#4:4 C#4 E4 | B4:12 | .:4 B5 B5 | .:4 G5 G5',
  'C#4:4 C#4 E4 | B4:12 | .:4 B5 B5 | .:4 F#5 F#5',
  'D4:4 D4 F#4 | A4:4 D5:8 | .:4 D5 D5 | .:4 A4 A4',
  'D4:4 D4 F#4 | A4:4 D5:8 | .:4 D5 D5 | .:4 B4 B4',
  'E4:4 E4 G4 | B4:12 | .:4 G#4 A4 | F#5:8 D5:4',
  'F#4:8 E4:4 | B4:8 A4:4 | D4:12 | .:12',
].join(' | ');
const WALTZ_H = prog('D D D D | D D A7 A7 | A7 A7 A7 A7 | A7 A7 D D | D D D D | D D G G | Em Em A7 D | D A7 D D');
const SECOND_H = prog('D D A7 A7 A7 A7 D D G G D D A7 A7 D D');
const CODA = 'D4:4 F#4 A4 | D5:12 | D5+F#5+A5:12 | D4+A4+D5:12';

const oomPahPah = (h: string[], from: number, v = 0.55) => comp(h, BAR, bar(from), '....x...x...', (c) => voicing(c, 'A3'), { v });
const bass = (h: string[], from: number) => comp(h, BAR, bar(from), 'x-----------', (c) => [bassOf(c, 'D2')], { v: 0.8 });
const arps = (h: string[], from: number, v = 0.72) => comp(h, BAR, bar(from), 'x.x.x.x.x.x.', (c) => nearVoicing(c, 'D5'), { arp: [0, 1, 2, 3, 2, 1], v });
const WALTZ_BEAT = { kick: 'x...........', clap: '....x...x...', hat: 'x.x.x.x.x.x.' };

// Bar map: intro 0, waltz 4, second waltz 36, waltz 52, coda 84, end 88.
function drums(): Hit[] {
  return [
    ...drumBars({ shaker: '....x...x...' }, bar(20), 16, { beats: BAR }),
    ...drumBars({ kick: 'x...........', hat: '....x...x...' }, bar(36), 16, { beats: BAR, crash: true }),
    ...drumBars(WALTZ_BEAT, bar(52), 16, { beats: BAR, crash: true }),
    ...drumBars({ ...WALTZ_BEAT, ohat: '..x...x...x.' }, bar(68), 16, { beats: BAR, crash: true }),
    ...grid({ crash: 'X', kick: 'X' }, bar(86)),
  ];
}

export const blueDanube: SongDef = {
  id: 'blue-danube',
  name: 'The Blue Danube',
  artist: 'Johann Strauss II',
  album: 'An der schönen blauen Donau, Op. 314',
  genre: 'Classical Electronic',
  year: '1866',
  composer: 'Johann Strauss II',
  loadingPhrase: 'Waltz time: a strong one, then two light ones.',
  tempo: [{ beat: 0, bpm: 168 }],
  timeSigs: [{ beat: 0, num: 3, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Dawn on the River' },
    { beat: bar(4), name: 'The Waltz' },
    { beat: bar(36), name: 'Second Waltz' },
    { beat: bar(52), name: 'The Waltz, Full Orchestra' },
    { beat: bar(84), name: 'Coda' },
  ],
  player: [
    { inst: 'piano', gain: 1.2, verb: 0.35, notes: seq(WALTZ, bar(4)) },
    { inst: 'pluck', tone: 0.55, gain: 1, verb: 0.25, echo: 0.25, notes: arps(SECOND_H, 36) },
    { inst: 'supersaw', tone: 0.5, gain: 1, verb: 0.3, echo: 0.2, notes: [...seq(WALTZ, bar(52), { v: 0.85 }), ...seq(CODA, bar(84))] },
  ],
  backing: [
    { inst: 'strings', gain: 0.8, pan: -0.2, verb: 0.5, notes: [...comp(prog('D A7 D D'), BAR, bar(0), 'xxxxxxxxxxxx', (c) => voicing(c, 'A3'), { v: 0.35 }), ...comp([...WALTZ_H], BAR, bar(52), 'x-----------', (c) => voicing(c, 'A3'), { v: 0.55 })] },
    { inst: 'pluck', tone: 0.3, gain: 0.45, pan: 0.3, verb: 0.3, echo: 0.3, notes: [...arps(prog('D A7 D D'), 0, 0.55), ...arps(WALTZ_H, 52, 0.5)] },
    { inst: 'piano', gain: 0.7, pan: -0.15, verb: 0.3, notes: [...oomPahPah(WALTZ_H, 4), ...oomPahPah(SECOND_H, 36)] },
    { inst: 'pad', tone: 0.4, gain: 0.8, verb: 0.4, pump: 0.3, notes: [...oomPahPah(WALTZ_H, 52, 0.6), ...comp(prog('D D D D'), BAR, bar(84), 'x-----------', (c) => voicing(c, 'A3'), { v: 0.6 })] },
    { inst: 'synthbass', tone: 0.35, gain: 0.8, verb: 0, notes: [...bass([...WALTZ_H, ...SECOND_H, ...WALTZ_H], 4), ...seq('D2:12 D2 D2 D2', bar(84))] },
  ],
  drums: [{ kit: 'electro', hits: drums(), gain: 0.8, verb: 1.3 }],
  solos: [],
  lengthBeats: bar(88),
  previewBeat: bar(52),
  art: { from: '#06142e', to: '#6fb3e0', ink: '#f2fbff', motif: 'wave' },
};
