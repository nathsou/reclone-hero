import { abc, harmony } from '../abc.ts';
import type { AbcTune } from '../abc.ts';
import { bassOf, comp, nearVoicing } from '../arrange.ts';
import { grid } from '../score.ts';
import type { Hit, Note, Part, SongDef } from '../score.ts';

// Jacques Offenbach, the Infernal Galop from Orpheus in the Underworld (1858; public domain), the
// Can-Can, played straight by a pit orchestra: twice through, the second time with trumpets and
// faster. After John Chambers' transcription, with its repeats and endings written out.
const head = 'M:2/4\nL:1/16\n';
const read = (key: string, text: string) => abc(`${head}K:${key}\n${text}`);
const INTRO = read('D', '"A"A4 A4|A2A2 A2A2|');
const A1 = read('D', '"A"AEEF "D"EDDF|"G"GBdB "D"BAA2|"A"BCCB "D"ADDF|"E"FEFE "A"FEFE|');
const A2 = read('D', '"A"AEEF "D"EDDF|"G"GBdB "D"BAA2|"A"BCCB "D"ADDF|"A"E2FE "D"EDD2|');
const B1 = read('D', '"D"f2d2 B2A2|"A"AEFG "D"FED2|"D"f2d2 B2A2|"A"^GABc "D"edd2|');
const B2 = read('D', '"D"f2d2 B2A2|"A"AEFG "D"FED2|"D"f2d2 B2A2|"A"^GABc "D"dA "A"cA|"D"dA "A"cA "D"dA "A"cA|"D"d>d d>d d>d d>d|"D"d>d d>d "D7"d>d d>d|');
const CAN = (last: string) => read('G', `"G"G4 "D7"AcBA|"G"d2d2 deBc|"D"A2A2 "D7"AcBA|${last}|`);
const C1 = CAN('"G"Ggfe "D7"dcBA');
const C2 = CAN('"G"Gd"D"AB "G"G2"D"D2');
const C4 = CAN('"G"Gd"D"AB "G"G4');
const ROUND = [A1, A2, B1, B2, C1, C2, C1];

interface Placed {
  t: AbcTune;
  at: number;
}
/** Lay the strains end to end. */
function layout(list: AbcTune[], from: number): Placed[] {
  let at = from;
  return list.map((t) => {
    const p = { t, at };
    at += t.length;
    return p;
  });
}
const PLAN = layout([INTRO, ...ROUND, C2, ...ROUND, C4], 0);
const R2 = PLAN[ROUND.length + 2].at; // second time round
const C_1 = PLAN[5].at;
const C_2 = PLAN[ROUND.length + 6].at;
const END = PLAN[PLAN.length - 1].at + C4.length;

const tune = (list: Placed[], shift = 0): Note[] => list.flatMap(({ t, at }) => t.notes.map((n) => ({ ...n, b: n.b + at, p: n.p.map((p) => p + shift) })));
const inRange = (from: number, to: number) => PLAN.filter((p) => p.at >= from - 1e-6 && p.at < to - 1e-6);

/** Oom-pah: bass on the beat, chord on the off-beat, one chord a beat. */
function oompah(from: number, to: number, v: number): { bass: Note[]; chords: Note[] } {
  const bass: Note[] = [];
  const chords: Note[] = [];
  for (const { t, at } of inRange(from, to)) {
    const h = harmony(t, 1, t.chords[0]?.name ?? 'D');
    bass.push(...comp(h, 1, at, 'x...', (c) => [bassOf(c, 'E1')], { v }));
    chords.push(...comp(h, 1, at, '..x.', (c) => nearVoicing(c, 'A3'), { v: v * 0.8 }));
  }
  return { bass, chords };
}
const round1 = oompah(0, R2, 0.7);
const round2 = oompah(R2, END, 0.85);

