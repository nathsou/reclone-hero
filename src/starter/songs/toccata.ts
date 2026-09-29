import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { drumBars, GALLOP, ROCK_DRIVE } from '../patterns.ts';
import { grid, seq, transpose } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Bach, Toccata and Fugue in D minor, BWV 565 (early 1700s; public domain), as organ metal: the
// famous opening with the organ, the pedal-point flurries, then a fugue-style riff and a solo.
const bar = (n: number) => n * 4;

const OPENING = [
  'A5:1 G5 A5:14',
  'G5:1 F5 E5 D5 C#5:6 D5:6',
  'A4:1 G4 A4:14',
  'G4:1 F4 E4 D4 C#4:6 D4:6',
  'A3:1 G3 A3:14',
  'E3:2 F3 C#3:4 D3:8',
  'C#3:1 E3 G3 Bb3 C#4 E4 G4 Bb4 C#5:8',
  'D3:1 F3 A3 D4 F4 A4 D5 F5 A5:8',
].join(' ');
const FLURRY = 'A5:1 G5 A5 F5 A5 E5 A5 D5 A5 C#5 A5 D5 A5 E5 A5 F5 | A5:1 G5 A5 F5 A5 E5 A5 D5 C#5:4 D5';
const FLURRY_HI = 'D6:1 C#6 D6 A5 D6 G5 D6 F5 D6 E5 D6 F5 D6 G5 D6 A5 | D6:1 C#6 D6 Bb5 D6 A5 D6 G5 F5:4 E5';
const FLURRY_H = prog('A7 Dm A7 Dm');
/** Pedal-point riff: the chord's notes against a repeated low note. */
const FUGUE = [
  'D3:1 A2 F3 A2 D3 A2 F3 A2 E3 A2 F3 A2 D3 A2 C#3 A2',
  'G3:1 D3 Bb3 D3 G3 D3 Bb3 D3 A3 D3 Bb3 D3 G3 D3 F#3 D3',
  'A3:1 E3 C#4 E3 A3 E3 C#4 E3 G3 E3 A3 E3 E3 C#3 D3 E3',
  'F3:1 D3 A3 D3 F3 D3 A3 D3 E3 C#3 D3 E3 F3 E3 D3 C#3',
].join(' ');
const FUGUE_H = prog('Dm Gm A7 Dm');
const SOLO_H = prog('Dm Bb Gm A7 Dm Bb Gm A7');
const FINALE = 'A5:1 G5 A5:14 | G5:1 F5 E5 D5 C#5:6 D5:6';
const END = 'Bb2^5!:8 A2^5! | D3^5!:16 | .:16';

const sweeps = (h: string[], from: number) => comp(h, 4, bar(from), 'xxxxxxxxxxxxxxxx', (c) => nearVoicing(c, 'D5'), { arp: [0, 1, 2, 3, 4, 3, 2, 1], v: 0.8 });
const organ = (h: string[], from: number) => comp(h, 4, bar(from), 'x---------------', (c) => [bassOf(c, 'D2'), ...voicing(c, 'F3')], { v: 0.6 });

// Bar map: opening 0, flurries 8, fugue 12, fugue + flurries 20, solo 28, finale 36, end 38.
function drums(): Hit[] {
  const hit = (b: number) => grid({ crash: 'X', kick: 'X' }, b);
  return [
    ...hit(bar(0)),
    ...hit(bar(1) + 1),
    ...hit(bar(2)),
    ...hit(bar(3) + 1),
    ...hit(bar(4)),
    ...hit(bar(5) + 1),
    ...grid({ tomLo: 'x.x.x.x.xxxxXXXX', crash: '................' }, bar(6)),
    ...hit(bar(7)),
    ...drumBars({ kick: 'x.x.x.x.x.x.x.x.', ride: 'x...x...x...x...' }, bar(8), 4, { fill: 'build4' }),
    ...drumBars(GALLOP, bar(12), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_DRIVE, bar(20), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(GALLOP, bar(28), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......' }, bar(36)),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......' }, bar(37)),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......', snare: 'X.......X.......' }, bar(38)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(39)),
  ];
}

export const toccata: SongDef = {
  id: 'toccata',
  name: 'Toccata and Fugue in D minor',
  artist: 'Johann Sebastian Bach',
  album: 'BWV 565',
  genre: 'Classical Metal',
  year: '1704',
  composer: 'Johann Sebastian Bach',
  loadingPhrase: 'Three notes, a long silence, and every cathedral in Europe shakes.',
  tempo: [
    { beat: 0, bpm: 84 },
    { beat: bar(8), bpm: 120 },
  ],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Toccata' },
    { beat: bar(8), name: 'Flurries' },
    { beat: bar(12), name: 'Fugue' },
    { beat: bar(20), name: 'Counterpoint' },
    { beat: bar(28), name: 'Pedal Solo' },
    { beat: bar(36), name: 'Finale' },
  ],
  player: [
    { inst: 'lead', tone: 0.6, gain: 1, verb: 0.3, echo: 0.1, notes: [...seq(OPENING, bar(0)), ...seq(FLURRY + ' ' + FLURRY, bar(8), { transpose: -12 }), ...seq(FLURRY + ' ' + FLURRY_HI + ' ' + FLURRY + ' ' + FLURRY_HI, bar(20)), ...sweeps(SOLO_H, 28), ...seq(FINALE, bar(36))] },
    { inst: 'drive', tone: 0.55, gain: 1, verb: 0.08, notes: [...seq(FUGUE + ' ' + FUGUE, bar(12)), ...seq(END, bar(38))] },
  ],
  backing: [
    { inst: 'organ', gain: 1, pan: -0.1, verb: 0.5, notes: [...transpose(seq(OPENING, bar(0)), -12), ...organ([...FLURRY_H], 8), ...organ([...FUGUE_H, ...FUGUE_H], 12), ...organ([...FLURRY_H, ...FLURRY_H], 20), ...organ(SOLO_H, 28), ...organ(prog('Dm A7 Bb Dm'), 36)] },
    { inst: 'drive', tone: 0.35, gain: 0.5, verb: 0.05, notes: [...comp([...FLURRY_H, ...FLURRY_H], 4, bar(20), 'm.m.x.m.m.m.x.m.', (c) => [bassOf(c, 'D2'), bassOf(c, 'D2') + 7], { v: 0.7 }), ...comp(SOLO_H, 4, bar(28), 'm.m.x.m.m.m.x.m.', (c) => [bassOf(c, 'D2'), bassOf(c, 'D2') + 7], { v: 0.7 })] },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...comp(FLURRY_H, 4, bar(8), 'x-------x-------', (c) => [bassOf(c, 'D1')]), ...comp([...FUGUE_H, ...FUGUE_H, ...FLURRY_H, ...FLURRY_H, ...SOLO_H], 4, bar(12), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'D1')]), ...seq('A1:16 Bb1:8 A1 D2:16', bar(36))] },
    { inst: 'choir', tone: 0.3, gain: 0.7, verb: 0.5, notes: comp(prog('Dm A7 Bb Dm'), 4, bar(36), 'x---------------', (c) => voicing(c, 'A3'), { v: 0.6 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.85 }],
  solos: [[bar(28), bar(36)]],
  lengthBeats: bar(40),
  previewBeat: bar(12),
  art: { from: '#0b0a14', to: '#5b2a86', ink: '#f0e3ff', motif: 'crest' },
};
