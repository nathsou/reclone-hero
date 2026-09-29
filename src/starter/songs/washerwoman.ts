import { abc } from '../abc.ts';
import { bassOf, comp, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { grid } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// The Irish Washerwoman, the jig (18th century; public domain), three times round a session
// that grows into a Celtic rock band: fiddle, then banjo, then electric guitar, a little faster
// each time. Melody after the transcription on thesession.org (tune 92).
const TUNE = abc(`
M:6/8
L:1/8
K:G
|:BGG DGG|BGB dcB|cAA EAA|cAc edc|BGG DGG|BGB dcB|cBc Adc|BGG G3:|
|:BGG DGG|BGB BAG|AFF DFF|AFA AGF|EGG DGG|CGG B,GG|cBc Adc|BGG G3:|
`);
const A = prog('G G | G G | Am Am | D D | G G | G G | C D | G G');
const B = prog('G G | G G | D D | D D | C G | C G | C D | G G');
/** One chord every dotted quarter (1.5 beats), for a whole time through (AABB). */
const H = [...A, ...A, ...B, ...B];
const PASS = TUNE.length; // 96 beats
const INTRO = 6; // two bars of bodhrán
const pass = (i: number) => INTRO + i * PASS;
const END = pass(3);

const tune = (i: number, shift = 0): Note[] => TUNE.notes.map((n) => ({ ...n, b: n.b + pass(i), p: n.p.map((p) => p + shift) }));
const strum = (i: number, v: number) => comp(H, 1.5, pass(i), 'x.x', (c) => voicing(c, 'G3'), { v, step: 0.5 });
const bass = (i: number, v: number) => comp(H, 1.5, pass(i), 'x..', (c) => [bassOf(c, 'E1')], { v, step: 0.5 });
const chugs = (i: number) => comp(H, 1.5, pass(i), 'xmm', (c) => [bassOf(c, 'E2'), bassOf(c, 'E2') + 7, bassOf(c, 'E2') + 12], { v: 0.75, step: 0.5 });

const BODHRAN = { tomLo: 'X..X..', tomMid: '.xx.xx' };
const JIG_ROCK = { kick: 'x..x..', snare: '...X..', hat: 'x.xx.x' };
function drums(): Hit[] {
  const bars = (g: Record<string, string>, from: number, n: number, crash = false) => drumBars(g, from, n, { beats: 3, step: 0.5, crash });
  return [
    ...bars(BODHRAN, 0, 2),
    ...bars(BODHRAN, pass(0), 32),
    ...bars({ ...BODHRAN, shaker: 'xxxxxx', kick: 'x.....' }, pass(1), 32, true),
    ...bars(JIG_ROCK, pass(2), 16, true),
    ...bars({ ...JIG_ROCK, hat: '', ride: 'x.xx.x' }, pass(2) + 48, 15, true),
    ...grid({ snare: 'xxxxxx', tomLo: '.....X' }, END - 3, 0.5),
    ...grid({ crash: 'X', kick: 'X' }, END),
  ];
}

export const washerwoman: SongDef = {
  id: 'irish-washerwoman',
  name: 'The Irish Washerwoman',
  artist: 'Traditional',
  album: 'The Session',
  genre: 'Celtic',
  year: '1792',
  composer: 'Traditional',
  loadingPhrase: 'A jig counts in threes: one-two-three, four-five-six.',
  tempo: [
    { beat: 0, bpm: 168 },
    { beat: pass(1), bpm: 176 },
    { beat: pass(2), bpm: 184 },
  ],
  timeSigs: [{ beat: 0, num: 6, den: 8 }],
  sections: [
    { beat: 0, name: 'Bodhrán' },
    { beat: pass(0), name: 'Fiddle' },
    { beat: pass(1), name: 'Banjo' },
    { beat: pass(2), name: 'Plugged In' },
    { beat: pass(2) + 48, name: 'Last Time Round' },
  ],
  player: [
    { inst: 'fiddle', tone: 0.6, gain: 1.1, verb: 0.3, notes: tune(0) },
    { inst: 'banjo', gain: 1.1, pan: 0.1, verb: 0.2, notes: tune(1) },
    { inst: 'lead', tone: 0.6, gain: 1, verb: 0.2, echo: 0.06, notes: [...tune(2), { b: END, d: 2, p: [55, 62, 67], v: 1 }] },
  ],
  backing: [
    { inst: 'clean', gain: 0.55, pan: -0.3, verb: 0.3, notes: [...strum(0, 0.5), ...strum(1, 0.55)] },
    { inst: 'fiddle', tone: 0.55, gain: 0.7, pan: 0.35, verb: 0.3, notes: [...tune(1, -12).map((n) => ({ ...n, v: 0.6 })), ...tune(2, 12).map((n) => ({ ...n, v: 0.65 }))] },
    { inst: 'drive', tone: 0.45, gain: 0.5, verb: 0.05, notes: chugs(2) },
    { inst: 'pickbass', gain: 0.95, verb: 0, notes: [...bass(1, 0.7), ...bass(2, 0.8), { b: END, d: 2, p: [31], v: 0.9 }] },
    { inst: 'accordion', gain: 0.85, pan: -0.35, verb: 0.3, notes: comp(H, 1.5, pass(2), 'x-.', (c) => voicing(c, 'B3'), { v: 0.5, step: 0.5 }) },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.75 }],
  solos: [],
  lengthBeats: END + 3,
  previewBeat: pass(1),
  art: { from: '#0b2e1f', to: '#e39a2d', ink: '#fdf6e3', motif: 'rings' },
};
