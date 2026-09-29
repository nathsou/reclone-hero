import { drumBars, FOUR_FLOOR, HOUSE_OPEN } from '../patterns.ts';
import { arp, chord, grid, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Electro house in F minor, 126 BPM, over i–VI–III–VII (Fm Db Ab Eb). The player picks out the
// arpeggios (long hammer-on runs on Expert), the supersaw hook in the drops, and a bell melody in the
// breakdown.
const bar = (n: number) => n * 4;

// arpeggio voicings, voice-led to stay around F4–F5
const ARP = ['F4+Ab4+C5', 'F4+Ab4+Db5', 'Eb4+Ab4+C5', 'Eb4+G4+Bb4'].map(chord);
const PAD = ['F3+Ab3+C4+Eb4', 'Db3+F3+Ab3+C4', 'Eb3+Ab3+C4+Eb4', 'Eb3+G3+Bb3+D4'];
const ROOT = ['F2', 'Db2', 'Ab1', 'Eb2'];
const SUB = ['F1', 'Db2', 'Ab1', 'Eb2'];
const PATTERN = [0, 2, 1, 2, 3, 2, 1, 2];

/** Chord index of each bar, cycling the four-chord loop. */
const cycle = (bars: number) => Array.from({ length: bars }, (_, i) => i % 4);

function arps(from: number, bars: number, step: 0.5 | 0.25, v = 0.75, order = cycle(bars)): Note[] {
  return arp(
    order.map((c) => ARP[c]),
    PATTERN,
    step,
    4 / step,
    bar(from),
    v,
  );
}

function pads(from: number, bars: number, order = cycle(bars)): Note[] {
  return order.flatMap((c, i) => seq(`${PAD[c]}:16`, bar(from + i), { v: 0.7 }));
}

const offbeat = (n: string) => `.:2 ${n}:2 . ${n} . ${n} . ${n}`;
function houseBass(from: number, bars: number): Note[] {
  return cycle(bars).flatMap((c, i) => seq(offbeat(ROOT[c]), bar(from + i), { v: 0.8 }));
}
function quarterBass(from: number, bars: number): Note[] {
  return cycle(bars).flatMap((c, i) => seq(`(${ROOT[c]}:4)x4`, bar(from + i), { v: 0.75 }));
}
function subs(from: number, bars: number, order = cycle(bars)): Note[] {
  return order.flatMap((c, i) => seq(`${SUB[c]}:16`, bar(from + i), { v: 0.8 }));
}

const HOOK_A = 'C5:3 C5 Ab4:2 C5 Eb5 F5:4 | F5:3 Eb5 Db5:2 C5:4 Ab4 | C5:3 C5 Eb5:2 Ab5:4 G5:2 F5 | G5:6 F5:2 Eb5:4 Bb4';
const HOOK_B = 'C5:3 C5 Ab4:2 C5 Eb5 F5 G5 | Ab5:3 G5 F5:2 Eb5 F5 Db5:4 | C5:3 Eb5 Ab5:2 C6:4 Bb5:2 Ab5 | G5:4 Bb5 G5:2 F5 Eb5:4';
const HOOK = `${HOOK_A} ${HOOK_B} ${HOOK_A} ${HOOK_B}`;
const BELLS = 'C5:8 Ab4 | F5:8 Db5 | Eb5:8 C5 | Bb4:16 | C5:8 Ab4 | F5:8 Ab5 | G5:8 Eb5 | F5:16';
// outro chords: Fm Db Eb Fm
const OUTRO = [0, 1, 3, 0];

function drums(): Hit[] {
  const offHats = { hat: '..x...x...x...x.', shaker: 'x.x.x.x.x.x.x.x.' };
  const kickHats = { kick: 'x...x...x...x...', hat: '..x...x...x...x.' };
  return [
    ...drumBars(offHats, bar(4), 4),
    ...drumBars(kickHats, bar(8), 4, { crash: true }),
    ...drumBars(FOUR_FLOOR, bar(12), 4, { fill: 'build4' }),
    ...drumBars(HOUSE_OPEN, bar(16), 4, { crash: true }),
    ...drumBars(HOUSE_OPEN, bar(20), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(HOUSE_OPEN, bar(24), 4, { crash: true }),
    ...drumBars(HOUSE_OPEN, bar(28), 4, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X' }, bar(32)),
    ...drumBars({ shaker: 'x.x.x.x.x.x.x.x.', rim: '....x.......x...' }, bar(36), 4),
    ...drumBars(kickHats, bar(40), 4, { crash: true }),
    ...drumBars(FOUR_FLOOR, bar(44), 4, { fill: 'build4' }),
    ...drumBars(HOUSE_OPEN, bar(48), 4, { crash: true }),
    ...drumBars(HOUSE_OPEN, bar(52), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(HOUSE_OPEN, bar(56), 4, { crash: true }),
    ...drumBars(HOUSE_OPEN, bar(60), 4, { crash: true, fill: 'roll2' }),
    ...drumBars(FOUR_FLOOR, bar(64), 4, { crash: true }),
    ...grid({ crash: 'X', kick: 'X' }, bar(68)),
  ];
}

export const neonSkyline: SongDef = {
  id: 'neon-skyline',
  name: 'Neon Skyline',
  artist: 'Night Arcade',
  album: 'Afterglow',
  genre: 'Electronic',
  year: '2026',
  loadingPhrase: 'Arpeggios are hammer-on runs on Expert: strum the first note, then just fret.',
  tempo: [{ beat: 0, bpm: 126 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Intro' },
    { beat: bar(8), name: 'Build-Up' },
    { beat: bar(16), name: 'Drop' },
    { beat: bar(32), name: 'Breakdown' },
    { beat: bar(40), name: 'Build-Up 2' },
    { beat: bar(48), name: 'Drop 2' },
    { beat: bar(64), name: 'Outro' },
  ],
  player: [
    {
      inst: 'pluck',
      tone: 0.65,
      gain: 1,
      verb: 0.2,
      echo: 0.25,
      notes: [...arps(0, 8, 0.5), ...arps(8, 8, 0.25), ...arps(40, 4, 0.5), ...arps(44, 4, 0.25), ...arps(64, 4, 0.5)],
    },
    { inst: 'supersaw', tone: 0.6, gain: 1, verb: 0.25, echo: 0.2, notes: [...seq(HOOK, bar(16)), ...seq(HOOK, bar(48))] },
    { inst: 'bell', gain: 1, verb: 0.45, echo: 0.3, notes: [...seq(BELLS, bar(32)), ...seq('C5:16 Db5 Bb4 F5', bar(68))] },
  ],
  backing: [
    {
      inst: 'pad',
      tone: 0.45,
      gain: 1,
      verb: 0.35,
      pump: 0.6,
      notes: [...pads(0, 32), ...pads(32, 8), ...pads(40, 24), ...pads(64, 4), ...pads(68, 4, OUTRO)],
    },
    { inst: 'pluck', tone: 0.3, gain: 0.45, pan: 0.3, verb: 0.2, echo: 0.3, pump: 0.3, notes: [...arps(16, 16, 0.25, 0.6), ...arps(48, 16, 0.25, 0.6)] },
    { inst: 'synthbass', tone: 0.55, gain: 1, verb: 0, notes: [...quarterBass(8, 8), ...houseBass(16, 16), ...quarterBass(40, 8), ...houseBass(48, 16), ...houseBass(64, 4)] },
    { inst: 'subbass', gain: 0.8, verb: 0, pump: 0.4, notes: [...subs(16, 16), ...subs(32, 8), ...subs(48, 16), ...subs(68, 4, OUTRO)] },
  ],
  drums: [{ kit: 'electro', hits: drums() }],
  solos: [],
  lengthBeats: bar(72),
  previewBeat: bar(16),
  art: { from: '#0b0630', to: '#ff2e88', ink: '#7ef9ff', motif: 'grid' },
};
