import { drumBars, HALF_TIME, ROCK, ROCK_DRIVE, ROCK_OPEN, ROCK_RIDE } from '../patterns.ts';
import { grid, roots, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Straight-ahead rock in E minor, 140 BPM: palm-muted riffs, a singing chorus hook, a solo and a
// half-time breakdown. Four beats to the bar; `bar(n)` is the beat where bar n starts.
const bar = (n: number) => n * 4;

const RIFF_A = 'E2*:2 E2* G2^5s E2* A2^5s E2* B2^5s:1 A2^5s G2^5s:2';
const RIFF_B = 'E2*:2 E2* G2^5s E2* D3^5s:3 C#3^5s:1 C3^5s:2 B2^5s';
const RIFF = `${RIFF_A} ${RIFF_B} ${RIFF_A} ${RIFF_B}`;

const VERSE = [
  'E2*:1 E2* E2*:2 E2* G2^5s E2*:1 E2* E2*:2 A2^5s G2^5s',
  'E2*:1 E2* E2*:2 E2* G2^5s E2*:1 E2* E2*:2 B2^5s!:4',
  'C3^5s:2 C3^5s*:1 C3^5s* C3^5s:2 C3^5s* C3^5s C3^5s*:1 C3^5s* C3^5s:2 B2^5s',
  'D3^5s:2 D3^5s*:1 D3^5s* D3^5s:2 D3^5s* D3^5s!:4 E3^5s:2 F#3^5s',
].join(' ');

const PRE = 'C3^5:8 D3^5 E3^5 D3^5 C3^5 D3^5 B2^5!:16';

const HOOK = [
  'B4:4 A4:2 G4 A4:4 B4',
  'A4:6 F#4:2 D4:4 E4:2 F#4',
  'G4:4 F#4:2 E4 B4:6 A4:2',
  'G4:4 E4 G4 A4',
  'B4:4 A4:2 G4 A4:4 D5',
  'E5/2:6 D5:2 A4:4 B4:2 A4',
  'B4:6 G4:2 E4:4 F#4:2 G4',
  'A4:8 G4:4 F#4',
].join(' ');

const CHORUS_CHORDS = '(G2^5:2)x8 (D3^5:2)x8 (E2^5:2)x8 (C3^5:2)x8 (G2^5:2)x8 (D3^5:2)x8 (E2^5:2)x8 (C3^5:2)x4 (D3^5:2)x4';
const CHORUS_BASS = '(G1:2)x8 (D2:2)x8 (E1:2)x8 (C2:2)x8 (G1:2)x8 (D2:2)x8 (E1:2)x8 (C2:2)x4 (D2:2)x4';
const CHORUS_ORGAN = 'G3^M:16 D4^M E4^m C4^M G3^M D4^M E4^m C4^M:8 D4^M';

const SOLO = [
  'E5/2:4 D5:2 B4 D5 E5 G5:4',
  'E5:2 D5:1 B4 A4:2 G4 A4:1 B4 D5:2 E5:4',
  'G5:1 E5 D5 B4 G5 E5 D5 B4 G5 E5 D5 B4 A4:2 G4',
  'A4:2 B4 D5 E5 F#5:4 A5/2',
  'B5/2:8 A5:2 G5 E5 D5',
  'E5:1 G5 A5 G5 E5 D5 B4 D5 E5 G5 A5 B5 D6:4',
  'E6/2:6 D6:2 B5:4 A5:2 G5',
  'F#5:2 G5 F#5 E5 D#5:4 F#5:2 B5',
].join(' ');
const SOLO_CHORDS = '(E2^5:2)x16 (C3^5:2)x8 (D3^5:2)x8 (E2^5:2)x16 (C3^5:2)x8 (B2^5:2)x8';
const SOLO_BASS = '(E1:2)x16 (C2:2)x8 (D2:2)x8 (E1:2)x16 (C2:2)x8 (B1:2)x8';
const SOLO_ORGAN = 'E4^m:32 C4^M:16 D4^M E4^m:32 C4^M:16 B3^M';

const BR_A = 'E2*:1 E2* .:1 E2* E2* . G2^5s:2 E2*:1 E2* . E2* A#2^5s:2 A2^5s';
const BR_B = 'E2*:1 E2* . E2* E2* . G2^5s:2 E2*:1 E2* . E2* D3^5s:2 C3^5s';
const BRIDGE = `${BR_A} ${BR_B} ${BR_A} ${BR_B} ${BR_A} ${BR_B} C3^5s:4 D3^5s E3^5s D3^5s B2^5!:16`;

function drums(): Hit[] {
  return [
    // intro: two bars of hats, then the band
    ...drumBars({ hat: 'x.x.x.x.x.x.x.x.' }, bar(0), 2, { fill: 'snare1' }),
    ...drumBars(ROCK, bar(2), 6, { crash: true, fill: 'toms1' }),
    // verse 1
    ...drumBars(ROCK, bar(8), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK, bar(12), 4, { fill: 'snare1' }),
    ...drumBars(ROCK, bar(16), 4, { fill: 'snare1' }),
    ...drumBars(ROCK, bar(20), 4, { fill: 'toms1' }),
    // pre-chorus 1
    ...drumBars(ROCK_OPEN, bar(24), 4, { crash: true, fill: 'build4' }),
    // chorus 1
    ...drumBars(ROCK_RIDE, bar(28), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_RIDE, bar(32), 4, { crash: true, fill: 'toms2' }),
    // interlude
    ...drumBars(ROCK_DRIVE, bar(36), 4, { crash: true, fill: 'toms1' }),
    // verse 2
    ...drumBars(ROCK, bar(40), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK, bar(44), 4, { fill: 'toms1' }),
    // pre-chorus 2
    ...drumBars(ROCK_OPEN, bar(48), 4, { crash: true, fill: 'build4' }),
    // chorus 2
    ...drumBars(ROCK_RIDE, bar(52), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_RIDE, bar(56), 4, { crash: true, fill: 'toms2' }),
    // solo
    ...drumBars(ROCK_RIDE, bar(60), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_RIDE, bar(64), 4, { crash: true, fill: 'toms2' }),
    // bridge: half time, then a build
    ...drumBars(HALF_TIME, bar(68), 4, { crash: true, fill: 'toms1' }),
    ...drumBars(HALF_TIME, bar(72), 3, { crash: true }),
    ...drumBars(ROCK, bar(75), 1, { fill: 'build4' }),
    // final chorus, driving
    ...drumBars(ROCK_DRIVE, bar(76), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_DRIVE, bar(80), 4, { crash: true, fill: 'toms2' }),
    // outro
    ...drumBars(ROCK, bar(84), 4, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X', kick: 'X', snare: 'X' }, bar(88)),
  ];
}

export const ignition: SongDef = {
  id: 'ignition',
  name: 'Ignition',
  artist: 'Static Pilots',
  album: 'Flight Recorder',
  genre: 'Rock',
  year: '2026',
  loadingPhrase: 'Palm-muted notes want a quick, firm strum. Let the chorus melody sing.',
  tempo: [{ beat: 0, bpm: 140 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Intro' },
    { beat: bar(8), name: 'Verse 1' },
    { beat: bar(24), name: 'Pre-Chorus' },
    { beat: bar(28), name: 'Chorus' },
    { beat: bar(36), name: 'Interlude' },
    { beat: bar(40), name: 'Verse 2' },
    { beat: bar(48), name: 'Pre-Chorus 2' },
    { beat: bar(52), name: 'Chorus 2' },
    { beat: bar(60), name: 'Guitar Solo' },
    { beat: bar(68), name: 'Breakdown' },
    { beat: bar(76), name: 'Final Chorus' },
    { beat: bar(84), name: 'Outro' },
  ],
  player: [
    {
      inst: 'drive',
      tone: 0.55,
      gain: 1,
      verb: 0.08,
      notes: [
        ...seq(RIFF, bar(0)),
        ...seq(VERSE + ' ' + VERSE + ' ' + VERSE + ' ' + VERSE, bar(8)),
        ...seq(PRE, bar(24)),
        ...seq(RIFF, bar(36)),
        ...seq(VERSE + ' ' + VERSE, bar(40)),
        ...seq(PRE, bar(48)),
        ...seq(BRIDGE, bar(68)),
        ...seq(RIFF, bar(84)),
        ...seq('E2^5!:32', bar(88)),
      ],
    },
    {
      inst: 'lead',
      tone: 0.6,
      gain: 1,
      verb: 0.25,
      echo: 0.18,
      notes: [...seq(HOOK, bar(28)), ...seq(HOOK, bar(52)), ...seq(SOLO, bar(60)), ...seq(HOOK, bar(76))],
    },
  ],
  backing: [
    {
      inst: 'drive',
      tone: 0.4,
      gain: 0.55,
      verb: 0.06,
      notes: [
        ...seq(CHORUS_CHORDS, bar(28), { v: 0.7 }),
        ...seq(CHORUS_CHORDS, bar(52), { v: 0.7 }),
        ...seq(SOLO_CHORDS, bar(60), { v: 0.7 }),
        ...seq(CHORUS_CHORDS, bar(76), { v: 0.7 }),
      ],
    },
    {
      inst: 'pickbass',
      tone: 0.5,
      gain: 1,
      verb: 0,
      notes: [
        ...roots(seq(RIFF, bar(0)).filter((n) => n.b >= bar(2))),
        ...seq('(E1:2)x16 (C2:2)x8 (D2:2)x8', bar(8)),
        ...seq('(E1:2)x16 (C2:2)x8 (D2:2)x8', bar(12)),
        ...seq('(E1:2)x16 (C2:2)x8 (D2:2)x8', bar(16)),
        ...seq('(E1:2)x16 (C2:2)x8 (D2:2)x8', bar(20)),
        ...seq('(C2:2)x4 (D2:2)x4 (E2:2)x4 (D2:2)x4 (C2:2)x4 (D2:2)x4 (B1:2)x8', bar(24)),
        ...seq(CHORUS_BASS, bar(28)),
        ...roots(seq(RIFF, bar(36))),
        ...seq('(E1:2)x16 (C2:2)x8 (D2:2)x8 (E1:2)x16 (C2:2)x8 (D2:2)x8', bar(40)),
        ...seq('(C2:2)x4 (D2:2)x4 (E2:2)x4 (D2:2)x4 (C2:2)x4 (D2:2)x4 (B1:2)x8', bar(48)),
        ...seq(CHORUS_BASS, bar(52)),
        ...seq(SOLO_BASS, bar(60)),
        ...roots(seq(BRIDGE, bar(68))),
        ...seq(CHORUS_BASS, bar(76)),
        ...roots(seq(RIFF, bar(84))),
        ...seq('E1:32', bar(88)),
      ],
    },
    {
      inst: 'organ',
      gain: 0.9,
      pan: -0.2,
      verb: 0.3,
      notes: [
        ...seq('C4^M:8 D4^M E4^m D4^M C4^M D4^M B3^M:16', bar(24), { v: 0.6 }),
        ...seq(CHORUS_ORGAN, bar(28), { v: 0.6 }),
        ...seq('C4^M:8 D4^M E4^m D4^M C4^M D4^M B3^M:16', bar(48), { v: 0.6 }),
        ...seq(CHORUS_ORGAN, bar(52), { v: 0.6 }),
        ...seq(SOLO_ORGAN, bar(60), { v: 0.55 }),
        ...seq(CHORUS_ORGAN, bar(76), { v: 0.6 }),
        ...seq('E4^m:32', bar(88), { v: 0.6 }),
      ],
    },
  ],
  drums: [{ kit: 'rock', hits: drums() }],
  solos: [[bar(60), bar(68)]],
  lengthBeats: bar(90),
  previewBeat: bar(28),
  art: { from: '#1b0f0a', to: '#e0461f', ink: '#ffd9a8', motif: 'sun' },
};
