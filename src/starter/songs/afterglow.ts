import { abc } from '../abc.ts';
import { bassOf, comp, nearVoicing, parseChord, prog, voicing } from '../arrange.ts';
import { drumBars, FOUR_FLOOR, HOUSE_OPEN } from '../patterns.ts';
import { transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Uplifting trance in A minor, 138 BPM: plucked arpeggios, a breakdown on pads, a snare-roll build
// and a supersaw anthem over a pumping drop.
const LEAD = abc(`
M:4/4
L:1/8
K:Am
a2 a2 g2 a2 | c'3 a3 g2 | g2 g2 e2 g2 | d'3 b3 g2 |
a2 a2 g2 a2 | c'3 d'3 e'2 | e'3 d'3 c'2 | b3 c'3 d'2 |]
`);
const H = prog('Am F C G Am F C G');
const bar = (n: number) => n * 4;
// Bar map: intro 0, arps 16, breakdown 32, build 40, drop 48, outro 64, end 72.
const [INTRO, ARPS, BREAK, BUILD, DROP, OUTRO, END] = [0, 16, 32, 40, 48, 64, 72].map(bar);

const place = (notes: Note[], at: number): Note[] => notes.map((n) => ({ ...n, b: n.b + at }));
const melody = (at: number) => transpose(place(LEAD.notes, at), -12);
/** Every section starts on a multiple of eight bars: the chord of the bar a beat falls in. */
const chordAt = (b: number) => parseChord(H[Math.floor(b / 4) % H.length]);
/** A second voice under the tune: the nearest note of the bar's chord a third to a sixth below. */
const harmony = (notes: Note[]): Note[] =>
  notes.map((n) => {
    const c = chordAt(n.b);
    const pcs = c.intervals.map((i) => (c.root + i) % 12);
    const top = n.p[n.p.length - 1];
    for (let below = top - 3; below >= top - 9; below--) if (pcs.includes(((below % 12) + 12) % 12)) return { ...n, p: [below, top] };
    return n;
  });
const eightBars = (from: number, n: number) => [...Array(n)].map((_, i) => from + i * bar(8));
const arp16 = (at: number, v = 0.7) => comp(H, 4, at, 'xxxxxxxxxxxxxxxx', (c) => [...voicing(c, 'A3'), voicing(c, 'A3')[0] + 12], { arp: [0, 1, 2, 3, 2, 1, 2, 3], v });
const stabs = (at: number) => comp(H, 4, at, '..x...x...x...x.', (c) => nearVoicing(c, 'C4'), { v: 0.6 });
const offbeatBass = (at: number) => comp(H, 4, at, '..x...x...x...x.', (c) => [bassOf(c, 'E1')], { v: 0.85 });
const rollingBass = (at: number) => comp(H, 4, at, '.xxx.xxx.xxx.xxx', (c) => [bassOf(c, 'E1')], { v: 0.8 });
const pads = (at: number, v: number) => comp(H, 4, at, 'x---------------', (c) => nearVoicing(c, 'E4'), { v });

function drums(): Hit[] {
  const out: Hit[] = [
    ...drumBars({ kick: 'x...x...x...x...' }, INTRO, 8),
    ...drumBars(FOUR_FLOOR, INTRO + bar(8), 8, { crash: true }),
    ...drumBars(HOUSE_OPEN, ARPS, 16, { crash: true }),
    ...drumBars({ kick: 'x...x...x...x...', clap: '....x.......x...' }, BUILD, 4, { crash: true }),
    ...drumBars({ ...HOUSE_OPEN, ride: 'x.x.x.x.x.x.x.x.' }, DROP, 16, { crash: true }),
    ...drumBars(FOUR_FLOOR, OUTRO, 7, { crash: true }),
    { b: END - 4, k: 'crash', v: 0.9 },
    { b: END - 4, k: 'kick', v: 1 },
  ];
  // the build: a snare roll that doubles its speed every two bars and swells
  for (let i = 0; i < 16; i++) {
    const b = BUILD + bar(4) + i;
    const per = i < 8 ? 2 : i < 12 ? 4 : 8;
    for (let j = 0; j < per; j++) out.push({ b: b + j / per, k: 'snare', v: 0.35 + (0.6 * i) / 16 });
  }
  out.push({ b: DROP, k: 'crash', v: 1 });
  return out;
}

export const afterglow: SongDef = {
  id: 'afterglow-protocol',
  name: 'Afterglow Protocol',
  artist: 'Helios Array',
  album: 'Signal to Noise',
  genre: 'Trance',
  year: '2026',
  loadingPhrase: 'Hands up for the drop. Then hands back on the frets.',
  tempo: [{ beat: 0, bpm: 138 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: INTRO, name: 'Intro' },
    { beat: ARPS, name: 'Arpeggios' },
    { beat: BREAK, name: 'Breakdown' },
    { beat: BUILD, name: 'Build' },
    { beat: DROP, name: 'Drop' },
    { beat: DROP + bar(8), name: 'Drop, Higher' },
    { beat: OUTRO, name: 'Outro' },
  ],
  player: [
    { inst: 'pluck', tone: 0.6, gain: 1, verb: 0.3, echo: 0.25, notes: [...comp(H.slice(4), 4, INTRO + bar(4), '..x...x...x...x.', (c) => nearVoicing(c, 'C4'), { v: 0.45 }), ...eightBars(INTRO + bar(8), 1).flatMap(stabs), ...eightBars(ARPS, 2).flatMap((b) => arp16(b)), ...melody(BUILD), ...eightBars(OUTRO, 1).flatMap((b) => arp16(b, 0.6))] },
    { inst: 'piano', gain: 1.5, verb: 0.5, echo: 0.2, notes: melody(BREAK).map((n) => ({ ...n, p: n.p.map((p) => p + 12) })) },
    { inst: 'supersaw', tone: 0.65, gain: 1.4, verb: 0.35, echo: 0.2, notes: [...melody(DROP), ...harmony(melody(DROP + bar(8)).map((n) => ({ ...n, p: n.p.map((p) => p + 12) })))] },
  ],
  backing: [
    { inst: 'pad', tone: 0.45, gain: 0.7, verb: 0.5, pump: 0.6, notes: [...pads(INTRO, 0.4), ...pads(ARPS + bar(8), 0.45), ...pads(BREAK, 0.6), ...pads(BUILD, 0.6), ...pads(DROP, 0.55), ...pads(DROP + bar(8), 0.6), ...pads(OUTRO, 0.4)] },
    { inst: 'synthbass', tone: 0.5, gain: 0.9, verb: 0, pump: 0.3, notes: [...offbeatBass(INTRO + bar(8)), ...rollingBass(ARPS), ...rollingBass(ARPS + bar(8)), ...offbeatBass(BUILD), ...rollingBass(DROP), ...rollingBass(DROP + bar(8)), ...offbeatBass(OUTRO)] },
    { inst: 'pluck', tone: 0.45, gain: 0.5, pan: 0.3, verb: 0.3, echo: 0.3, notes: [...arp16(BREAK, 0.4), ...arp16(DROP, 0.5), ...arp16(DROP + bar(8), 0.55)] },
    { inst: 'subbass', tone: 0.3, gain: 0.7, verb: 0, notes: comp(H, 4, BREAK, 'x---------------', (c) => [bassOf(c, 'E1')], { v: 0.6 }) },
  ],
  drums: [{ kit: 'electro', hits: drums(), gain: 0.8 }],
  solos: [],
  lengthBeats: END,
  previewBeat: DROP,
  art: { from: '#12002b', to: '#00d4ff', ink: '#fdf0ff', motif: 'rings' },
};
