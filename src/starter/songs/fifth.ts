import { bassOf, comp, powerOf, prog, voicing } from '../arrange.ts';
import { drumBars, GALLOP, HALF_TIME, ROCK_DRIVE, ROCK_RIDE } from '../patterns.ts';
import { grid, seq, transpose } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Beethoven, Symphony No. 5 in C minor, first movement (1808; public domain), as metal. The motif
// knocks twice, runs up the exposition (played twice, as the repeat sign asks), and the second theme
// comes back in C major before the coda hammers it home.
const bar = (n: number) => n * 4;

const KNOCK = '.:2 G2^5!:2 G2^5! G2^5! Eb2^5!:24 .:2 F2^5!:2 F2^5! F2^5! D2^5!:24';
const RIFF = [
  '.:2 G4:2 G4 G4 Eb4:8',
  '.:2 Ab4:2 Ab4 Ab4 G4:8',
  '.:2 Eb5:2 Eb5 Eb5 C5:8',
  '.:2 D5:2 D5 D5 B4:8',
  '.:2 G5:2 G5 G5 Eb5:8',
  '.:2 Ab5:2 Ab5 Ab5 F5:8',
  'G5:2 F5 Eb5 D5 C5 B4 A4 G4',
  '.:2 G4:2 G4 G4 C5:8',
].join(' ');
const RIFF_H = prog('Cm Fm Cm G Cm Fm G Cm');
/** the riff as eighth-note power chords, for the heavier second pass */
const RIFF_CHUGS = RIFF_H.map((c) => `.:2 (${c.startsWith('G') ? 'G2' : c.startsWith('F') ? 'F2' : 'C3'}^5:2)x7`).join(' ');
const HORN = '.:2 Bb4:2 Bb4 Bb4 Eb5:8 | F5:8 Bb4:8 | .:2 Bb4:2 Bb4 Bb4 Eb5:8 | F5:4 G5 Ab5 Bb5';
const HORN_H = prog('Eb Bb Eb Bb');
const THEME = 'Bb4:4 Eb5 D5 C5 | Bb4:8 G4:4 Ab4 | Bb4:4 F5 Eb5 D5 | C5:8 Bb4:8 | Bb4:4 Eb5 G5 F5 | Eb5:4 C5 Ab4 C5 | Bb4:4 D5 F5 Ab5 | G5:12 .:4';
const THEME_H = prog('Eb Eb Bb Bb Eb Ab Bb7 Eb');
const DEV = [
  '.:2 G4:2 G4 G4 C5:8',
  '.:2 Ab4:2 Ab4 Ab4 Db5:8',
  '.:2 Bb4:2 Bb4 Bb4 Eb5:8',
  '.:2 B4:2 B4 B4 F5:8',
  '(C5:1 Eb5 G5 Eb5)x2 (C5:1 Eb5 Ab5 Eb5)x2',
  '(B4:1 D5 G5 D5)x2 (B4:1 D5 F5 D5)x2',
  '(C5:1 Eb5 G5 C6)x2 (Ab4:1 C5 F5 Ab5)x2',
  'G5:4 F5 Eb5 D5',
].join(' ');
const DEV_H = prog('Cm Db Eb G7 Cm G Cm G');
const CODA = '.:2 G2^5!:2 G2^5! G2^5! Eb2^5!:8 .:2 F2^5!:2 F2^5! F2^5! D2^5!:8 C3^5!:4 .:4 C3^5!:4 .:4 C3^5!:16';

// Bar map: knock 0, exposition 4 (riff 4, horn 12, theme 16), exposition repeat 24 (riff 24, horn 32,
// theme 36), development 44, recapitulation 52 (riff 52, theme in C 60), coda 68, end 72.
const pad = (h: string[], from: number) => comp(h, 4, bar(from), 'x---------------', (c) => voicing(c, 'G3'), { v: 0.6 });
const bass8 = (h: string[], from: number) => comp(h, 4, bar(from), 'x.x.x.x.x.x.x.x.', (c) => [bassOf(c, 'C2')], { v: 0.8 });
const chug = (h: string[], from: number) => comp(h, 4, bar(from), 'm.m.x.m.m.m.x.m.', (c) => powerOf(c, 'E2'), { v: 0.72 });

