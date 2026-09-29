import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { drumBars, SYNTHWAVE } from '../patterns.ts';
import { diatonic, grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Tchaikovsky, Swan Lake, the swan theme (1876; public domain), as dark synthwave in B minor: the
// oboe's melody on a supersaw, then on a guitar, with harp-like arpeggios in between.
const bar = (n: number) => n * 4;
const B_MINOR = [11, 1, 2, 4, 6, 7, 9];

const THEME = 'F#5:12 B4:1 C#5 D5 E5 | F#5:6 D5:2 F#5:6 D5:2 | F#5:6 B4:2 D5:2 B4 G4 D5 | B4:16 | E5:12 D5:1 C#5 B4 C#5 | D5:6 C#5:2 B4:6 A#4:2 | B4:6 F#4:2 G4:4 A#4 | B4:16';
const THEME_H = prog('Bm D G Bm Em Bm F#7 Bm');
const ARP_H = prog('Bm G Em F#7 Bm G Em F#7');

const harp = (h: string[], from: number, v = 0.7) => comp(h, 4, bar(from), 'xxxxxxxxxxxxxxxx', (c) => nearVoicing(c, 'F#4'), { arp: [0, 1, 2, 3, 4, 3, 2, 1], v });
const pads = (h: string[], from: number) => comp(h, 4, bar(from), 'x---------------', (c) => voicing(c, 'F#3'), { v: 0.6 });
const octBass = (h: string[], from: number) => comp(h, 4, bar(from), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'B1')]).map((n, i) => ({ ...n, p: [n.p[0] + (i % 2 ? 12 : 0)] }));

// Bar map: intro 0, theme 4, theme on guitar 12, arpeggios 20, theme 28, outro 36, end 40.
function drums(): Hit[] {
  const open = { ...SYNTHWAVE, ohat: '..x...x...x...x.', hat: '' };
  return [
    ...drumBars({ kick: 'x.......x.......', hat: '..x...x...x...x.' }, bar(4), 8, { fill: 'snare1' }),
    ...drumBars(SYNTHWAVE, bar(12), 8, { crash: true, fill: 'toms1' }),
    ...drumBars({ kick: 'x.......x.......', clap: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' }, bar(20), 8, { crash: true, fill: 'build4' }),
    ...drumBars(open, bar(28), 8, { crash: true, fill: 'toms1' }),
    ...drumBars({ kick: 'x...............' }, bar(36), 3),
    ...grid({ crash: 'X', kick: 'X' }, bar(39)),
  ];
}

export const swanLake: SongDef = {
  id: 'swan-lake',
  name: 'Swan Lake',
  artist: 'Pyotr Ilyich Tchaikovsky',
  album: 'Swan Lake, Op. 20',
  genre: 'Classical Synthwave',
  year: '1876',
  composer: 'Pyotr Ilyich Tchaikovsky',
  loadingPhrase: 'Hold the long notes all the way; the swan does not hurry.',
  tempo: [{ beat: 0, bpm: 100 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Lakeside' },
    { beat: bar(4), name: 'The Swan' },
    { beat: bar(12), name: 'Night Flight' },
    { beat: bar(20), name: 'Harp' },
    { beat: bar(28), name: 'The Swan Returns' },
    { beat: bar(36), name: 'Dawn' },
  ],
  player: [
    { inst: 'supersaw', tone: 0.45, gain: 1, verb: 0.35, echo: 0.3, notes: [...seq(THEME, bar(4), { v: 0.75 }), ...seq(THEME, bar(28), { v: 0.9 })] },
    { inst: 'lead', tone: 0.55, gain: 0.95, verb: 0.35, echo: 0.25, notes: seq(THEME, bar(12)) },
    { inst: 'pluck', tone: 0.55, gain: 1, verb: 0.3, echo: 0.3, notes: [...harp(ARP_H, 20), ...seq('B4+D5+F#5:16 G4+B4+D5 | F#4+A#4+C#5 B4+D5+F#5', bar(36))] },
  ],
  backing: [
    { inst: 'pluck', tone: 0.3, gain: 0.45, pan: 0.3, verb: 0.3, echo: 0.3, notes: [...harp(prog('Bm G Em F#7'), 0, 0.55), ...harp(THEME_H, 4, 0.5), ...harp([...THEME_H], 28, 0.5)] },
    { inst: 'pad', tone: 0.35, gain: 0.9, verb: 0.45, pump: 0.25, notes: [...pads(prog('Bm G Em F#7'), 0), ...pads([...THEME_H, ...THEME_H], 4), ...pads(ARP_H, 20), ...pads(THEME_H, 28), ...pads(prog('Bm G F# Bm'), 36)] },
    { inst: 'lead', tone: 0.45, gain: 0.55, pan: 0.35, verb: 0.35, notes: diatonic(seq(THEME, bar(28), { v: 0.65 }), B_MINOR, -2) },
    { inst: 'synthbass', tone: 0.4, gain: 1, verb: 0, notes: [...octBass([...THEME_H, ...THEME_H, ...ARP_H, ...THEME_H], 4), ...seq('B1:16 G1 F#1 B1', bar(36))] },
  ],
  drums: [{ kit: 'electro', hits: drums(), verb: 1.5 }],
  solos: [],
  lengthBeats: bar(40),
  previewBeat: bar(12),
  art: { from: '#05070f', to: '#4b5d8c', ink: '#eef3ff', motif: 'wave' },
};
