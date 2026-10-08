import { perform } from '../performance.ts';
import { abc } from '../abc.ts';
import { bassOf, comp, nearVoicing, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { diatonic, grid, transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Post-rock in D, 120 BPM: clean arpeggios under a long delay, a glockenspiel melody, then the same
// melody tremolo-picked, growing into the loud part, and back down to the arpeggios.
const MELODY = abc(`
M:4/4
L:1/4
K:D
d2 B2 | A3 F | E2 FA | B4 | d2 e2 | f3 e | c2 Ac | B4 |]
`);
const H = prog('Gadd9 D Asus4 Bm Gadd9 D A Bm');
const D_MAJOR = [2, 4, 6, 7, 9, 11, 1];
const bar = (n: number) => n * 4;

// Bar map: arpeggios 0, glockenspiel 8, tremolo 16, loud 24, louder 32, the end 40, silence 44.
const [INTRO, GLOCK, TREM, LOUD, LOUDER, OUTRO, END] = [0, 8, 16, 24, 32, 40, 44].map(bar);

const at = (notes: Note[], b: number): Note[] => notes.map((n) => ({ ...n, b: n.b + b }));
/** Clean arpeggio: up and down the chord, eighth notes, with the root an octave up on top. */
const arps = (from: number, chords = H, v = 0.7) =>
  comp(chords, 4, from, 'x.x.x.x.x.x.x.x.', (c) => [...voicing(c, 'D3'), voicing(c, 'D3')[0] + 12], { arp: [0, 1, 2, 3, 4, 3, 2, 1], v });
/** Tremolo: every note of the tune as a stream of sixteenths. */
const tremolo = (notes: Note[]): Note[] =>
  notes.flatMap((n) => [...Array(Math.round(n.d * 4))].map((_, i) => ({ ...n, b: n.b + i / 4, d: 0.25, v: i ? n.v * 0.8 : n.v })));
const harmony = (notes: Note[]): Note[] => notes.map((n) => ({ ...n, p: [...diatonic([n], D_MAJOR, -2)[0].p, ...n.p] }));

function drums(): Hit[] {
  const out: Hit[] = [];
  // the glockenspiel verse: a heartbeat on the floor tom
  for (let b = GLOCK; b < TREM; b += 2) out.push({ b, k: 'tomLo', v: 0.4 }, { b: b + 0.75, k: 'tomLo', v: 0.25 });
  // the build: rolling toms and rising cymbals
  for (let i = 0; i < 32 * 4; i++) {
    const b = TREM + i / 4;
    const t = i / 128;
    if (i % 4 === 0) out.push({ b, k: 'kick', v: 0.4 + 0.4 * t });
    if (i % 2 === 0) out.push({ b, k: i % 8 < 4 ? 'tomMid' : 'tomLo', v: 0.3 + 0.5 * t });
    if (i % 8 === 4) out.push({ b, k: 'ride', v: 0.3 + 0.4 * t });
  }
  out.push(...grid({ snare: 'xxxxxxxxxxxxXXXX' }, LOUD - 4));
  const BIG = { kick: 'x.....x.x.......', snare: '....X.......X...', ride: 'x.x.x.x.x.x.x.x.', crash: 'x...............' };
  out.push(...drumBars(BIG, LOUD, 8, { crash: true, fill: 'toms2' }));
  out.push(...drumBars({ ...BIG, kick: 'x.x.x.x.x.x.x.x.' }, LOUDER, 8, { crash: true, fill: 'build4' }));
  out.push({ b: OUTRO, k: 'crash', v: 1 }, { b: OUTRO, k: 'kick', v: 1 });
  return out;
}

export const lowOrbit: SongDef = perform({
  id: 'low-orbit',
  name: 'Low Orbit',
  artist: 'Quiet Meridian',
  album: 'Everything Is Far Away',
  genre: 'Post-Rock',
  year: '2026',
  loadingPhrase: 'Tremolo picking: the same note, as fast and even as you can. Then louder.',
  tempo: [{ beat: 0, bpm: 120 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: INTRO, name: 'Liftoff' },
    { beat: GLOCK, name: 'Glockenspiel' },
    { beat: TREM, name: 'Tremolo' },
    { beat: LOUD, name: 'The Loud Part' },
    { beat: LOUDER, name: 'The Louder Part' },
    { beat: OUTRO, name: 'Drift' },
  ],
  player: [
    { inst: 'clean', gain: 1, verb: 0.25, echo: 0.25, notes: [...arps(INTRO, H, 0.6), ...arps(GLOCK), ...arps(OUTRO, prog('Gadd9 D Asus4 D'), 0.55)] },
    { inst: 'clean', gain: 1, verb: 0.25, echo: 0.18, notes: tremolo(transpose(at(MELODY.notes, TREM), -12)) },
    { inst: 'lead', tone: 0.55, gain: 1, verb: 0.35, echo: 0.2, notes: [...tremolo(at(MELODY.notes, LOUD)), ...tremolo(harmony(at(MELODY.notes, LOUDER)))] },
  ],
  backing: [
    { inst: 'bell', gain: 0.6, pan: 0.25, verb: 0.5, echo: 0.3, notes: [...at(MELODY.notes, GLOCK).map((n) => ({ ...n, p: n.p.map((p) => p + 12) })), ...at(MELODY.notes, LOUDER).map((n) => ({ ...n, p: n.p.map((p) => p + 12), v: 0.5 }))] },
    { inst: 'pad', tone: 0.3, gain: 0.65, verb: 0.35, notes: [...comp(H, 4, INTRO, 'x---------------', (c) => nearVoicing(c, 'D4'), { v: 0.3 }), ...comp(H, 4, TREM, 'x---------------', (c) => nearVoicing(c, 'D4'), { v: 0.45 }), ...comp(prog('Gadd9 D Asus4 D'), 4, OUTRO, 'x---------------', (c) => nearVoicing(c, 'D4'), { v: 0.3 })] },
    { inst: 'drive', tone: 0.45, gain: 0.6, verb: 0.2, notes: [...comp(H, 4, LOUD, 'x-------x-------', (c) => powerOf(c.replace(/add9|sus4/, ''), 'E2'), { v: 0.8 }), ...comp(H, 4, LOUDER, 'x.x.x.x.x.x.x.x.', (c) => powerOf(c.replace(/add9|sus4/, ''), 'E2'), { v: 0.8 })] },
    { inst: 'pickbass', gain: 0.95, verb: 0.05, notes: [...comp(H, 4, GLOCK, 'x-------x-------', (c) => [bassOf(c, 'E1')], { v: 0.6 }), ...comp(H, 4, TREM, 'x...x...x...x...', (c) => [bassOf(c, 'E1')], { v: 0.7 }), ...comp(H, 4, LOUD, 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'E1')], { v: 0.85 }), ...comp(H, 4, LOUDER, 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'E1')], { v: 0.9 }), { b: OUTRO, d: 8, p: [31], v: 0.8 }] },
    { inst: 'strings', tone: 0.35, gain: 0.6, pan: -0.3, verb: 0.5, notes: comp(H, 4, LOUDER, 'x---------------', (c) => nearVoicing(c, 'F#4'), { v: 0.6 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8, verb: 0.3 }],
  solos: [],
  lengthBeats: END + 4,
  previewBeat: LOUD,
  art: { from: '#05070f', to: '#3b4a7a', ink: '#e8eeff', motif: 'orbit' },
}, { bar: 4, phrase: 32, shape: [0.72, 1, 0.9], gate: 0.98, accent: 0.03 });
