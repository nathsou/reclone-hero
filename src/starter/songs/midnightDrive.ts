import { perform } from '../performance.ts';
import { drumBars, SYNTHWAVE } from '../patterns.ts';
import { arp, chord, grid, seq } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// Synthwave in A minor, 100 BPM, over Am–F–C–G: held synth chords, a verse melody, a big hook, an
// arpeggio bridge, and an eighties guitar solo. A relaxed song for Medium players.
const bar = (n: number) => n * 4;

const LOOP = ['Am', 'F', 'C', 'G'];
const CHORD: Record<string, string> = { Am: 'A3+C4+E4', F: 'A3+C4+F4', C: 'G3+C4+E4', G: 'G3+B3+D4', E: 'G#3+B3+E4' };
const ARP: Record<string, string> = { Am: 'A4+C5+E5', F: 'F4+A4+C5', C: 'G4+C5+E5', G: 'G4+B4+D5', E: 'G#4+B4+E5' };
const ROOT: Record<string, string> = { Am: 'A1', F: 'F1', C: 'C2', G: 'G1', E: 'E1' };

const loop = (n: number) => Array.from({ length: n }, (_, i) => LOOP[i % 4]);
function perBar(from: number, chords: string[], fn: (c: string) => string, v = 0.7): Note[] {
  return chords.flatMap((c, i) => seq(fn(c), bar(from + i), { v }));
}
/** Root, third, fifth, third in eighth notes, twice a bar. */
const eighthArp = (c: string) => {
  const [a, b, d] = ARP[c].split('+');
  return `(${a}:2 ${b} ${d} ${b})x2`;
};
const octaveBass = (c: string) => {
  const r = ROOT[c];
  const up = r.replace(/\d$/, (d) => String(Number(d) + 1));
  return `(${r}:2 ${up})x4`;
};

const VERSE = ['E5:4 D5:2 C5 D5:4 E5', 'C5:6 A4:2 A4:8', 'G4:4 C5:2 D5 E5:4 G5', 'D5:8 B4:4 .:4', 'E5:4 D5:2 C5 D5:4 E5', 'A5:6 G5:2 F5:4 E5', 'E5:4 G5:2 E5 D5:4 C5', 'D5:12 .:4'].join(' ');
const HOOK = ['A5:3 A5 G5:2 E5:4 C5', 'F5:3 F5 E5:2 C5:4 A4', 'G5:3 G5 E5:2 G5:4 C6', 'B5:8 A5:4 G5', 'A5:3 A5 G5:2 E5:4 C5', 'F5:3 A5 C6:2 A5:4 F5', 'E5:3 G5 C6:2 E6:4 D6', 'D6:8 B5:4 G5'].join(' ');
const BRIDGE_H = ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'];
const SOLO = [
  'A5/2:4 G5:2 E5 G5:4 A5',
  'C6/2:6 A5:2 F5:4 A5',
  'G5:2 E5 G5 C6 E6:4 D6',
  'D6/2:8 B5:4 G5',
  'A5:1 C6 E6 C6 A5 C6 E6 C6 A5 C6 E6 A6:4',
  'A6/2:4 F6:2 C6 A5:4 F5',
  'E6:1 D6 C6 G5 E6 D6 C6 G5 E6 D6 C6 G5 E6:4',
  'D6/2:12 .:4',
].join(' ');

function bridgeArps(from: number): Note[] {
  return arp(
    BRIDGE_H.map((c) => chord(ARP[c])),
    [0, 1, 2, 3, 2, 1, 2, 1],
    0.25,
    16,
    bar(from),
    0.75,
  );
}

