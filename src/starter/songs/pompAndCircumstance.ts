import { abc } from '../abc.ts';
import { bassOf, nearVoicing, parseChord } from '../arrange.ts';
import { grid, seq } from '../score.ts';
import type { Hit, Note, SongDef, TempoPoint } from '../score.ts';

// Edward Elgar, Pomp and Circumstance March No. 1, the trio ("Land of Hope and Glory", 1901;
// public domain), played straight: softly on strings, then again with brass, organ and timpani.
// Melody and harmony after John Chambers' transcription.
const TUNE = abc(`
M:4/4
L:1/8
K:G
[| "G"G4 "D7"FGA2 | "G/D"E4 D4 | "C"C4 "G/B"B,CD2 | "Am"A,4- "D/A"A,4 |
| "G/D"B,4 "A7/C#"^CD2E | "D"A4 "Bm/D"D4 | "Em7"G4 "A/E"GF2E | "D"D4- "D7"D4 |
| "G"g4 "D7"fga2 | "G/D"e4 d4 | "C"c4 "G/B"Bcd2 | "Am"A4- "D/A"A4 |
| "G/D"B4 "A7/C#"^cd2e | "D"a4 "G/D"d4 | "C/E"c'4 "D7"c'b2a | "G/D"b4- "Bm"b4 |
| "C"e4 "D7/C"fg2a | "G/B"d4 "Em"g4 |1 "Am"G4 "D7"cB2A | "G"G4- G4 :|2 "Am"g8 | "D7"c'2 b4 a2 | "G"g8 |]
`);
const INTRO = 8;
const SECOND = INTRO + 72; // the repeat
const END = INTRO + TUNE.length;
const bar = (n: number) => n * 4;

/** The chord symbols as spans: [start, end, name], on the song's timeline. */
const SPANS: [number, number, string][] = TUNE.chords.map((c, i) => [c.b + INTRO, (TUNE.chords[i + 1]?.b ?? TUNE.length) + INTRO, c.name]);
const spansIn = (from: number, to: number) => SPANS.filter(([a]) => a >= from - 1e-6 && a < to - 1e-6);

/** A chord for each span, held (pads) or repeated every `step` beats (the march). */
function chords(from: number, to: number, pitches: (c: string) => number[], v: number, step = 0): Note[] {
  const out: Note[] = [];
  for (const [a, b, name] of spansIn(from, to)) {
    if (!step) out.push({ b: a, d: b - a, p: pitches(name), v });
    else for (let t = a; t < b - 1e-6; t += step) out.push({ b: t, d: step * 0.9, p: pitches(name), v: (t - INTRO) % 4 === 0 ? v + 0.1 : v });
  }
  return out;
}
const bass = (c: string) => [bassOf(c, 'G1')];

/** The tune with a chord tone a third to a sixth below each note: brass in harmony. */
function harmonised(notes: Note[]): Note[] {
  return notes.map((n) => {
    const span = SPANS.findLast(([a]) => a <= n.b + 1e-6);
    if (!span) return n;
    const c = parseChord(span[2].replace(/\/.*/, ''));
    const pcs = c.intervals.map((i) => (c.root + i) % 12);
    const top = n.p[n.p.length - 1];
    let below = top - 3;
    while (below > top - 10 && !pcs.includes(((below % 12) + 12) % 12)) below--;
    return below > top - 10 ? { ...n, p: [below, top] } : n;
  });
}

const melody = TUNE.notes.map((n) => ({ ...n, b: n.b + INTRO }));
const firstPass = melody.filter((n) => n.b < SECOND);
const secondPass = melody.filter((n) => n.b >= SECOND);
/**
 * The second pass's march: the strings' quarter-note chords. Where the tune holds a long note, the
 * player takes them over (same instrument, same sound), so the chart keeps moving under it.
 */
const march = chords(SECOND, END, (c) => nearVoicing(c, 'G3'), 0.6, 1);
const holding = (b: number) => secondPass.some((n) => n.b < b - 1e-6 && n.b + n.d > b + 1e-6);
const marchPlayed = march.filter((n) => holding(n.b));
const marchBacked = march.filter((n) => !holding(n.b));

const tempo: TempoPoint[] = [
  { beat: 0, bpm: 92 },
  { beat: SECOND, bpm: 86 },
  { beat: END - 8, bpm: 72 },
];

