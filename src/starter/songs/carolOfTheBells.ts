import { bassOf, comp, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { grid, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Leontovych, Shchedryk, known as Carol of the Bells (1916; public domain), as a metal waltz in
// G minor. The four-note ostinato never stops; voices pile up on it over a falling bass.
const BAR = 3;
const bar = (n: number) => n * BAR;

const OSTINATO = 'Bb4:4 A4:2 Bb4:2 G4:4';
const UPPER = 'D5:4 C5:2 D5:2 Bb4:4';
const HIGH = 'G5:4 F5:2 G5:2 D5:4';
const BELLS = 'G5:2 G5 F5 Eb5 D5:4 | D5:2 D5 C5 Bb4 C5:4 | C5:2 C5 D5 C5 G4:4 | G4:2 A4 Bb4 C5 D5:4';
/** the bass falls a step every bar under the unchanging ostinato */
const FALL_H = prog('Gm Gm/F Eb D');
/** What the strings hold over it: minor chords over the falling bass, so they never rub the ostinato's G and B-flat. */
const STRINGS_H: Record<string, string> = { Gm: 'Gm', 'Gm/F': 'Gm/F', Eb: 'Cm/Eb', D: 'Gm/D' };

const times = (s: string, n: number) => Array(n).fill(s).join(' ');
const chugs = (h: string[], from: number, v = 0.75) => comp(h, BAR, bar(from), 'x.x.x.x.x.x.', (c) => powerOf(c, 'E2'), { v });
const pads = (h: string[], from: number) => comp(h.map((c) => STRINGS_H[c] ?? c), BAR, bar(from), 'x-----------', (c) => voicing(c, 'G3'), { v: 0.55 });
const bass = (h: string[], from: number) => comp(h, BAR, bar(from), 'x.x.x.x.x.x.', (c) => [bassOf(c, 'D1')], { v: 0.8 });
const fall = (n: number) => Array.from({ length: n }, (_, i) => FALL_H[i % 4]);
const METAL = { kick: 'x.x.x.x.x.x.', snare: '....X.......', ride: 'x...x...x...' };
const BLAST = { kick: 'xxxxxxxxxxxx', snare: '....X...X...', ride: 'x.x.x.x.x.x.' };

// Bar map: bells 0, band 8, upper voice 24, carol 40, stampede 56, ostinato 72, end 80.
function drums(): Hit[] {
  return [
    ...drumBars({ ride: 'x...x...x...' }, bar(4), 3, { beats: BAR }),
    ...drumBars({ snare: 'x.x.xxxxXXXX' }, bar(7), 1, { beats: BAR }),
    ...drumBars(METAL, bar(8), 16, { beats: BAR, crash: true }),
    ...drumBars(METAL, bar(24), 16, { beats: BAR, crash: true }),
    ...drumBars({ ...METAL, snare: '....X...X...' }, bar(40), 16, { beats: BAR, crash: true }),
    ...drumBars(BLAST, bar(56), 16, { beats: BAR, crash: true }),
    ...drumBars(METAL, bar(72), 8, { beats: BAR, crash: true }),
    ...grid({ crash: 'X...X...X...', kick: 'X...X...X...', snare: 'X...X...X...' }, bar(80)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X', tomLo: 'X' }, bar(81)),
  ];
}

const END: Note[] = seq('G2^5!:4 G2^5! G2^5! | G2^5!:12', bar(80));

export const carolOfTheBells: SongDef = {
  id: 'carol-of-the-bells',
  name: 'Carol of the Bells',
  artist: 'Mykola Leontovych',
  album: 'Shchedryk',
  genre: 'Classical Metal',
  year: '1916',
  composer: 'Mykola Leontovych',
  loadingPhrase: 'Four notes, over and over. Lock in and let the band build around you.',
  tempo: [{ beat: 0, bpm: 168 }],
  timeSigs: [{ beat: 0, num: 3, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Bells' },
    { beat: bar(8), name: 'The Band' },
    { beat: bar(24), name: 'Second Voice' },
    { beat: bar(40), name: 'The Carol' },
    { beat: bar(56), name: 'Stampede' },
    { beat: bar(72), name: 'Last Bells' },
  ],
  player: [
    { inst: 'pluck', tone: 0.6, gain: 1.1, verb: 0.3, echo: 0.2, notes: seq(times(OSTINATO, 8), bar(0)) },
    { inst: 'lead', tone: 0.6, gain: 1, verb: 0.2, echo: 0.1, notes: [...seq(times(OSTINATO, 16), bar(8)), ...seq(times(UPPER, 8) + ' ' + times(HIGH, 8), bar(24)), ...seq(times(BELLS, 4), bar(40)), ...seq(times(OSTINATO, 8), bar(72), { transpose: 12, v: 0.9 })] },
    { inst: 'drive', tone: 0.6, gain: 1, verb: 0.06, notes: [...chugs(fall(16), 56), ...END] },
  ],
  backing: [
    { inst: 'bell', gain: 0.45, pan: 0.25, verb: 0.5, echo: 0.3, notes: [...seq(times(OSTINATO, 8), bar(0), { transpose: 12, v: 0.5 }), ...seq(times(OSTINATO, 32), bar(24), { transpose: 12, v: 0.45 }), ...seq(times(OSTINATO, 16), bar(56), { transpose: 12, v: 0.5 })] },
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.05, notes: [...chugs(fall(16), 8, 0.65), ...chugs(fall(16), 24, 0.65), ...chugs(fall(16), 40, 0.65), ...chugs(fall(8), 72, 0.7)] },
    { inst: 'strings', gain: 0.8, pan: -0.25, verb: 0.45, notes: [...pads(fall(8), 0), ...pads(fall(64), 8), ...pads(fall(8), 72)] },
    { inst: 'choir', tone: 0.35, gain: 0.7, verb: 0.5, notes: [...pads(fall(16), 40), ...pads(fall(16), 56)] },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...bass(fall(72), 8), ...seq('G1:4 G1 G1 | G1:12', bar(80))] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.55 }],
  solos: [],
  lengthBeats: bar(82),
  previewBeat: bar(8),
  art: { from: '#06121c', to: '#1f5c70', ink: '#e6fbff', motif: 'rings' },
};