// Bar map: intro 0, verse 8, chorus 24, bridge 32, solo 40, chorus 48, outro 56, end 64.
function drums(): Hit[] {
  const open = { ...SYNTHWAVE, ohat: '..x...x...x...x.', hat: 'x...x...x...x...' };
  return [
    ...drumBars({ kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.' }, bar(4), 4, { fill: 'snare1' }),
    ...drumBars(SYNTHWAVE, bar(8), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(SYNTHWAVE, bar(16), 8, { crash: true, fill: 'build4' }),
    ...drumBars(open, bar(24), 8, { crash: true, fill: 'toms1' }),
    ...drumBars({ kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.', clap: '....x.......x...' }, bar(32), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(SYNTHWAVE, bar(40), 8, { crash: true, fill: 'build4' }),
    ...drumBars(open, bar(48), 8, { crash: true, fill: 'toms1' }),
    ...drumBars(SYNTHWAVE, bar(56), 4, { crash: true }),
    ...drumBars({ kick: 'x.......x.......', hat: 'x...x...x...x...' }, bar(60), 4),
    ...grid({ crash: 'X', kick: 'X' }, bar(64)),
  ];
}

export const midnightDrive: SongDef = perform({
  id: 'midnight-drive',
  name: 'Midnight Drive',
  artist: 'Chrome Coast',
  album: 'Tape Deck Hearts',
  genre: 'Synthwave',
  year: '2026',
  loadingPhrase: 'Hold the chords through their sustains, and let the hook breathe.',
  tempo: [{ beat: 0, bpm: 100 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Intro' },
    { beat: bar(8), name: 'Verse' },
    { beat: bar(24), name: 'Chorus' },
    { beat: bar(32), name: 'Bridge' },
    { beat: bar(40), name: 'Guitar Solo' },
    { beat: bar(48), name: 'Last Chorus' },
    { beat: bar(56), name: 'Outro' },
  ],
  player: [
    { inst: 'strings', tone: 0.6, gain: 1.2, verb: 0.35, notes: [...perBar(0, loop(8), (c) => `${CHORD[c]}:16`, 0.8), ...perBar(56, [...loop(8)], (c) => `${CHORD[c]}:16`, 0.8), ...seq(`${CHORD.Am}:16`, bar(64))] },
    { inst: 'supersaw', tone: 0.5, gain: 1, verb: 0.3, echo: 0.12, notes: [...seq(VERSE + ' ' + VERSE, bar(8), { v: 0.75, transpose: -12 }), ...seq(HOOK, bar(24), { transpose: -12 }), ...seq(HOOK, bar(48), { v: 0.85, transpose: -12 })] },
    { inst: 'pluck', tone: 0.55, gain: 1, verb: 0.25, echo: 0.3, notes: bridgeArps(32) },
    { inst: 'lead', tone: 0.6, gain: 0.95, verb: 0.35, echo: 0.12, notes: seq(SOLO, bar(40), { transpose: -12 }) },
  ],
  backing: [
    { inst: 'pad', tone: 0.35, gain: 0.6, verb: 0.28, pump: 0.25, notes: [...perBar(8, loop(24), (c) => `${CHORD[c]}:16`, 0.6), ...perBar(32, BRIDGE_H, (c) => `${CHORD[c]}:16`, 0.6), ...perBar(40, loop(16), (c) => `${CHORD[c]}:16`, 0.6)] },
    { inst: 'synthbass', tone: 0.4, gain: 1, verb: 0, notes: [...perBar(4, loop(28), octaveBass), ...perBar(32, BRIDGE_H, octaveBass), ...perBar(40, loop(24), octaveBass), ...seq('A1:16', bar(64))] },
    {
      inst: 'pluck',
      tone: 0.35,
      gain: 0.45,
      pan: 0.3,
      verb: 0.25,
      echo: 0.35,
      notes: [...perBar(24, loop(8), eighthArp, 0.55), ...perBar(48, loop(8), eighthArp, 0.55)],
    },
  ],
  drums: [{ kit: 'electro', hits: drums(), verb: 0.8 }],
  solos: [[bar(40), bar(48)]],
  lengthBeats: bar(66),
  previewBeat: bar(24),
  art: { from: '#120a2a', to: '#ff7a3d', ink: '#ffe1a8', motif: 'orbit' },
}, { bar: 4, phrase: 16, shape: [0.88, 1, 0.88], gate: 0.9, accent: 0.04 });
