import { abc, harmony } from '../abc.ts';
import { bassOf, comp, nearVoicing } from '../arrange.ts';
import { drumBars, PUNK } from '../patterns.ts';
import { grid } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Hava Nagila, the Hebrew folk song (1918, on a Hasidic melody; public domain), as a hora that
// starts slow and ends up as surf rock, faster every time round. After John Chambers'
// transcription; one bar's lengths mended to match the words.
const TUNE = abc(`
M:C
L:1/8
K:Gm
|: "D"D2 D3 ^F ED | ^F2 F3 A GF | "G"G2 G3 B AG |1 "D"^F2 "Cm"E/D/E "D"F4 :|2 "D"^F2 "Cm"E/D/E "D"D4 |
|: "D"^FF2E DD D2 | "Cm"EE2D CC C2 | CE2D CC G2 |1 "D"^F2 "Cm"E/D/E "D"F4 :|2 "D"^F2 "Cm"E/D/E "D"D4 ||
"Gm"G4 B4 | G2 B2 G2 B2 |
"Gm"G/G/G B>A GB AG | G/G/G B>A GB AG | "Cm"A/A/A c>B Ac BA | A/A/A c>B Ac BA |
"Cm"A/A/A "D"d2 "Cm"A/A/A "D"d>D | "D7"DD (B/A/G/^F/) "Gm"G4 |]
`);
const H = harmony(TUNE, 2, 'D');
const bar = (n: number) => n * 4;
const INTRO = bar(8); // the first strain, slowly
const LOOP = TUNE.length; // 24 bars
const pass = (i: number) => INTRO + i * LOOP;
const END = pass(2);

const tune = (from: number, to: number, at: number, shift = 0): Note[] =>
  TUNE.notes.filter((n) => n.b >= from - 1e-6 && n.b < to - 1e-6).map((n) => ({ ...n, b: n.b - from + at, p: n.p.map((p) => p + shift) }));
const G_HARM = [7, 9, 10, 0, 2, 3, 6]; // G harmonic minor, the scale the tune lives in
/** A third below, in the tune's scale. */
function thirds(notes: Note[]): Note[] {
  return notes.map((n) => {
    const p = n.p[0];
    let q = p - 3;
    while (q > p - 5 && !G_HARM.includes(((q % 12) + 12) % 12)) q--;
    return { ...n, p: [q, p] };
  });
}
const chords = (h: string[], at: number, rhythm: string, v: number) => comp(h, 2, at, rhythm, (c) => nearVoicing(c, 'A3'), { v });
const bassLine = (h: string[], at: number, v: number) => comp(h, 2, at, 'x...x...', (c) => [bassOf(c, 'E1'), bassOf(c, 'E1') + 7], { v, arp: [0, 1] });

const HORA = { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.' };
function drums(): Hit[] {
  return [
    ...grid({ tomLo: 'x...............', tomMid: '........x.......' }, bar(6)),
    ...grid({ tomLo: 'x.......x...', snare: '............xxxx' }, bar(7)),
    ...drumBars(HORA, pass(0), 16, { crash: true, fill: 'snare1' }),
    ...drumBars({ ...HORA, hat: 'x.x.x.x.x.x.x.x.' }, pass(0) + bar(16), 8, { crash: true, fill: 'build4' }),
    ...drumBars(PUNK, pass(1), 16, { crash: true, fill: 'toms2' }),
    ...drumBars(PUNK, pass(1) + bar(16), 7, { crash: true }),
    ...grid({ crash: 'X.......', kick: 'X.......', snare: 'X.......' }, END - bar(1)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, END),
  ];
}

export const havaNagila: SongDef = {
  id: 'hava-nagila',
  name: 'Hava Nagila',
  artist: 'Traditional',
  album: 'Songs for Dancing',
  genre: 'Klezmer Surf',
  year: '1918',
  composer: 'Traditional',
  loadingPhrase: 'Let us rejoice, and let us be glad. Then faster.',
  tempo: [
    { beat: 0, bpm: 92 },
    { beat: bar(6), bpm: 104 },
    { beat: pass(0), bpm: 138 },
    { beat: pass(1), bpm: 160 },
    { beat: END - bar(1), bpm: 120 },
  ],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: 0, name: 'Slowly' },
    { beat: pass(0), name: 'Hava Nagila' },
    { beat: pass(0) + bar(8), name: 'Hava Neranenah' },
    { beat: pass(0) + bar(16), name: 'Uru Achim' },
    { beat: pass(1), name: 'Faster' },
    { beat: pass(1) + bar(16), name: 'Uru Achim, Faster' },
  ],
  player: [
    { inst: 'fiddle', tone: 0.55, gain: 1.1, verb: 0.4, notes: tune(0, bar(8), 0) },
    { inst: 'lead', tone: 0.55, gain: 1, verb: 0.25, echo: 0.12, notes: [...tune(0, LOOP, pass(0)), ...thirds(tune(0, LOOP, pass(1))).map((n) => ({ ...n, p: n.p.map((p) => p + 12) }))] },
  ],
  backing: [
    { inst: 'accordion', gain: 0.7, pan: -0.3, verb: 0.3, notes: [...chords(H.slice(0, 16), 0, 'x-------', 0.45), ...chords(H, pass(0), '....x...', 0.55), ...chords(H, pass(1), '..x...x.', 0.55)] },
    { inst: 'fiddle', tone: 0.55, gain: 0.6, pan: 0.35, verb: 0.35, notes: [...tune(bar(16), LOOP, pass(0) + bar(16), 12), ...tune(0, LOOP, pass(1), 12)] },
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.05, notes: comp(H, 2, pass(1), 'x.mmx.mm', (c) => [bassOf(c, 'E2'), bassOf(c, 'E2') + 7], { v: 0.75 }) },
    { inst: 'pickbass', gain: 0.95, verb: 0, notes: [...bassLine(H.slice(0, 16), 0, 0.5).filter((n) => n.b >= bar(4)), ...bassLine(H, pass(0), 0.75), ...bassLine(H, pass(1), 0.85)] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [],
  lengthBeats: END + 3,
  previewBeat: pass(0),
  art: { from: '#0d1b4d', to: '#3ec1d3', ink: '#fff7d6', motif: 'wave' },
};
