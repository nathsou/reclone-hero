import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { DNB, drumBars } from '../patterns.ts';
import { grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Mozart, Symphony No. 40 in G minor, K. 550 (1788; public domain), first movement, as drum & bass.
// The sighing theme rides a rolling break and a growling bass.
const bar = (n: number) => n * 4;

// Eight bars; the last one ends with the pickup into the next statement. The piano plays it first.
const THEME = [
  'D5:4 Eb5:2 D5 D5:4 Eb5:2 D5',
  'D5:4 Bb5:8 A5:2 G5',
  'G5:4 F5:2 Eb5 Eb5:4 D5:2 C5',
  'C5:8 .:4 D5:2 C5',
  'C5:4 D5:2 C5 C5:4 D5:2 C5',
  'C5:4 A5:8 G5:2 F#5',
  'F#5:4 Eb5:2 D5 D5:4 C5:2 Bb4',
  'Bb4:4 A4:4 .:4 Eb5:2 D5',
].join(' ');
const THEME_H = prog('Gm Gm Cm D7 D7 D7 Gm D7');
const BREAK_H = prog('Gm Cm D7 Gm Eb Cm D7 D7');
const END = 'D5:4 Eb5:2 D5 D5:4 Eb5:2 D5 | D5:4 Bb5:8 A5:2 G5 | G5:16 | .:16';

const pads = (h: string[], from: number, v = 0.6) => comp(h, 4, bar(from), 'x---------------', (c) => voicing(c, 'G3'), { v });
// reese bass: long notes that restrike with the break
const reese = (h: string[], from: number) => comp(h, 4, bar(from), 'x-------x.....x-', (c) => [bassOf(c, 'D1')], { v: 0.85 });
const arps = (h: string[], from: number, v = 0.75) => comp(h, 4, bar(from), 'xxxxxxxxxxxxxxxx', (c) => nearVoicing(c, 'D5'), { arp: [0, 1, 2, 3, 2, 1, 0, 1], v });

// Bar map: intro 0, theme 8, theme 16, break 24, drop 32 (two themes), break 48, drop 56, end 64.
function drums(): Hit[] {
  const roll = { kick: 'x.........x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', shaker: 'xxxxxxxxxxxxxxxx' };
  return [
    ...drumBars({ hat: 'x.x.x.x.x.x.x.x.' }, bar(4), 4, { fill: 'roll2' }),
    ...drumBars(DNB, bar(8), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(DNB, bar(16), 8, { crash: true, fill: 'roll2' }),
    ...drumBars({ kick: 'x...............', hat: '..x...x...x...x.' }, bar(24), 8, { fill: 'build4' }),
    ...drumBars(roll, bar(32), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(roll, bar(40), 8, { crash: true, fill: 'roll2' }),
    ...drumBars({ kick: 'x...............', hat: '..x...x...x...x.' }, bar(48), 8, { fill: 'build4' }),
    ...drumBars(roll, bar(56), 8, { crash: true, fill: 'roll2' }),
    ...drumBars(DNB, bar(64), 2, { crash: true }),
    ...grid({ crash: 'X', kick: 'X' }, bar(66)),
  ];
}

export const forty: SongDef = {
  id: 'forty',
  name: 'Symphony No. 40',
  artist: 'Wolfgang Amadeus Mozart',
  album: 'Symphony No. 40 in G minor, K. 550',
  genre: 'Classical Drum & Bass',
  year: '1788',
  composer: 'Wolfgang Amadeus Mozart',
  loadingPhrase: 'Two quick notes, one long one. Let the rest of the band run.',
  tempo: [{ beat: 0, bpm: 174 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Molto Allegro' },
    { beat: bar(8), name: 'Theme' },
    { beat: bar(24), name: 'Break' },
    { beat: bar(32), name: 'Drop' },
    { beat: bar(48), name: 'Break 2' },
    { beat: bar(56), name: 'Last Drop' },
    { beat: bar(64), name: 'Ending' },
  ],
  player: [
    {
      inst: 'supersaw',
      tone: 0.55,
      gain: 1,
      verb: 0.25,
      echo: 0.15,
      notes: [...seq(THEME + ' ' + THEME, bar(8)), ...seq(THEME + ' ' + THEME, bar(32), { transpose: 12, v: 0.85 }), ...seq(THEME, bar(56), { transpose: 12, v: 0.9 }), ...seq(END, bar(64), { transpose: 12 })],
    },
    { inst: 'pluck', tone: 0.6, gain: 1, verb: 0.2, echo: 0.25, notes: [...arps(BREAK_H, 24), ...arps(BREAK_H, 48)] },
  ],
  backing: [
    { inst: 'piano', gain: 0.9, pan: -0.15, verb: 0.4, notes: seq(THEME, bar(0), { v: 0.7 }) },
    { inst: 'strings', gain: 0.8, pan: -0.25, verb: 0.45, notes: [...pads(THEME_H, 0), ...pads([...THEME_H, ...THEME_H], 8), ...pads(BREAK_H, 24), ...pads(BREAK_H, 48)] },
    { inst: 'pad', tone: 0.4, gain: 0.8, verb: 0.3, pump: 0.35, notes: [...pads([...THEME_H, ...THEME_H], 32), ...pads(THEME_H, 56), ...seq('G3+Bb3+D4:32', bar(64), { v: 0.6 })] },
    { inst: 'synthbass', tone: 0.6, gain: 1, verb: 0, notes: [...reese([...THEME_H, ...THEME_H], 8), ...reese([...THEME_H, ...THEME_H], 32), ...reese(THEME_H, 56), ...seq('G1:32', bar(64))] },
    { inst: 'subbass', gain: 0.5, verb: 0, notes: [...comp([...BREAK_H], 4, bar(24), 'x---------------', (c) => [bassOf(c, 'D1')]), ...comp([...BREAK_H], 4, bar(48), 'x---------------', (c) => [bassOf(c, 'D1')])] },
  ],
  drums: [{ kit: 'electro', hits: drums() }],
  solos: [],
  lengthBeats: bar(68),
  previewBeat: bar(32) - 1,
  art: { from: '#0d0d1f', to: '#3a6ea5', ink: '#e8f1ff', motif: 'wave' },
};
