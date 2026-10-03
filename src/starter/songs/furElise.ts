import { drumBars } from '../patterns.ts';
import { arp, chord, grid, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Beethoven, "Für Elise" (WoO 59, 1810; public domain) as melodic electro, kept in its 3/8 time
// with a rolling 6/8 groove. The electric piano states the theme, a synth pluck takes it with the
// band, then the C major episode, an arpeggio development, and a supersaw finale.
const BAR = 1.5; // beats in a 3/8 bar
const bar = (n: number) => n * BAR;

// Sixteenth-note units: six to the bar.
const PICKUP = 'E5:1 D#5';
const A_BODY = [
  'E5:1 D#5 E5 B4 D5 C5',
  'A4:2 .:1 C4:1 E4 A4',
  'B4:2 .:1 E4:1 G#4 B4',
  'C5:2 .:1 E4:1 E5 D#5',
  'E5:1 D#5 E5 B4 D5 C5',
  'A4:2 .:1 C4:1 E4 A4',
  'B4:2 .:1 E4:1 C5 B4',
].join(' ');
const END_1 = 'A4:2 .:2 E5:1 D#5';
const END_2 = 'A4:2 .:1 B4:1 C5 D5';
/** Theme twice (first and second endings): 16 bars starting on the downbeat after the pickup. */
const THEME = `${A_BODY} ${END_1} ${A_BODY} ${END_2}`;
const EPISODE = 'E5:3 G4:1 F5 E5 | D5:3 F4:1 E5 D5 | C5:3 E4:1 D5 C5 | B4:2 .:1 E4:1 E5 D#5';
/** Harmony of each theme bar; the episode's; the development's. */
const THEME_H = ['E', 'Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'E', 'Am', 'E', 'Am'];
const EPISODE_H = ['C', 'G', 'Am', 'E'];
const DEV_H = ['Am', 'Am', 'E', 'E', 'Am', 'Am', 'E', 'E', 'F', 'F', 'C', 'C', 'G', 'G', 'E', 'E', 'Am', 'Am', 'E', 'E', 'F', 'G', 'Am', 'E'];

const LH: Record<string, string> = { Am: 'A2:1 E3 A3 .:3', E: 'E2:1 E3 G#3 .:3', C: 'C3:1 G3 C4 .:3', G: 'G2:1 G3 B3 .:3', F: 'F2:1 C3 F3 .:3' };
const PAD: Record<string, string> = { Am: 'A3+C4+E4', E: 'G#3+B3+E4', C: 'G3+C4+E4', G: 'G3+B3+D4', F: 'A3+C4+F4' };
const ROOT: Record<string, string> = { Am: 'A1', E: 'E1', C: 'C2', G: 'G1', F: 'F1' };

function perBar(from: number, harmony: string[], fn: (h: string) => string, v = 0.7): Note[] {
  return harmony.flatMap((h, i) => seq(fn(h), bar(from + i), { v }));
}

function development(from: number): Note[] {
  const chords = DEV_H.map((h) => chord(PAD[h]));
  // first half rising in sixes, second half an octave higher
  return [...arp(chords.slice(0, 12), [0, 1, 2, 3, 2, 1], 0.25, 6, bar(from), 0.75), ...arp(chords.slice(12).map((c) => c.map((p) => p + 12)), [0, 1, 2, 3, 4, 3], 0.25, 6, bar(from + 12), 0.8)];
}

// 6/8 groove over pairs of 3/8 bars: kick on one, snare on four.
const GROOVE = { kick: 'x.....x..x..', snare: '......X.....', hat: 'x.x.x.x.x.x.', shaker: 'xxxxxxxxxxxx' };
const SOFT = { kick: 'x...........', rim: '......x.....', shaker: '..x..x..x..x' };

function drums(): Hit[] {
  const pairs = (g: Record<string, string>, from: number, n: number, crash = false) => drumBars(g, bar(from), n, { beats: 3, crash });
  return [
    ...pairs(SOFT, 4, 8),
    ...pairs(GROOVE, 20, 8, true),
    ...pairs(GROOVE, 36, 6, true),
    ...pairs({ kick: 'x.....x.....', snare: '......x.....', hat: 'x.x.x.x.x.x.' }, 48, 12, true),
    ...pairs(GROOVE, 72, 8, true),
    ...grid({ crash: 'X', kick: 'X' }, bar(88)),
  ];
}

export const furElise: SongDef = {
  id: 'fur-elise',
  name: 'Für Elise',
  artist: 'Ludwig van Beethoven',
  album: 'Bagatelle No. 25',
  genre: 'Classical Electronic',
  year: '1810',
  composer: 'Ludwig van Beethoven',
  loadingPhrase: 'Three eighth notes to the bar. Feel the swing of the six.',
  tempo: [{ beat: 0, bpm: 84 }],
  timeSigs: [{ beat: 0, num: 3, den: 8 }],
  sections: [
    { beat: bar(0), name: 'Prelude' },
    { beat: bar(4), name: 'Theme' },
    { beat: bar(20), name: 'Theme, with Band' },
    { beat: bar(36), name: 'Episode' },
    { beat: bar(48), name: 'Development' },
    { beat: bar(72), name: 'Finale' },
    { beat: bar(88), name: 'Coda' },
  ],
  player: [
    { inst: 'epiano', gain: 1, verb: 0.35, notes: [...seq(PICKUP, bar(4) - 0.5), ...seq(THEME, bar(4))] },
    { inst: 'pluck', tone: 0.6, gain: 1, verb: 0.25, echo: 0.2, notes: [...seq(PICKUP, bar(20) - 0.5), ...seq(THEME, bar(20)), ...development(48)] },
    {
      inst: 'supersaw',
      tone: 0.55,
      gain: 1,
      verb: 0.3,
      echo: 0.15,
      notes: [...seq(EPISODE, bar(36)), ...seq(`${A_BODY} A4:4 .:2`, bar(40)), ...seq(PICKUP, bar(72) - 0.5), ...seq(THEME, bar(72), { v: 0.9 }), ...seq('A4:12 A4:12', bar(88))],
    },
  ],
  backing: [
    { inst: 'epiano', gain: 0.8, pan: -0.15, verb: 0.3, notes: [...perBar(0, ['Am', 'E', 'Am', 'E'], (h) => LH[h]), ...perBar(4, THEME_H, (h) => LH[h]), ...perBar(20, THEME_H, (h) => LH[h], 0.6)] },
    {
      inst: 'pad',
      tone: 0.4,
      gain: 0.9,
      verb: 0.4,
      pump: 0.35,
      notes: [...perBar(0, ['Am', 'E', 'Am', 'E'], (h) => `${PAD[h]}:6`, 0.55), ...perBar(20, THEME_H, (h) => `${PAD[h]}:6`, 0.6), ...perBar(36, [...EPISODE_H, ...THEME_H.slice(0, 8)], (h) => `${PAD[h]}:6`, 0.6), ...perBar(48, DEV_H, (h) => `${PAD[h]}:6`, 0.6), ...perBar(72, THEME_H, (h) => `${PAD[h]}:6`, 0.65), ...seq(`${PAD.Am}:12`, bar(88), { v: 0.6 })],
    },
    {
      inst: 'synthbass',
      tone: 0.45,
      gain: 1,
      verb: 0,
      notes: [...perBar(20, THEME_H, (h) => `${ROOT[h]}:3 ${ROOT[h]}:2 ${ROOT[h]}:1`), ...perBar(36, [...EPISODE_H, ...THEME_H.slice(0, 8)], (h) => `${ROOT[h]}:3 ${ROOT[h]}`), ...perBar(48, DEV_H, (h) => `${ROOT[h]}:3 ${ROOT[h]}:2 ${ROOT[h]}:1`), ...perBar(72, THEME_H, (h) => `${ROOT[h]}:3 ${ROOT[h]}:2 ${ROOT[h]}:1`), ...seq('A1:12', bar(88))],
    },
    { inst: 'bell', gain: 0.35, pan: 0.3, verb: 0.5, echo: 0.3, notes: seq(THEME, bar(72), { transpose: 12, v: 0.5 }).filter((n) => n.d >= 0.5) },
  ],
  drums: [{ kit: 'electro', hits: drums() }],
  solos: [],
  lengthBeats: bar(92),
  previewBeat: bar(20) - 0.5,
  art: { from: '#1e0f2e', to: '#6b87c7', ink: '#fce4ec', motif: 'wave' },
};
