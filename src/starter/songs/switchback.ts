import { perform } from '../performance.ts';
import { abc } from '../abc.ts';
import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { seq } from '../score.ts';
import type { Note, SongDef } from '../score.ts';

// Bluegrass breakdown in G, 132 BPM, with no drums, as tradition wants: the banjo rolls through
// the tune, the fiddle takes a break, then the guitar, and the banjo brings it home. The rhythm is
// the bass on one and three and the mandolin chop on two and four.
const TUNE = abc(`
M:4/4
L:1/8
K:G
|:G2 BA GABd | g2 fg edBd | e2 ce gece | dBGA B2 AG |
G2 BA GABd | g2 fg edBd | efge dBAF | G2 B2 G4 :|
|:B2 eg bgeg | fgaf gfed | e2 ce g2 ec | dBGB d2 BG |
c2 ec G2 ce | dcBA G2 Bd | efge dBAF | G2 D2 G4 :|
`);
const A = prog('G G C G G G D G');
const B = prog('Em Em C G C G D G');
const bar = (n: number) => n * 4;
const HALF = bar(16); // AA or BB
const DRONE = 67; // the banjo's short fifth string, a high G

// Bar map: banjo alone 0, banjo break (AABB) 2, fiddle break (AB) 34, guitar break (AB) 50,
// banjo (BB) 66, tag 82, end 84.
const R1 = bar(2);
const R2 = bar(34);
const R3 = bar(50);
const R4 = bar(66);
const TAG = bar(82);
const END = bar(84);

/** The tune (as played, AABB) between two beats, moved to `at`. */
const tune = (from: number, to: number, at: number, shift = 0): Note[] =>
  TUNE.notes.filter((n) => n.b >= from - 1e-6 && n.b < to - 1e-6).map((n) => ({ ...n, b: n.b - from + at, p: n.p.map((p) => p + shift) }));
const AB = [0, HALF / 2, HALF, HALF + HALF / 2] as const; // start of A, second A, B, second B

/**
 * Banjo rolls around the melody: on every eighth the melody note (or, while a long note rings,
 * a chord tone), and between them the drone and the chord's fifth in turn.
 */
function rolls(melody: Note[], chords: string[], at: number, bars: number): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < bars * 16; i++) {
    const b = at + i / 4;
    const tones = voicing(chords[Math.floor(i / 16)], 'G2');
    let p: number;
    if (i % 2 === 0) {
      const m = melody.find((n) => Math.abs(n.b - b) < 1e-6);
      p = m ? m.p[0] : tones[(i / 2) % tones.length] + 12;
    } else p = i % 4 === 1 ? DRONE : tones[2] ?? tones[0] + 7;
    out.push({ b, d: 0.25, p: [p], v: i % 4 === 0 ? 0.85 : 0.65 });
  }
  return out;
}

/** Guitar rhythm: bass note on one, strum on two, the fifth on three, strum on four. */
function boomChick(chords: string[], at: number, v: number): Note[] {
  return chords.flatMap((c, i) => {
    const b = at + bar(i);
    const r = bassOf(c, 'E2');
    const chord = nearVoicing(c, 'G3');
    return [
      { b, d: 1, p: [r], v },
      { b: b + 1, d: 0.5, p: chord, v: v * 0.8 },
      { b: b + 2, d: 1, p: [r + 7 > 52 ? r - 5 : r + 7], v },
      { b: b + 3, d: 0.5, p: chord, v: v * 0.8 },
    ];
  });
}
const bass = (chords: string[], at: number) => comp(chords, 4, at, 'x.......x.......', (c) => [bassOf(c, 'E1'), bassOf(c, 'E1') + 7], { arp: [0, 1], v: 0.8 });
const chop = (chords: string[], at: number) => comp(chords, 4, at, '....m.......m...', (c) => voicing(c, 'G4'), { v: 0.6 });
const fiddleDrones = (chords: string[], at: number) => comp(chords, 4, at, 'x---------------', (c) => nearVoicing(c, 'D4').slice(-2), { v: 0.45 });

