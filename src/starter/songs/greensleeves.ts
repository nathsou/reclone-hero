import { abc } from '../abc.ts';
import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { diatonic } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Greensleeves, the English ballad (16th century; public domain), played straight by a small
// consort: lute, fiddle, viols and a tabor. Melody after the violin transcription in Chris
// Spencer's abc-music collection.
const TUNE = abc(`
M:6/4
L:1/4
K:Gm
G|B2cd3/2e/2d|c2AF3/2G/2A|B2GG3/2^F/2G|A2^FD2G|
B2cd3/2e/2d|c2AF3/2G/2A|B3/2A/2G^F3/2=E/2F|G3D3|
f3f2=e/2d/2|c2AF3/2G/2A|B2GG3/2^F/2G|A2^FD3|
f3f2=e/2d/2|c2AF3/2G/2A|B2G^F3/2=E/2F|G3G2|]
`);
/** One chord per half bar (three beats). */
const H = prog(`
  Gm Gm | F F | Eb D | D D | Gm Gm | F F | Gm D | Gm Gm |
  Bb Bb | F F | Eb D | D D | Bb Bb | F F | Gm D | Gm Gm`);
const PASS = 96; // beats per verse, after the one-beat upbeat
const START = 1; // the first downbeat, after the upbeat
const pass = (i: number) => START + i * PASS;
const GMIN = [7, 9, 10, 0, 2, 3, 5];

const melody = (i: number, shift = 0): Note[] => TUNE.notes.map((n) => ({ ...n, b: n.b - 1 + pass(i), p: n.p.map((p) => p + shift) }));
/** A third below each note (chromatic notes stay single). */
const thirds = (notes: Note[]): Note[] =>
  notes.map((n) => {
    const low = diatonic([n], GMIN, -2)[0].p[0];
    return low === n.p[0] ? n : { ...n, p: [low, n.p[0]] };
  });
/** Lute: a bass note then the chord broken upwards, in eighth notes. */
const lute = (i: number, v: number) => comp(H, 3, pass(i), 'x.x.x.x.x.x.', (c) => [bassOf(c, 'D2'), ...voicing(c, 'D3')], { arp: [0, 1, 2, 3, 2, 1], v });
const viols = (i: number, v: number) => comp(H, 3, pass(i), 'x-----------', (c) => nearVoicing(c, 'D3'), { v });
const bass = (i: number, v: number) => comp(H, 3, pass(i), 'x-------x...', (c) => [bassOf(c, 'G1')], { v });

/** Tabor: a long-short dance pulse, heavier in the last verse. */
function tabor(): Hit[] {
  const out: Hit[] = [];
  for (let b = pass(1); b < pass(3); b += 3) {
    const loud = b >= pass(2) ? 1 : 0.7;
    out.push({ b, k: 'tomLo', v: 0.7 * loud }, { b: b + 2, k: 'tomMid', v: 0.45 * loud });
    if (b >= pass(2)) out.push({ b: b + 1.5, k: 'rim', v: 0.3 }, { b, k: 'shaker', v: 0.35 });
  }
  return out;
}

export const greensleeves: SongDef = {
  id: 'greensleeves',
  name: 'Greensleeves',
  artist: 'Traditional',
  album: 'Songs of Old England',
  genre: 'Renaissance',
  year: '1580',
  composer: 'Traditional',
  loadingPhrase: 'Alas, my love, you do me wrong, to cast me off discourteously.',
  tempo: [{ beat: 0, bpm: 138 }, { beat: pass(3) - 6, bpm: 110 }],
  timeSigs: [{ beat: 0, num: 1, den: 4 }, { beat: 1, num: 6, den: 4 }],
  sections: [
    { beat: 0, name: 'Lute' },
    { beat: pass(1) - 1, name: 'Fiddle' },
    { beat: pass(1) + 48, name: 'Chorus' },
    { beat: pass(2) - 1, name: 'All Together' },
    { beat: pass(2) + 48, name: 'Last Chorus' },
  ],
  player: [
    { inst: 'clean', gain: 1.45, pan: -0.1, verb: 0.35, notes: melody(0) },
    // then the lute in thirds under the fiddle, and in octaves at the end
    { inst: 'clean', gain: 1.25, pan: -0.1, verb: 0.35, notes: thirds(melody(1)) },
    { inst: 'clean', gain: 1.25, pan: -0.1, verb: 0.35, notes: melody(2).map((n) => ({ ...n, p: [n.p[0] - 12, n.p[0]] })) },
  ],
  backing: [
    { inst: 'clean', gain: 0.55, pan: 0.2, verb: 0.35, notes: [...lute(0, 0.55), ...lute(1, 0.5), ...lute(2, 0.6), { b: pass(3), d: 4, p: [43, 50, 55, 58, 62], v: 0.6 }] },
    { inst: 'fiddle', tone: 0.55, gain: 0.8, pan: 0.3, verb: 0.4, notes: [...melody(1), ...melody(2, 12)] },
    { inst: 'strings', tone: 0.4, gain: 0.45, pan: -0.3, verb: 0.4, notes: [...viols(1, 0.45), ...viols(2, 0.55)] },
    { inst: 'strings', tone: 0.3, gain: 0.6, verb: 0.3, notes: [...bass(1, 0.6), ...bass(2, 0.65), { b: pass(3), d: 4, p: [31], v: 0.6 }] },
  ],
  drums: [{ kit: 'orchestral', hits: tabor(), gain: 1, verb: 0.35 }],
  solos: [],
  lengthBeats: pass(3) + 5,
  previewBeat: pass(1) - 1,
  art: { from: '#0f2a1a', to: '#4f8a3c', ink: '#f3ead0', motif: 'crest' },
};