function drums(): Hit[] {
  const knock = (at: number) => grid({ crash: '..X.X.X.X.......', kick: '..X.X.X.X.......' }, at);
  return [
    ...knock(bar(0)),
    ...knock(bar(2)),
    ...drumBars(GALLOP, bar(4), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_DRIVE, bar(12), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_RIDE, bar(16), 8, { crash: true, fill: 'build4' }),
    ...drumBars(GALLOP, bar(24), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_DRIVE, bar(32), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_RIDE, bar(36), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(HALF_TIME, bar(44), 4, { crash: true }),
    ...drumBars(ROCK_DRIVE, bar(48), 4, { crash: true, fill: 'build4' }),
    ...drumBars(GALLOP, bar(52), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(ROCK_RIDE, bar(60), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: '..X.X.X.X.......', kick: '..X.X.X.X.......' }, bar(68)),
    ...grid({ crash: '..X.X.X.X.......', kick: '..X.X.X.X.......' }, bar(69)),
    ...grid({ crash: 'X.......X.......', kick: 'X.......X.......', snare: 'X.......X.......' }, bar(70)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(71)),
  ];
}

export const fifth: SongDef = {
  id: 'fifth',
  name: 'Symphony No. 5',
  artist: 'Ludwig van Beethoven',
  album: 'Symphony No. 5 in C minor',
  genre: 'Classical Metal',
  year: '1808',
  composer: 'Ludwig van Beethoven',
  loadingPhrase: 'Short, short, short, long. You will be humming it for a week.',
  tempo: [{ beat: 0, bpm: 176 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Fate Knocks' },
    { beat: bar(4), name: 'Exposition' },
    { beat: bar(12), name: 'Horn Call' },
    { beat: bar(16), name: 'Second Theme' },
    { beat: bar(24), name: 'Exposition, Again' },
    { beat: bar(44), name: 'Development' },
    { beat: bar(52), name: 'Recapitulation' },
    { beat: bar(60), name: 'Theme in C' },
    { beat: bar(68), name: 'Coda' },
  ],
  player: [
    { inst: 'drive', tone: 0.55, gain: 1, verb: 0.08, notes: [...seq(KNOCK, bar(0)), ...seq(RIFF_CHUGS, bar(24)), ...seq(CODA, bar(68))] },
    {
      inst: 'lead',
      tone: 0.6,
      gain: 1,
      verb: 0.22,
      echo: 0.1,
      notes: [
        ...seq(RIFF, bar(4)),
        ...seq(HORN, bar(12)),
        ...seq(THEME, bar(16)),
        ...seq(HORN, bar(32)),
        ...seq(THEME, bar(36), { transpose: 12 }),
        ...seq(DEV, bar(44)),
        ...seq(RIFF, bar(52), { transpose: 12, v: 0.9 }),
        ...seq(THEME, bar(60), { transpose: 9 }),
      ],
    },
  ],
  backing: [
    { inst: 'strings', gain: 0.9, pan: -0.2, verb: 0.4, notes: [...seq('G3+G4:32 F3+F4:32', bar(0), { v: 0.7 }), ...pad(RIFF_H, 4), ...pad(HORN_H, 12), ...pad(THEME_H, 16), ...pad(HORN_H, 32), ...pad(THEME_H, 36), ...pad(DEV_H, 44), ...pad(RIFF_H, 52), ...pad(THEME_H.map((c) => c.replace('Eb', 'C').replace('Bb7', 'G7').replace('Bb', 'G').replace('Ab', 'F')), 60)] },
    { inst: 'drive', tone: 0.4, gain: 0.5, verb: 0.05, notes: [...chug(RIFF_H, 4), ...chug(HORN_H, 12), ...chug(HORN_H, 32), ...chug(DEV_H, 44), ...chug(RIFF_H, 52)] },
    {
      inst: 'pickbass',
      gain: 1,
      verb: 0,
      notes: [
        ...transpose(seq(KNOCK, bar(0)), -12).map((n) => ({ ...n, p: [n.p[0]] })),
        ...bass8(RIFF_H, 4),
        ...bass8(HORN_H, 12),
        // the motif keeps knocking in the bass under the lyrical theme
        ...comp(THEME_H, 4, bar(16), '..x.x.x.x-------', (c) => [bassOf(c, 'C2')]),
        ...bass8(RIFF_H, 24),
        ...bass8(HORN_H, 32),
        ...comp(THEME_H, 4, bar(36), '..x.x.x.x-------', (c) => [bassOf(c, 'C2')]),
        ...bass8(DEV_H, 44),
        ...bass8(RIFF_H, 52),
        ...comp(THEME_H.map((c) => c.replace('Eb', 'C').replace('Bb7', 'G7').replace('Bb', 'G').replace('Ab', 'F')), 4, bar(60), '..x.x.x.x-------', (c) => [bassOf(c, 'C2')]),
        ...transpose(seq(CODA, bar(68)), -12).map((n) => ({ ...n, p: [n.p[0]] })),
      ],
    },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[bar(44), bar(52)]],
  lengthBeats: bar(73),
  previewBeat: bar(4),
  art: { from: '#0a0a0a', to: '#8a1c1c', ink: '#f2e6d0', motif: 'bars' },
};
