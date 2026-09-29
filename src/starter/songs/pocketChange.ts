import { abc } from '../abc.ts';
import { bassOf, comp, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars, HALF_TIME, PUNK } from '../patterns.ts';
import { diatonic, grid, transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Ska punk in D, 184 BPM: off-beat upstrokes in the verses, power chords in the choruses, a horn
// section with its own hook, a guitar solo and a half-time breakdown.
const HORN_RIFF = abc(`
M:4/4
L:1/8
K:D
f2 a2 fe d2 | zd ef- f2 e2 | dB G2 zg fe | e2 c2 A4 |]
`);
const HOOK = abc(`
M:4/4
L:1/8
K:D
d2 d2 B2 d2 | c2 e2 e4 | f2 f2 e2 d2 | d2 B2 B4 | B2 d2 g2 f2 | e2 c2 e2 a2 | f2 e2 d2 A2 | d6 z2 |]
`);
const SOLO = abc(`
M:4/4
L:1/8
K:D
a2 fd A2 df | abaf ed B2 | g2 dB G2 Bd | e2 cA E2 z2 |
fgab a2 fd | efga g2 ec | defg a2 gf | e2 ce a4 |]
`);
const VERSE_H = prog('D Bm G A D Bm G A');
const CHORUS_H = prog('G A D Bm G A D D');
const bar = (n: number) => n * 4;

// Bar map: intro 0, verse 4, chorus 12, verse 20, chorus 28, solo 36, breakdown 44, chorus 48,
// ending 56.
const place = (notes: Note[], at: number): Note[] => notes.map((n) => ({ ...n, b: n.b + at }));
const skank = (h: string[], at: number, v = 0.7) => comp(h, 4, at, '..x...x...x...x.', (c) => voicing(c, 'D4'), { v });
const power = (h: string[], at: number) => comp(h, 4, at, 'x.x.x.x.x.x.x.x.', (c) => powerOf(c, 'E2'), { v: 0.8 });
const walk = (h: string[], at: number) => comp(h, 4, at, 'x...x...x...x...', (c) => [bassOf(c, 'E1'), bassOf(c, 'E1') + 7, bassOf(c, 'E1') + 12, bassOf(c, 'E1') + 7], { arp: [0, 1, 2, 3], v: 0.8 });
const roots8 = (h: string[], at: number) => comp(h, 4, at, 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'E1')], { v: 0.85 });
const INTRO_H = prog('D Bm G A');
/** The second horn: a third below, in D major. */
const below = (notes: Note[]) => diatonic(notes, [2, 4, 6, 7, 9, 11, 1], -2);

const SKA = { kick: 'x.......x.......', snare: '....X.......X...', hat: '..x...x...x...x.' };
function drums(): Hit[] {
  return [
    ...drumBars(SKA, bar(0), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(SKA, bar(4), 8, { crash: true, fill: 'build4' }),
    ...drumBars(PUNK, bar(12), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(SKA, bar(20), 8, { crash: true, fill: 'build4' }),
    ...drumBars(PUNK, bar(28), 8, { crash: true, fill: 'snare1' }),
    ...drumBars({ ...SKA, ride: 'x.x.x.x.x.x.x.x.', hat: '' }, bar(36), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(HALF_TIME, bar(44), 4, { crash: true, fill: 'build4' }),
    ...drumBars(PUNK, bar(48), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X.X.X...X.......', kick: 'X.X.X...X.......', snare: 'X.X.X...X.......' }, bar(56)),
  ];
}

export const pocketChange: SongDef = {
  id: 'pocket-change',
  name: 'Pocket Change',
  artist: 'Tin Can Parade',
  album: 'Upstroke',
  genre: 'Ska Punk',
  year: '2026',
  loadingPhrase: 'In the verses the guitar only plays on the "and": let the drums have the beat.',
  tempo: [{ beat: 0, bpm: 184 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Horns' },
    { beat: bar(4), name: 'Verse 1' },
    { beat: bar(12), name: 'Chorus' },
    { beat: bar(20), name: 'Verse 2' },
    { beat: bar(28), name: 'Chorus 2' },
    { beat: bar(36), name: 'Guitar Solo' },
    { beat: bar(44), name: 'Breakdown' },
    { beat: bar(48), name: 'Last Chorus' },
    { beat: bar(56), name: 'Ending' },
  ],
  player: [
    { inst: 'clean', gain: 1.6, pan: 0.1, verb: 0.15, notes: [...skank(INTRO_H, bar(0)), ...skank(VERSE_H, bar(4)), ...skank(VERSE_H, bar(20))] },
    {
      inst: 'drive',
      tone: 0.55,
      gain: 0.9,
      verb: 0.05,
      notes: [
        ...power(CHORUS_H, bar(12)),
        ...power(CHORUS_H, bar(28)),
        ...comp(prog('Bm Bm G A'), 4, bar(44), 'x.......x.x.....', (c) => powerOf(c, 'E2'), { v: 0.9 }),
        ...power(CHORUS_H, bar(48)),
        ...comp(prog('D'), 4, bar(56), 'x.x.x...x.......', (c) => powerOf(c, 'E2'), { v: 1 }),
      ],
    },
    { inst: 'lead', tone: 0.6, gain: 1.3, verb: 0.2, echo: 0.1, notes: transpose(place(SOLO.notes, bar(36)), -12) },
  ],
  backing: [
    { inst: 'brass', tone: 0.7, gain: 0.65, pan: -0.25, verb: 0.2, notes: [...place(HORN_RIFF.notes, bar(0)), ...place(HORN_RIFF.notes, bar(24)), ...place(HOOK.notes, bar(12)), ...place(HOOK.notes, bar(28)), ...transpose(place(HOOK.notes, bar(48)), 12), ...comp(prog('D'), 4, bar(56), 'x.x.x...x.......', () => [62, 66, 69, 74], { v: 1 })] },
    { inst: 'brass', tone: 0.6, gain: 0.45, pan: 0.3, verb: 0.2, notes: [...below(place(HOOK.notes, bar(12))), ...transpose(below(place(HOOK.notes, bar(48))), 12), ...comp(VERSE_H, 4, bar(36), 'x-------x-------', (c) => voicing(c, 'F#4'), { v: 0.5 })] },
    { inst: 'clean', gain: 0.6, pan: -0.35, verb: 0.15, notes: [...skank(CHORUS_H, bar(12), 0.5), ...skank(CHORUS_H, bar(28), 0.5), ...skank(VERSE_H, bar(36)), ...skank(CHORUS_H, bar(48), 0.5)] },
    { inst: 'pickbass', gain: 0.8, verb: 0, notes: [...walk(INTRO_H, bar(0)), ...walk(VERSE_H, bar(4)), ...roots8(CHORUS_H, bar(12)), ...walk(VERSE_H, bar(20)), ...roots8(CHORUS_H, bar(28)), ...walk(VERSE_H, bar(36)), ...comp(prog('Bm Bm G A'), 4, bar(44), 'x.......x.x.....', (c) => [bassOf(c, 'E1')], { v: 0.9 }), ...roots8(CHORUS_H, bar(48)), ...comp(prog('D'), 4, bar(56), 'x.x.x...x.......', () => [38], { v: 1 })] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.65 }],
  solos: [[bar(36), bar(44)]],
  lengthBeats: bar(58),
  previewBeat: bar(12),
  art: { from: '#101010', to: '#e8e8e8', ink: '#ff3b3b', motif: 'grid' },
};
