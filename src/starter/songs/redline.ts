import { BLAST, drumBars, GALLOP, HALF_TIME, PUNK, ROCK_DRIVE } from '../patterns.ts';
import { diatonic, grid, roots, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Fast punk-metal in D minor, 176 BPM: gallop riffs, hammer-on fills, a shred solo and a twin-guitar
// harmony. The hardest of the built-in songs on Expert; Easy stays on the downbeats.
const bar = (n: number) => n * 4;
const D_MINOR = [2, 4, 5, 7, 9, 10, 0];

const GALLOP_A = 'D2*:2 D2*:1 D2* D2*:2 D2*:1 D2* F2^5s:2 D2*:1 D2* G2^5s:2 F2^5s';
const GALLOP_B = 'D2*:2 D2*:1 D2* D2*:2 D2*:1 D2* A#2^5s:2 A2^5s G2^5s F2^5s';
const INTRO = `${GALLOP_A} ${GALLOP_B} ${GALLOP_A} ${GALLOP_B}`;

const POWER: Record<string, string> = { D: 'D3^5s', Bb: 'A#2^5s', C: 'C3^5s', A: 'A2^5s', F: 'F2^5s', G: 'G2^5s' };
const FULL: Record<string, string> = { D: 'D3^5', Bb: 'A#2^5', C: 'C3^5', A: 'A2^5', F: 'F2^5', G: 'G2^5' };
const ROOT: Record<string, string> = { D: 'D2', Bb: 'A#1', C: 'C2', A: 'A1', F: 'F1', G: 'G1' };
const VERSE_H = ['D', 'D', 'Bb', 'C', 'D', 'D', 'Bb', 'A'];
const CHORUS_H = ['Bb', 'C', 'D', 'D', 'Bb', 'C', 'A', 'A'];
const SOLO_H = ['D', 'Bb', 'C', 'A', 'D', 'Bb', 'C', 'A'];

const verseBar = (c: string) => `${POWER[c]}*:2 ${POWER[c]}* ${POWER[c]} ${POWER[c]}* ${POWER[c]}* ${POWER[c]} ${POWER[c]}* ${POWER[c]}`;
const chorusBar = (c: string) => `${FULL[c]}!:3 ${FULL[c]}:3 ${FULL[c]}:2 ${FULL[c]} ${FULL[c]} ${FULL[c]} ${FULL[c]}`;
const eighths = (m: Record<string, string>) => (c: string) => `(${m[c]}:2)x8`;

function progression(from: number, chords: string[], fn: (c: string) => string, v = 0.8): Note[] {
  return chords.flatMap((c, i) => seq(fn(c), bar(from + i), { v }));
}

const FILLS = [
  'D5:1 F5 G5 A5 G5 F5 D5 C5 D5 F5 G5 A5 C6:4',
  'A#5:2 A5 G5 F5 G5:4 A5',
  'D5:1 F5 G5 A5 C6 A5 G5 F5 G5 A5 C6 D6 F6:4',
  'E6/2:8 D6:4 C#6',
].join(' ');

const SHRED = [
  'D5:1 E5 F5 D5 E5 F5 G5 E5 F5 G5 A5 F5 G5 A5 A#5 G5',
  'A#5:1 A5 G5 A#5 A5 G5 F5 A5 G5 F5 E5 G5 F5 E5 D5 F5',
  'E5:2 G5 C6 G5 E5 G5 C6 E6',
  'C#6:4 A5:2 E5 C#5:4 E5:2 A5',
  'D6/2:6 C6:2 A5 F5 D5 F5',
  'D6:1 A#5 F5 A#5 D6 A#5 F5 A#5 D6 A#5 F5 A#5 D6 F6 D6 A#5',
  'E6:1 C6 G5 C6 E6 C6 G5 C6 E6 C6 G5 C6 E6 G6 E6 C6',
  'C#6:1 A5 E5 A5 C#6 A5 E5 A5 C#6 E6 A6:6',
].join(' ');
const HARMONY = ['A5:4 F5:2 G5 A5:4 D6', 'C6:4 A#5:2 A5 G5:4 F5', 'G5:4 E5:2 F5 G5:4 C6', 'A5:8 G5:4 E5', 'A5:4 F5:2 G5 A5:4 D6', 'C6:4 A#5:2 A5 G5:4 F5', 'G5:4 E5:2 F5 G5:4 C6', 'A5:4 C#6 E6 A6'].join(' ');

const BREAKDOWN_A = 'D2*:1 D2* .:2 D2*:1 D2* .:2 D2*:1 . D2* . F2^5s:2 D2*';
const BREAKDOWN_B = 'D2*:1 D2* .:2 D2*:1 D2* .:2 D2*:1 . D2* . G#2^5s:2 G2^5s';
const BREAKDOWN = `${BREAKDOWN_A} ${BREAKDOWN_B} ${BREAKDOWN_A} ${BREAKDOWN_B} ${BREAKDOWN_A} ${BREAKDOWN_B} ${BREAKDOWN_A} A2^5!:8 A2^5:2 A2^5 C#3^5s E3^5s`;

// Bar map: intro 0, verse 8, pre 24, chorus 28, verse 36, pre 44, chorus 48, solo 56,
// harmony 64, breakdown 72, chorus 80, outro 88, end 92.
function drums(): Hit[] {
  return [
    ...drumBars(GALLOP, bar(0), 4, { crash: true }),
    ...drumBars(GALLOP, bar(4), 4, { crash: true, fill: 'toms1' }),
    ...drumBars(PUNK, bar(8), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(PUNK, bar(16), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_DRIVE, bar(24), 4, { crash: true, fill: 'build4' }),
    ...drumBars(ROCK_DRIVE, bar(28), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(PUNK, bar(36), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_DRIVE, bar(44), 4, { crash: true, fill: 'build4' }),
    ...drumBars(ROCK_DRIVE, bar(48), 8, { crash: true, fill: 'roll2' }),
    ...drumBars(BLAST, bar(56), 4, { crash: true }),
    ...drumBars(BLAST, bar(60), 4, { crash: true, fill: 'toms2' }),
    ...drumBars(ROCK_DRIVE, bar(64), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(HALF_TIME, bar(72), 7, { crash: true }),
    ...drumBars(HALF_TIME, bar(79), 1, { fill: 'build4' }),
    ...drumBars(ROCK_DRIVE, bar(80), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(GALLOP, bar(88), 4, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(92)),
  ];
}

const VERSE = [...VERSE_H, ...VERSE_H];

export const redline: SongDef = {
  id: 'redline',
  name: 'Redline',
  artist: 'Paper Satellites',
  album: 'Terminal Velocity',
  genre: 'Metal',
  year: '2026',
  loadingPhrase: 'Gallops are strummed; the fills are hammer-ons. Save star power for the solo.',
  tempo: [{ beat: 0, bpm: 176 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Intro' },
    { beat: bar(8), name: 'Verse 1' },
    { beat: bar(24), name: 'Pre-Chorus' },
    { beat: bar(28), name: 'Chorus' },
    { beat: bar(36), name: 'Verse 2' },
    { beat: bar(44), name: 'Pre-Chorus 2' },
    { beat: bar(48), name: 'Chorus 2' },
    { beat: bar(56), name: 'Guitar Solo' },
    { beat: bar(64), name: 'Twin Leads' },
    { beat: bar(72), name: 'Breakdown' },
    { beat: bar(80), name: 'Final Chorus' },
    { beat: bar(88), name: 'Outro' },
  ],
  player: [
    {
      inst: 'drive',
      tone: 0.6,
      gain: 1,
      verb: 0.06,
      notes: [
        ...seq(INTRO + ' ' + INTRO, bar(0)),
        ...progression(8, VERSE, verseBar),
        ...progression(28, CHORUS_H, chorusBar),
        ...progression(36, VERSE_H, verseBar),
        ...progression(48, CHORUS_H, chorusBar),
        ...seq(BREAKDOWN, bar(72)),
        ...progression(80, CHORUS_H, chorusBar),
        ...seq(INTRO, bar(88)),
        ...seq('D3^5!:32', bar(92)),
      ],
    },
    { inst: 'lead', tone: 0.7, gain: 1, verb: 0.2, echo: 0.12, notes: [...seq(FILLS, bar(24)), ...seq(FILLS, bar(44)), ...seq(SHRED, bar(56)), ...seq(HARMONY, bar(64))] },
  ],
  backing: [
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.04, notes: [...progression(24, ['D', 'Bb', 'D', 'A'], eighths(POWER), 0.7), ...progression(44, ['D', 'Bb', 'D', 'A'], eighths(POWER), 0.7), ...progression(56, [...SOLO_H, ...SOLO_H], eighths(POWER), 0.7)] },
    { inst: 'lead', tone: 0.5, gain: 0.6, pan: 0.35, verb: 0.2, notes: diatonic(seq(HARMONY, bar(64), { v: 0.7 }), D_MINOR, -2) },
    {
      inst: 'pickbass',
      tone: 0.6,
      gain: 1,
      verb: 0,
      notes: [
        ...roots(seq(INTRO + ' ' + INTRO, bar(0))),
        ...progression(8, VERSE, eighths(ROOT)),
        ...progression(24, ['D', 'Bb', 'D', 'A'], eighths(ROOT)),
        ...progression(28, CHORUS_H, eighths(ROOT)),
        ...progression(36, VERSE_H, eighths(ROOT)),
        ...progression(44, ['D', 'Bb', 'D', 'A'], eighths(ROOT)),
        ...progression(48, CHORUS_H, eighths(ROOT)),
        ...progression(56, [...SOLO_H, ...SOLO_H], eighths(ROOT)),
        ...roots(seq(BREAKDOWN, bar(72))),
        ...progression(80, CHORUS_H, eighths(ROOT)),
        ...roots(seq(INTRO, bar(88))),
        ...seq('D2:32', bar(92)),
      ],
    },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[bar(56), bar(72)]],
  lengthBeats: bar(94),
  previewBeat: bar(28),
  art: { from: '#120404', to: '#c4161c', ink: '#ffe0d0', motif: 'bars' },
};