function drums(): Hit[] {
  const out: Hit[] = [];
  for (const { at } of PLAN) out.push({ b: at, k: 'crash', v: at >= R2 ? 0.9 : 0.6 });
  for (let b = PLAN[1].at; b < END; b++) {
    const loud = b >= C_1 && b < R2 ? 1 : b >= R2 ? 1.1 : 0.7;
    out.push({ b, k: 'kick', v: 0.6 * loud }, { b: b + 0.5, k: 'snare', v: 0.35 * loud });
  }
  out.push(...grid({ crash: 'X', kick: 'X', snare: 'X' }, END));
  return out;
}

/** Timpani on the tonic and dominant under the can-can, a roll into the last chord. */
function timpani(): Note[] {
  const out: Note[] = [];
  for (const { t, at } of [...inRange(C_1, R2), ...inRange(C_2, END)]) {
    harmony(t, 2, 'G').forEach((c, i) => out.push({ b: at + i * 2, d: 1, p: [bassOf(c.replace('7', ''), 'F2')], v: 0.8 }));
  }
  for (let i = 0; i < 12; i++) out.push({ b: END - 2 + i / 6, d: 1 / 6, p: [43], v: 0.5 + i / 30 });
  out.push({ b: END, d: 2, p: [43], v: 1 });
  return out;
}

const STAB = (inst: Part['inst'], p: number[], gain: number): Part => ({ inst, gain, verb: 0.35, notes: [{ b: END, d: 1.5, p, v: 1 }] });

export const canCan: SongDef = {
  id: 'can-can',
  name: 'Can-Can (Infernal Galop)',
  artist: 'Jacques Offenbach',
  album: 'Orpheus in the Underworld',
  genre: 'Romantic',
  year: '1858',
  composer: 'Jacques Offenbach',
  loadingPhrase: 'Kick high on the long notes. Keep up on the short ones.',
  tempo: [
    { beat: 0, bpm: 112 },
    { beat: R2, bpm: 120 },
    { beat: C_2, bpm: 128 },
  ],
  timeSigs: [{ beat: 0, num: 2, den: 4 }],
  sections: [
    { beat: 0, name: 'Curtain Up' },
    { beat: PLAN[1].at, name: 'Galop' },
    { beat: PLAN[3].at, name: 'Second Strain' },
    { beat: C_1, name: 'Can-Can' },
    { beat: R2, name: 'Galop, Trumpets' },
    { beat: PLAN[ROUND.length + 4].at, name: 'Second Strain, Faster' },
    { beat: C_2, name: 'Can-Can, Faster' },
    { beat: PLAN[PLAN.length - 1].at, name: 'Finale' },
  ],
  player: [
    { inst: 'fiddle', tone: 0.6, gain: 1.1, verb: 0.25, notes: tune(PLAN.filter((p) => p.at < R2)) },
    { inst: 'brass', tone: 0.65, gain: 1, verb: 0.25, notes: tune(PLAN.filter((p) => p.at >= R2)) },
    STAB('brass', [55, 59, 62, 67], 1),
  ],
  backing: [
    { inst: 'fiddle', tone: 0.6, gain: 0.55, pan: -0.3, verb: 0.3, notes: [...tune(inRange(C_1, R2), 12), ...tune(inRange(R2, END), 12)] },
    { inst: 'strings', tone: 0.45, gain: 0.55, pan: 0.25, verb: 0.3, notes: [...round1.chords, ...round2.chords] },
    { inst: 'brass', tone: 0.35, gain: 0.6, pan: -0.1, verb: 0.25, notes: round2.chords },
    { inst: 'strings', tone: 0.35, gain: 0.8, verb: 0.2, notes: [...round1.bass, ...round2.bass] },
    { inst: 'brass', tone: 0.3, gain: 0.55, verb: 0.2, notes: round2.bass.map((n) => ({ ...n, p: [n.p[0] + 12] })) },
    { inst: 'timpani', gain: 0.85, verb: 0.3, notes: timpani() },
    STAB('strings', [43, 50, 55, 59, 62, 67, 71], 0.8),
  ],
  drums: [{ kit: 'orchestral', hits: drums(), gain: 0.7, verb: 0.35 }],
  solos: [],
  lengthBeats: END + 3,
  previewBeat: C_1,
  art: { from: '#3a0716', to: '#f0507a', ink: '#fff0c8', motif: 'rings' },
};