function drums(): Hit[] {
  const out: Hit[] = [];
  // bass drum and cymbals mark the big phrases of the second pass
  for (const b of [SECOND, SECOND + bar(4), SECOND + bar(8), SECOND + bar(12), SECOND + bar(16)]) out.push({ b, k: 'crash', v: 0.85 }, { b, k: 'kick', v: 0.9 });
  for (let b = SECOND; b < END - 4; b += 2) out.push({ b, k: 'kick', v: 0.55 });
  out.push(...grid({ crash: 'X', kick: 'X' }, END), ...grid({ crash: 'X', kick: 'X' }, END + 3));
  return out;
}

/** Timpani: a soft roll on the dominant to start, root and fifth under the march, a roll to finish. */
function timpani(): Note[] {
  const roll = (from: number, beats: number, p: number, v0: number, v1: number): Note[] =>
    [...Array(beats * 6)].map((_, i) => ({ b: from + i / 6, d: 1 / 6, p: [p], v: v0 + ((v1 - v0) * i) / (beats * 6) }));
  const march: Note[] = [];
  for (const [a, , name] of spansIn(SECOND, END)) {
    const r = bassOf(name.replace(/\/.*/, ''), 'F2');
    march.push({ b: a, d: 1, p: [r], v: 0.75 });
  }
  return [...roll(0, INTRO, 38, 0.2, 0.55), ...march, ...roll(END - 4, 3, 43, 0.4, 0.9), { b: END, d: 2, p: [43], v: 1 }, { b: END + 3, d: 2, p: [43], v: 1 }];
}

export const pompAndCircumstance: SongDef = {
  id: 'pomp-and-circumstance',
  name: 'Pomp and Circumstance',
  artist: 'Edward Elgar',
  album: 'Military Marches, Op. 39',
  genre: 'Romantic',
  year: '1901',
  composer: 'Edward Elgar',
  loadingPhrase: 'Nobilmente: with nobility, and a lot of brass.',
  tempo,
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: 0, name: 'Introduction' },
    { beat: INTRO, name: 'The Trio, Softly' },
    { beat: INTRO + bar(8), name: 'The Trio, Rising' },
    { beat: SECOND, name: 'Full Orchestra' },
    { beat: SECOND + bar(8), name: 'Land of Hope and Glory' },
    { beat: END - bar(3), name: 'Finale' },
  ],
  player: [
    { inst: 'strings', tone: 0.6, gain: 1.1, verb: 0.4, notes: firstPass.map((n) => ({ ...n, v: 0.7 })) },
    { inst: 'brass', tone: 0.6, gain: 1, verb: 0.4, notes: [...harmonised(secondPass), ...seq('G3+B3+D4+G4!:4 .:8 G3+B3+D4+G4!:8', END)] },
    { inst: 'strings', tone: 0.55, gain: 0.6, pan: -0.3, verb: 0.4, notes: marchPlayed },
  ],
  backing: [
    // first pass: sustained strings and horns
    { inst: 'strings', tone: 0.45, gain: 0.6, pan: -0.25, verb: 0.45, notes: [{ b: 0, d: INTRO, p: [50, 57, 62], v: 0.4 }, ...chords(INTRO, SECOND, (c) => nearVoicing(c, 'D3'), 0.5)] },
    { inst: 'strings', tone: 0.35, gain: 0.8, pan: 0.1, verb: 0.35, notes: [{ b: 0, d: INTRO, p: [38], v: 0.5 }, ...chords(INTRO, END, bass, 0.65)] },
    { inst: 'brass', tone: 0.35, gain: 0.9, pan: 0.3, verb: 0.45, notes: chords(INTRO + bar(8), SECOND, (c) => nearVoicing(c, 'G3'), 0.45) },
    // second pass: the strings march in quarters, the organ holds everything together
    { inst: 'strings', tone: 0.55, gain: 0.6, pan: -0.3, verb: 0.4, notes: [...marchBacked, ...seq('G2+D3+G3+B3+D4!:4 .:8 G2+D3+G3+B3+D4!:8', END)] },
    { inst: 'organ', gain: 0.75, verb: 0.55, notes: [...chords(SECOND, END, (c) => [...nearVoicing(c, 'B3'), bassOf(c, 'G1')], 0.6), { b: END, d: 6, p: [31, 43, 55, 59, 62, 67], v: 0.8 }] },
    { inst: 'timpani', gain: 0.9, verb: 0.35, notes: timpani() },
  ],
  drums: [{ kit: 'orchestral', hits: drums(), gain: 1, verb: 0.4 }],
  solos: [],
  lengthBeats: END + 6,
  previewBeat: SECOND,
  art: { from: '#14163a', to: '#b8322e', ink: '#f5e6b8', motif: 'crest' },
};
