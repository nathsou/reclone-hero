import { abc } from '../abc.ts';
import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { diatonic, transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// When the Saints Go Marching In, the spiritual (early 20th century; public domain), as a New
// Orleans brass band: a slow dirge on the way there, then the second line, swinging, with a
// banjo chorus. The banjo solo is ours.
const MELODY = abc(`
M:4/4
L:1/4
K:C
z C E F | G4 | z C E F | G4 | z C E F | G2 E2 | C2 E2 | D4 |
z E E D | C3 C | E2 G2 | G F3- | F2 E F | G2 E2 | C2 D2 | C4 |]
`);
const SOLO = abc(`
M:4/4
L:1/8
K:C
z2 ce g2 ec | _e=e ge c2 G2 | c2 eg ag ec | g4 z2 ga | c'2 ag e2 c2 | dc Ac e2 z2 | ef ge c2 e2 | d2 BG F2 D2 |
EG ce g2 e2 | _b2 ge c2 _B2 | Ac fa c'2 a2 | _af df _a2 f2 | af cA F2 Ac | eg c'g ec GE | DF GB df ed | c2 g2 c'4 |]
`);
const H = prog('C C C C C C C G7 C C C7 F F C G7 C');
const CMAJ = [0, 2, 4, 5, 7, 9, 11];
const bar = (n: number) => n * 4;

// Bar map: intro 0, dirge 2 (first half of the tune), drum break 10, chorus 11, banjo 27,
// last chorus 43, tag 59 (the last four bars again), final chord 63.
const DIRGE = bar(2);
const BREAK = bar(10);
const CH = [bar(11), bar(27), bar(43)];
const TAG = bar(59);
const END = bar(63);

const place = (notes: Note[], at: number, from = 0, to = Infinity, shift = 0): Note[] =>
  notes.filter((n) => n.b >= from - 1e-6 && n.b < to - 1e-6).map((n) => ({ ...n, b: n.b - from + at, p: n.p.map((p) => p + shift) }));

/** Triplet swing: off-beat eighths land two-thirds of the way through the beat. */
function swing<T extends { b: number; d?: number }>(items: T[]): T[] {
  return items.map((x) => {
    const f = x.b - Math.floor(x.b);
    if (Math.abs(f - 0.5) < 1e-6) return { ...x, b: x.b + 1 / 6, ...(x.d !== undefined ? { d: Math.max(0.1, x.d - 1 / 6) } : {}) };
    if (f < 1e-6 && x.d !== undefined && Math.abs(x.d - 0.5) < 1e-6) return { ...x, d: 2 / 3 };
    return x;
  });
}
const withThirds = (notes: Note[]): Note[] =>
  notes.map((n) => {
    const low = diatonic([n], CMAJ, -2)[0].p[0];
    return low === n.p[0] ? n : { ...n, p: [low, n.p[0]] };
  });

const banjoChords = (at: number, v: number) => comp(H, 4, at, 'x...x...x...x...', (c) => voicing(c, 'G3'), { v });
const tuba = (at: number, v: number) => comp(H, 4, at, 'x.......x.......', (c) => [bassOf(c, 'F1'), bassOf(c, 'F1') + 7], { v, arp: [0, 1] });
/** Trombones on root and fifth: the tune's passing notes (the F in "when the saints") never grind on a held third. */
const rootFifth = (c: string) => {
  const r = bassOf(c, 'C3');
  return [r, r + 7];
};
const bones = (at: number, v: number) => comp(H, 4, at, 'x-------x-------', rootFifth, { v });
const reeds = (at: number, v: number) => swing(comp(H, 4, at, 'x.x.x.x.x.x.x.x.', (c) => voicing(c, 'C5'), { v, arp: [0, 1, 2, 3, 2, 1, 0, 1] }));
/** A part's last four bars, for the tag. */
const tag = (part: (at: number) => Note[]) => part(TAG - bar(12)).filter((n) => n.b >= TAG - 1e-6 && n.b < END - 1e-6);
const melody = (at: number) => place(MELODY.notes, at);

function drums(): Hit[] {
  const out: Hit[] = [];
  // the dirge: a muffled bass drum and a snare roll
  for (let b = 0; b < BREAK; b += 2) out.push({ b, k: 'kick', v: 0.7 }, { b: b + 1, k: 'tomLo', v: 0.35 });
  for (let i = 0; i < 24; i++) out.push({ b: i / 6, k: 'snare', v: 0.2 + i / 60 });
  // the break: the second line starts
  const brk = [0, 1, 1 + 2 / 3, 2, 2 + 2 / 3, 3, 3 + 1 / 3, 3 + 2 / 3];
  for (const t of brk) out.push({ b: BREAK + t, k: 'snare', v: t % 1 ? 0.7 : 0.95 });
  out.push({ b: BREAK, k: 'kick', v: 1 }, { b: BREAK + 2, k: 'kick', v: 0.9 });
  // second line: kick on one and the swung and of two, snare on the back beat, a swinging ride
  for (let b = CH[0]; b < END; b += 4) {
    const loud = b >= CH[2] ? 1 : 0.85;
    for (const [t, k, v] of [
      [0, 'kick', 0.9], [1 + 2 / 3, 'kick', 0.6], [2, 'kick', 0.8], [3 + 2 / 3, 'kick', 0.5],
      [1, 'snare', 0.8], [3, 'snare', 0.85], [2 + 2 / 3, 'snare', 0.3],
      [0, 'ride', 0.6], [1, 'ride', 0.6], [1 + 2 / 3, 'ride', 0.45], [2, 'ride', 0.6], [3, 'ride', 0.6], [3 + 2 / 3, 'ride', 0.45],
    ] as [number, Hit['k'], number][]) out.push({ b: b + t, k, v: v * loud });
  }
  for (const b of [...CH, TAG]) out.push({ b, k: 'crash', v: 0.85 });
  out.push({ b: END, k: 'crash', v: 1 }, { b: END, k: 'kick', v: 1 }, { b: END, k: 'snare', v: 1 });
  return out;
}

export const saints: SongDef = {
  id: 'when-the-saints',
  name: 'When the Saints Go Marching In',
  artist: 'Traditional',
  album: 'Second Line',
  genre: 'Dixieland',
  year: '1896',
  composer: 'Traditional',
  loadingPhrase: 'Slow on the way there, fast on the way back.',
  tempo: [
    { beat: 0, bpm: 72 },
    { beat: BREAK, bpm: 172 },
  ],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: 0, name: 'Dirge' },
    { beat: BREAK, name: 'Second Line' },
    { beat: CH[0], name: 'Chorus 1' },
    { beat: CH[1], name: 'Banjo' },
    { beat: CH[2], name: 'Everybody' },
    { beat: TAG, name: 'Tag' },
  ],
  player: [
    { inst: 'brass', tone: 0.6, gain: 1, verb: 0.35, notes: place(MELODY.notes, DIRGE, 0, bar(8)) },
    {
      inst: 'brass',
      tone: 0.75,
      gain: 1,
      verb: 0.25,
      notes: [...melody(CH[0]), ...withThirds(transpose(melody(CH[2]), 12)), ...withThirds(transpose(tag(melody), 12)), { b: END, d: 3, p: [72, 76, 79, 84], v: 1 }],
    },
    { inst: 'banjo', gain: 1.1, pan: 0.15, verb: 0.2, notes: swing(place(SOLO.notes, CH[1])) },
  ],
  backing: [
    // trombones
    { inst: 'brass', tone: 0.35, gain: 0.7, pan: -0.25, verb: 0.35, notes: [...comp(H.slice(0, 8), 4, DIRGE, 'x---------------', rootFifth, { v: 0.45 }), ...bones(CH[0], 0.55), ...bones(CH[1], 0.45), ...bones(CH[2], 0.65), ...tag((at) => bones(at, 0.65))] },
    // tuba
    { inst: 'brass', tone: 0.3, gain: 0.85, verb: 0.15, notes: [...comp(H.slice(0, 8), 4, DIRGE, 'x.......x.......', (c) => [bassOf(c, 'F1')], { v: 0.6 }), ...CH.flatMap((at) => tuba(at, 0.75)), ...tag((at) => tuba(at, 0.75)), { b: END, d: 2, p: [36], v: 0.9 }] },
    { inst: 'banjo', gain: 0.6, pan: 0.3, verb: 0.2, notes: [...banjoChords(CH[0], 0.55), ...banjoChords(CH[1], 0.4), ...banjoChords(CH[2], 0.6), ...tag((at) => banjoChords(at, 0.6))] },
    // clarinet noodling on reeds
    { inst: 'accordion', tone: 0.7, gain: 0.9, pan: -0.35, verb: 0.3, notes: [...reeds(CH[0], 0.45), ...reeds(CH[2], 0.5), ...tag((at) => reeds(at, 0.5))] },
    { inst: 'piano', gain: 1.1, pan: 0.2, verb: 0.25, notes: swing(comp(H, 4, CH[1], '..x...x...x...x.', (c) => nearVoicing(c, 'E4'), { v: 0.45 })) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.75 }],
  solos: [[CH[1], CH[2]]],
  lengthBeats: END + 4,
  previewBeat: CH[0],
  art: { from: '#2a0f3d', to: '#e2b340', ink: '#fff6dc', motif: 'sun' },
};
