import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { drumBars, FOUR_FLOOR, HOUSE_OPEN } from '../patterns.ts';
import { grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Mozart, Eine kleine Nachtmusik, K. 525 (1787; public domain), first movement, as electro house in G.
// The opening is the hook; Alberti-bass arpeggios are the build-ups; the continuation is new.
const bar = (n: number) => n * 4;

const HOOK = 'G4:4 .:2 D4:2 G4:4 .:2 D4:2 | G4:2 D4 G4 B4 D5:8 | C5:4 .:2 A4:2 C5:4 .:2 A4:2 | C5:2 A4 F#4 A4 D4:8 | G4:4 .:2 D4:2 G4:4 .:2 D4:2 | G4:2 D4 G4 B4 D5:8 | C5:4 .:2 A4:2 C5:4 .:2 A4:2 | C5:2 A4 F#4 A4 G4:8';
const HOOK_H = prog('G G D7 D7 G G D7 G');
const MORE = 'B4:4 A4:2 G4 G4:4 F#4 | A4:4 C5:2 A4 F#4:4 D4 | B4:4 D5:2 B4 G4:4 B4 | A4:2 B4 C5 A4 G4:8 | E5:4 D5:2 C5 B4:4 A4 | D5:4 C5:2 B4 A4:4 G4 | F#4:2 G4 A4 B4 C5 A4 F#4 A4 | G4:16';
const MORE_H = prog('G D7 G D7 C G D7 G');
const OUTRO = 'G4:4 .:2 D4:2 G4:4 .:2 D4:2 | G4:2 D4 G4 B4 D5:8 | G5:16';

/** Alberti bass: low, high, middle, high, in sixteenths. */
const alberti = (h: string[], from: number, v = 0.72) => comp(h, 4, bar(from), 'xxxxxxxxxxxxxxxx', (c) => nearVoicing(c, 'G4'), { arp: [0, 2, 1, 2], v });
const pads = (h: string[], from: number) => comp(h, 4, bar(from), 'x---------------', (c) => voicing(c, 'G3'), { v: 0.6 });
const offBass = (h: string[], from: number) => comp(h, 4, bar(from), '..x...x...x...x.', (c) => [bassOf(c, 'D2')], { v: 0.8 });
const subs = (h: string[], from: number) => comp(h, 4, bar(from), 'x---------------', (c) => [bassOf(c, 'D1')], { v: 0.8 });

// Bar map: intro 0, build 8, drop 16, break 32, build 40, drop 48, outro 64, end 67.
function drums(): Hit[] {
  const kickHat = { kick: 'x...x...x...x...', hat: '..x...x...x...x.' };
  return [
    ...drumBars({ shaker: 'x.x.x.x.x.x.x.x.' }, bar(4), 4),
    ...drumBars(kickHat, bar(8), 4, { crash: true }),
    ...drumBars(FOUR_FLOOR, bar(12), 4, { fill: 'build4' }),
    ...drumBars(HOUSE_OPEN, bar(16), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(HOUSE_OPEN, bar(24), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X' }, bar(32)),
    ...drumBars({ rim: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' }, bar(36), 4),
    ...drumBars(kickHat, bar(40), 4, { crash: true }),
    ...drumBars(FOUR_FLOOR, bar(44), 4, { fill: 'build4' }),
    ...drumBars(HOUSE_OPEN, bar(48), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(HOUSE_OPEN, bar(56), 8, { crash: true, fill: 'roll2' }),
    ...drumBars(FOUR_FLOOR, bar(64), 2, { crash: true }),
    ...grid({ crash: 'X', kick: 'X' }, bar(66)),
  ];
}

export const nachtmusik: SongDef = {
  id: 'nachtmusik',
  name: 'Eine kleine Nachtmusik',
  artist: 'Wolfgang Amadeus Mozart',
  album: 'Serenade No. 13, K. 525',
  genre: 'Classical Electronic',
  year: '1787',
  composer: 'Wolfgang Amadeus Mozart',
  loadingPhrase: 'A little night music, played rather loudly.',
  tempo: [{ beat: 0, bpm: 128 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Allegro' },
    { beat: bar(8), name: 'Build-Up' },
    { beat: bar(16), name: 'Drop' },
    { beat: bar(32), name: 'Serenade' },
    { beat: bar(40), name: 'Build-Up 2' },
    { beat: bar(48), name: 'Drop 2' },
    { beat: bar(64), name: 'Outro' },
  ],
  player: [
    { inst: 'pluck', tone: 0.6, gain: 1, verb: 0.2, echo: 0.2, notes: [...seq(HOOK, bar(0)), ...alberti(HOOK_H, 8), ...alberti(MORE_H, 40), ...seq(OUTRO, bar(64))] },
    { inst: 'supersaw', tone: 0.55, gain: 1, verb: 0.25, echo: 0.15, notes: [...seq(HOOK + ' ' + MORE, bar(16)), ...seq(HOOK + ' ' + MORE, bar(48), { transpose: 12, v: 0.85 })] },
    { inst: 'bell', gain: 0.4, verb: 0.45, echo: 0.3, notes: seq(MORE, bar(32), { transpose: 12 }) },
  ],
  backing: [
    { inst: 'strings', gain: 0.8, pan: -0.2, verb: 0.45, notes: [...pads(HOOK_H, 0), ...pads(MORE_H, 32)] },
    { inst: 'pad', tone: 0.45, gain: 0.9, verb: 0.35, pump: 0.6, notes: [...pads(HOOK_H, 8), ...pads([...HOOK_H, ...MORE_H], 16), ...pads(MORE_H, 40), ...pads([...HOOK_H, ...MORE_H], 48)] },
    { inst: 'pluck', tone: 0.3, gain: 0.4, pan: 0.3, verb: 0.2, echo: 0.3, pump: 0.3, notes: [...alberti([...HOOK_H, ...MORE_H], 16, 0.55), ...alberti([...HOOK_H, ...MORE_H], 48, 0.55)] },
    { inst: 'synthbass', tone: 0.5, gain: 1, verb: 0, notes: [...comp(HOOK_H, 4, bar(8), 'x...x...x...x...', (c) => [bassOf(c, 'D2')]), ...offBass([...HOOK_H, ...MORE_H], 16), ...comp(MORE_H, 4, bar(40), 'x...x...x...x...', (c) => [bassOf(c, 'D2')]), ...offBass([...HOOK_H, ...MORE_H], 48)] },
    { inst: 'subbass', gain: 0.5, verb: 0, pump: 0.4, notes: [...subs([...HOOK_H, ...MORE_H], 16), ...subs(MORE_H, 32), ...subs([...HOOK_H, ...MORE_H], 48)] },
  ],
  drums: [{ kit: 'electro', hits: drums() }],
  solos: [],
  lengthBeats: bar(68),
  previewBeat: bar(16),
  art: { from: '#0c1a3a', to: '#d9b24c', ink: '#fff4d6', motif: 'orbit' },
};
