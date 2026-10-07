import { perform } from '../performance.ts';
import { comp, nearVoicing, prog } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { grid, loop, roots, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Progressive metal in E minor, in 7/8 counted 2+2+3 (quarter = 150): a chugging main riff, a
// chordal second riff, a clean interlude, a solo, four bars of half-time 4/4, and the riff again.
// A 7/8 bar is 3.5 beats, fourteen sixteenths.
const B7 = 3.5;
const RIFF_A = [
  'E2^5s!:2 E2*:1 E2* E2^5s!:2 E2*:1 E2* G2^5s!:2 E2*:1 E2* A2^5s:2',
  'E2^5s!:2 E2*:1 E2* E2^5s!:2 E2*:1 E2* A#2^5s!:2 A2^5s:2 G2^5s:2',
].join(' ');
const RIFF_B = 'C3^5!:4 B2^5:4 G2^5!:6 | A2^5!:4 G2^5:4 F#2^5!:2 F2^5:2 E2^5:2';
const HITS = 'E2^5!:6 .:2 E2^5!:6 | E2^5!:6 .:2 G2^5!:2 A2^5!:2 A#2^5!:2';
const BREAKDOWN = 'E2^5!:4 .:2 E2^5*:1 E2^5* .:2 E2^5!:2 F2^5:4 | E2^5!:4 .:2 E2^5*:1 E2^5* .:2 G2^5!:2 F#2^5:4';
const SOLO = [
  'B4:2 E5 F#5 G5:4 F#5:2 E5:2',
  'D#5:2 E5 F#5 B5:6 A5:2',
  'G5:1 F#5 E5 D#5 E5 F#5 G5 A5 B5:2 A5 G5',
  'F#5/2:6 E5:2 D#5:2 B4:4',
  '(E5:1 G5 B5 G5)x2 E6/2:6',
  'D#6:2 C6 B5 A5 G5 F#5 E5',
  '(B4:1 D#5 F#5 A5 C6 A5 F#5)x2',
  'E5:14',
].join(' ');
const LINE = 'B4:14 | A4:7 G4:7 | E5:14 | F#5:7 D#5:7 | B4:14 | A4:7 G4:7 | C5:14 | B4:14';
const CLEAN_H = prog('Em7 Cmaj7 Am7 Bm7 Em7 Cmaj7 Am7 B7');

// Timeline: 36 bars of 7/8, four of 4/4, then seventeen more of 7/8.
const bar = (n: number) => (n <= 36 ? n * B7 : n <= 40 ? 36 * B7 + (n - 36) * 4 : 36 * B7 + 16 + (n - 40) * B7);
const [INTRO, A1, B1, CLEAN, SOLO_AT, BREAK, B2, A2, END] = [0, 4, 12, 20, 28, 36, 40, 48, 56].map(bar);

const RIFF_DRUMS = { kick: 'x.x.x.x.x.x.x.', snare: '....X.....X...', ride: 'x...x...x.x.x.' };
const CLEAN_DRUMS = { kick: 'x.......x.....', rim: '....x.....x...', ride: 'x.x.x.x.x.x.x.' };
function drums(): Hit[] {
  const bars = (g: Record<string, string>, at: number, n: number, crash = false) => drumBars(g, at, n, { beats: B7, crash });
  return [
    ...grid({ crash: 'x.....x.......', kick: 'x.....x.......' }, INTRO),
    ...grid({ crash: 'x.....x.x.x...', kick: 'x.....x.x.x...', snare: '..........xxxx' }, INTRO + B7),
    ...bars({ ...RIFF_DRUMS, ride: 'x.x.x.x.x.x.x.' }, INTRO + 2 * B7, 2),
    ...bars(RIFF_DRUMS, A1, 8, true),
    ...bars({ kick: 'x...x...x.....', snare: '....X.....X...', crash: 'x...x...x.....' }, B1, 8, true),
    ...bars(CLEAN_DRUMS, CLEAN, 8),
    ...bars(RIFF_DRUMS, SOLO_AT, 8, true),
    ...drumBars({ kick: 'x.....x.x.......', snare: '........X.......', crash: 'x.......x.......' }, BREAK, 4, { crash: true, fill: 'build4' }),
    ...bars({ kick: 'x.x.x.x.x.x.x.', snare: '....X.....X...', crash: 'x...x...x.....' }, B2, 8, true),
    ...bars(RIFF_DRUMS, A2, 8, true),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, END),
  ];
}