const ALL = [...A, ...A, ...B, ...B];
const AB_CHORDS = [...A, ...B];
const BB = [...B, ...B];
const AB_TUNE = (at: number, shift = 0) => [...tune(AB[0], AB[1], at, shift), ...tune(AB[2], AB[3], at + bar(8), shift)];

export const switchback: SongDef = perform({
  id: 'switchback',
  name: 'Switchback Breakdown',
  artist: 'Holler Creek Ramblers',
  album: 'Up the Holler',
  genre: 'Bluegrass',
  year: '2026',
  loadingPhrase: 'Banjo rolls come in threes and fours; the melody is on the strong notes.',
  tempo: [{ beat: 0, bpm: 132 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: 0, name: 'Banjo Kick-Off' },
    { beat: R1, name: 'Banjo Break' },
    { beat: R2, name: 'Fiddle Break' },
    { beat: R3, name: 'Guitar Break' },
    { beat: R4, name: 'Banjo Again' },
    { beat: TAG, name: 'Shave and a Haircut' },
  ],
  player: [
    { inst: 'fiddle', tone: 0.4, gain: 0.9, verb: 0.16, notes: AB_TUNE(R2) },
    {
      inst: 'banjo',
      gain: 0.7,
      pan: 0.1,
      verb: 0.15,
      notes: [...rolls([], prog('G D'), 0, 2), ...rolls(tune(0, TUNE.length, R1, -12), ALL, R1, 32), ...rolls(tune(AB[2], TUNE.length, R4, -12), BB, R4, 16)],
    },
    { inst: 'clean', chorus: 0, tone: 0.35, gain: 1, pan: -0.1, verb: 0.2, notes: [...AB_TUNE(R3, -12), ...seq('G3:4 D3:2 D3 E3:4 D3:4 | .:4 F#3:4 G2+D3+G3+B3!:8', TAG)] },
  ],
  backing: [
    { inst: 'fiddle', tone: 0.55, gain: 0.58, pan: 0.3, verb: 0.15, notes: [...fiddleDrones(ALL, R1), ...fiddleDrones(AB_CHORDS, R3), ...fiddleDrones(BB, R4), ...seq('G4:4 D4:2 D4 E4:4 D4:4 | .:4 F#4:4 G4+D5!:8', TAG)] },
    { inst: 'clean', chorus: 0, tone: 0.35, gain: 0.55, pan: -0.3, verb: 0.2, notes: [...boomChick(AB_CHORDS, R2, 0.6), ...boomChick(ALL, R1, 0.6), ...boomChick(AB_CHORDS, R3, 0.55), ...boomChick(BB, R4, 0.6)] },
    { inst: 'pickbass', tone: 0.35, gain: 0.85, verb: 0, notes: [...bass(ALL, R1), ...bass(AB_CHORDS, R2), ...bass(AB_CHORDS, R3), ...bass(BB, R4), ...seq('G1:4 D1:2 D1 E1:4 D1:4 | .:4 F#1:4 G1!:8', TAG)] },
    { inst: 'harpsichord', gain: 0.45, pan: 0.35, verb: 0.15, notes: [...chop(ALL, R1), ...chop(AB_CHORDS, R2), ...chop(AB_CHORDS, R3), ...chop(BB, R4)] },
    { inst: 'banjo', gain: 0.3, pan: 0.3, verb: 0.15, notes: rolls([], AB_CHORDS, R2, 16).map((n) => ({ ...n, v: n.v * 0.6 })) },
  ],
  drums: [],
  solos: [
    [R1, R2],
    [R2, R3],
    [R3, R4],
  ],
  lengthBeats: END + 2,
  previewBeat: R1,
  art: { from: '#2b1a0e', to: '#c97b2e', ink: '#fff1d6', motif: 'sun' },
}, { bar: 4, phrase: 16, shape: [0.88, 1, 0.85], gate: 0.86, accent: 0.08 });
