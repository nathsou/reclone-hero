import { perform } from '../performance.ts';
import { abc } from '../abc.ts';
import { bassOf, comp, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars, GALLOP, PUNK, ROCK_DRIVE } from '../patterns.ts';
import { grid, seq } from '../score.ts';
import type { Hit, Note, SongDef, TempoPoint } from '../score.ts';

// Korobeiniki, the Russian folk song (1861; public domain) better known as the Tetris theme. It
// starts as 8-bit chiptune and turns into metal, speeding up every time round, like the game.
// Melody after the transcription on thesession.org (tune 13747), lightly tidied.
const TUNE = abc(`
M:2/4
L:1/8
K:Em
|B2 FG|A2 GF|E2 EG|B2 AG|F3 G|A2 B2|G2 E2|E2 z2|
z A2 c|e2 dc|B3 G|B2 AG|F2 FG|A2 B2|G2 E2|E2 z2|
B4|G4|A4|F4|G4|E4|^D4-|^D2 z2|
B4|G4|A4|F4|G2 B2|ee ^d2-|^d2 z2|z4|]
`);
const BAR = 2;
const bar = (n: number) => n * BAR;
/** 32 bars: A (8), A' (8), B (16); one chord per bar */
const H = prog(
  'Em B7 Em Em B B7 Em Em | Am Am Em Em B B Em Em | Em C Am B Em C B B | Em C Am B Em C B B',
);
const LOOP = TUNE.length; // 64 beats

const at = (notes: Note[], beat: number, transpose = 0): Note[] => notes.map((n) => ({ ...n, b: n.b + beat, p: n.p.map((p) => p + transpose) }));
const chipBass = (from: number) => comp(H, BAR, bar(from), 'x.x.x.x.', (c) => [bassOf(c, 'E2'), bassOf(c, 'E2') + 12], { arp: [0, 1] });
const chipArps = (from: number) => comp(H, BAR, bar(from), 'xxxxxxxx', (c) => voicing(c, 'E4'), { arp: [0, 1, 2, 1], v: 0.55 });
const chugs = (from: number) => comp(H, BAR, bar(from), 'm.m.x.m.', (c) => powerOf(c, 'E2'), { v: 0.72 });
const bass8 = (from: number) => comp(H, BAR, bar(from), 'x.x.x.x.', (c) => [bassOf(c, 'E1')]);

// Level 1 (chiptune) bars 0-31, level 2 (the band) 32-63, level 3 (faster, lead up high) 64-95,
// then the tune's last line as a coda.
const tempo: TempoPoint[] = [
  { beat: 0, bpm: 150 },
  { beat: bar(32), bpm: 168 },
  { beat: bar(64), bpm: 188 },
];

function drums(): Hit[] {
  const chipBeat = { kick: 'x...x...', snare: '....x...', hat: 'x.x.x.x.' };
  const perBar = (g: Record<string, string>, from: number, n: number, crash = false) => drumBars(g, bar(from), n, { beats: BAR, crash });
  return [
    ...perBar({ hat: 'x.x.x.x.' }, 0, 16),
    ...perBar(chipBeat, 16, 16, true),
    ...perBar({ kick: 'x.x.x.x.', snare: '....X...', ride: 'x...x...' }, 32, 16, true),
    ...perBar({ kick: 'x.......', snare: '....X...', hat: 'x.x.x.x.' }, 48, 16, true),
    ...drumBars(GALLOP, bar(64), 8, { crash: true }),
    ...drumBars(PUNK, bar(80), 7, { crash: true }),
    ...drumBars(ROCK_DRIVE, bar(94), 1, { fill: 'roll2' }),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(96)),
  ];
}

export const korobeiniki: SongDef = perform({
  id: 'korobeiniki',
  name: 'Korobeiniki',
  artist: 'Traditional',
  album: 'Russian Folk Songs',
  genre: 'Folk Metal',
  year: '1861',
  composer: 'Traditional',
  loadingPhrase: 'Level 1: blips and bloops. Level 3: you will need both hands.',
  tempo,
  timeSigs: [{ beat: 0, num: 2, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Level 1' },
    { beat: bar(16), name: 'Level 1, Beat' },
    { beat: bar(32), name: 'Level 2' },
    { beat: bar(64), name: 'Level 3' },
    { beat: bar(96), name: 'Game Over' },
  ],
  player: [
    { inst: 'chip', tone: 0.5, gain: 1.2, verb: 0.15, echo: 0.1, notes: at(TUNE.notes, 0) },
    { inst: 'lead', tone: 0.45, gain: 1, verb: 0.2, echo: 0.1, notes: [...at(TUNE.notes, LOOP), ...at(TUNE.notes, 2 * LOOP)] },
    { inst: 'drive', tone: 0.55, gain: 1, verb: 0.06, notes: seq('E2^5!:4 B1^5! E2^5!:8', bar(96)).map((n) => ({ ...n, p: n.p.map((p) => p + 12) })) },
  ],
  backing: [
    { inst: 'chip', tone: 0.25, gain: 0.45, pan: 0.2, verb: 0.1, notes: chipArps(0) },
    { inst: 'chip', tone: 0.5, gain: 0.8, verb: 0.05, notes: chipBass(0) },
    { inst: 'drive', tone: 0.4, gain: 0.55, verb: 0.05, notes: [...chugs(32), ...chugs(64)] },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...bass8(32), ...bass8(64), ...seq('E1:4 B0 E1:8', bar(96))] },
    { inst: 'lead', tone: 0.45, gain: 0.5, pan: -0.35, verb: 0.2, notes: at(TUNE.notes, 2 * LOOP, -12).filter(n => n.d >= 0.5) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [],
  lengthBeats: bar(100),
  previewBeat: bar(32),
  art: { from: '#0b0b24', to: '#29a3b8', ink: '#f7ff9e', motif: 'bars' },
}, { bar: 4, phrase: 16, shape: [0.9, 1, 0.85], gate: 0.88, accent: 0.08 });