const riffA = (at: number, times: number) => loop(seq(RIFF_A), times, 2 * B7, at);
const riffB = (at: number) => loop(seq(RIFF_B), 4, 2 * B7, at);
const cleanArps = comp(CLEAN_H, B7, CLEAN, 'x.x.x.x.x.x.x.', (c) => nearVoicing(c, 'E3'), { arp: [0, 1, 2, 3, 2, 1, 0], v: 0.65 });

export const seventhGear: SongDef = perform({
  id: 'seventh-gear',
  name: 'Seventh Gear',
  artist: 'Axiom Drift',
  album: 'Odd Meters',
  genre: 'Progressive Metal',
  year: '2026',
  loadingPhrase: 'Seven: count it one-two, one-two, one-two-three.',
  tempo: [{ beat: 0, bpm: 150 }],
  timeSigs: [
    { beat: 0, num: 7, den: 8 },
    { beat: BREAK, num: 4, den: 4 },
    { beat: B2, num: 7, den: 8 },
  ],
  sections: [
    { beat: INTRO, name: 'Intro' },
    { beat: A1, name: 'Main Riff' },
    { beat: B1, name: 'Second Riff' },
    { beat: CLEAN, name: 'Clean Interlude' },
    { beat: SOLO_AT, name: 'Guitar Solo' },
    { beat: BREAK, name: 'Half Time' },
    { beat: B2, name: 'Second Riff, Again' },
    { beat: A2, name: 'Main Riff, Again' },
  ],
  player: [
    {
      inst: 'drive',
      tone: 0.6,
      gain: 0.75,
      verb: 0.05,
      notes: [...seq(HITS, INTRO), ...riffA(INTRO + 2 * B7, 1), ...riffA(A1, 4), ...riffB(B1), ...seq(`${BREAKDOWN} ${BREAKDOWN}`, BREAK), ...riffB(B2), ...riffA(A2, 4), ...seq('E2^5!:14', END)],
    },
    { inst: 'clean', gain: 1.4, verb: 0.35, echo: 0.25, notes: cleanArps },
    { inst: 'lead', tone: 0.6, gain: 1.3, verb: 0.25, echo: 0.1, notes: seq(SOLO, SOLO_AT) },
  ],
  backing: [
    { inst: 'drive', tone: 0.4, gain: 0.28, pan: -0.3, verb: 0.05, notes: [...riffA(A1, 4), ...riffB(B1), ...riffA(SOLO_AT, 4), ...seq(`${BREAKDOWN} ${BREAKDOWN}`, BREAK), ...riffB(B2), ...riffA(A2, 4)] },
    { inst: 'pickbass', tone: 0.6, gain: 1, verb: 0, notes: roots([...seq(HITS, INTRO), ...riffA(INTRO + 2 * B7, 1), ...riffA(A1, 4), ...riffB(B1), ...riffA(SOLO_AT, 4), ...seq(`${BREAKDOWN} ${BREAKDOWN}`, BREAK), ...riffB(B2), ...riffA(A2, 4), ...seq('E2:14', END)], -12) },
    { inst: 'pickbass', tone: 0.4, gain: 0.9, verb: 0.1, notes: comp(CLEAN_H, B7, CLEAN, 'x-----x-------', (c) => [nearVoicing(c, 'E2')[0] - 12], { v: 0.6 }) },
    { inst: 'pad', tone: 0.4, gain: 0.5, verb: 0.3, notes: [...comp(CLEAN_H, B7, CLEAN, 'x-------------', (c) => nearVoicing(c, 'B3'), { v: 0.4 }), ...comp(prog('Em Em C D'), 4, BREAK, 'x---------------', (c) => nearVoicing(c, 'B3'), { v: 0.5 })] },
    { inst: 'lead', tone: 0.5, gain: 0.55, pan: 0.3, verb: 0.3, echo: 0.15, notes: [...seq(LINE, B1), ...seq(LINE, B2, { v: 0.65 })] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[SOLO_AT, BREAK]],
  lengthBeats: END + 3.5,
  previewBeat: A1,
  art: { from: '#0a0a0a', to: '#4a5d23', ink: '#d9ff66', motif: 'shards' },
}, { bar: 3.5, phrase: 14, shape: [0.88, 1, 0.86], gate: 0.8, accent: 0.08 });
