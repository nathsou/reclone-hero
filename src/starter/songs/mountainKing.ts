import { perform } from '../performance.ts';
import { BLAST, drumBars, PUNK, ROCK, ROCK_DRIVE } from '../patterns.ts';
import { grid, seq, transpose } from '../score.ts';
import type { Hit, Note, SongDef, TempoPoint } from '../score.ts';

// Grieg, "In the Hall of the Mountain King" (Peer Gynt, 1875; public domain), arranged as metal.
// Four statements of the theme, each heavier and faster than the last: 100 BPM up to 185.
const bar = (n: number) => n * 4;

// The theme in B minor (four bars), and its answer on the dominant.
const THEME = 'B3:2 C#4 D4 E4 F#4 D4 F#4:4 | F4:2 C#4 F4:4 E4:2 C4 E4:4 | B3:2 C#4 D4 E4 F#4 D4 F#4 B4 | A4:2 F#4 D4 F#4 A4:8';
const ANSWER = 'F#4:2 G#4 A#4 B4 C#5 A#4 C#5:4 | D5:2 A#4 D5:4 C#5:2 A#4 C#5:4 | F#4:2 G#4 A#4 B4 C#5 A#4 C#5:4 | D5:2 A#4 D5:4 C#5:8';
/** One statement: theme, theme, answer, theme (16 bars). */
const STATEMENT = `${THEME} ${THEME} ${ANSWER} ${THEME}`;
/** Harmony per bar of a statement: tonic pedal, dominant in the answer. */
const HARMONY = [...Array(8).fill('B'), ...Array(4).fill('F#'), ...Array(4).fill('B')] as ('B' | 'F#')[];

function statement(from: number, opts: { transpose?: number; staccato?: boolean; v?: number } = {}): Note[] {
  let notes = seq(STATEMENT, bar(from), { v: opts.v ?? 0.8 });
  if (opts.transpose) notes = transpose(notes, opts.transpose);
  if (opts.staccato) notes = notes.map((n) => ({ ...n, mute: n.d <= 0.5 ? true : n.mute }));
  return notes;
}

/** Chugging power chords on the harmony, eighth notes. */
function chugs(from: number): Note[] {
  return HARMONY.flatMap((h, i) => seq(h === 'B' ? '(B1^5*:2)x6 B1^5:2 D2^5:2' : '(F#1^5*:2)x6 F#1^5:2 A#1^5:2', bar(from + i), { v: 0.75 }));
}

function pedal(from: number, rhythm: string): Note[] {
  return HARMONY.flatMap((h, i) => seq(rhythm.replaceAll('R', h === 'B' ? 'B1' : 'F#1'), bar(from + i), { v: 0.8 }));
}

function strings(from: number): Note[] {
  return HARMONY.flatMap((h, i) => seq(h === 'B' ? 'B3+D4+F#4:16' : 'F#3+A#3+C#4+E4:16', bar(from + i), { v: 0.6 }));
}

const tempo: TempoPoint[] = [{ beat: 0, bpm: 100 }];
// accelerando: every bar from 16 to 63 a little faster, then the coda at full tilt
for (let b = 16; b < 64; b++) tempo.push({ beat: bar(b), bpm: Math.round((100 + ((b - 16) * 85) / 47) * 10) / 10 });
tempo.push({ beat: bar(64), bpm: 190 });

const CODA = 'B2^5!:2 .:2 B2^5!:2 .:2 F#2^5!:2 .:2 F#2^5!:2 .:2 | B2^5!:2 .:2 B2^5!:2 .:2 F#2^5!:2 .:2 F#2^5!:2 .:2 | B2^5!:4 D3^5! F#3^5! B3^5! | B2^5!:16';
const CODA_BASS = 'B1:2 .:2 B1:2 .:2 F#1:2 .:2 F#1:2 .:2 | B1:2 .:2 B1:2 .:2 F#1:2 .:2 F#1:2 .:2 | B1:4 D2 F#2 B2 | B1:16';

function drums(): Hit[] {
  return [
    ...drumBars({ tomLo: 'x.......x.......', kick: 'x.......x.......' }, bar(0), 15),
    ...drumBars({ tomLo: 'x.......x.......' }, bar(15), 1, { fill: 'toms1' }),
    ...drumBars(ROCK, bar(16), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK, bar(24), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(ROCK_DRIVE, bar(32), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(ROCK_DRIVE, bar(40), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(PUNK, bar(48), 4, { crash: true }),
    ...drumBars(PUNK, bar(52), 4, { crash: true, fill: 'snare1' }),
    ...drumBars(PUNK, bar(56), 4, { crash: true }),
    ...drumBars(BLAST, bar(60), 4, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X.......X.......', kick: 'X...X...X...X...', snare: 'X...X...X...X...' }, bar(64)),
    ...grid({ crash: 'X.......X.......', kick: 'X...X...X...X...', snare: 'X...X...X...X...' }, bar(65)),
    ...grid({ crash: 'X...X...X...X...', kick: 'X...X...X...X...', snare: 'X...X...X...X...' }, bar(66)),
    ...grid({ crash: 'X', kick: 'X', snare: 'X', tomLo: 'X' }, bar(67)),
  ];
}

export const mountainKing: SongDef = perform({
  id: 'mountain-king',
  name: 'In the Hall of the Mountain King',
  artist: 'Edvard Grieg',
  album: 'Peer Gynt',
  genre: 'Classical Metal',
  year: '1875',
  composer: 'Edvard Grieg',
  loadingPhrase: 'It starts slow. It does not stay slow.',
  tempo,
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'The Hall' },
    { beat: bar(16), name: 'The Trolls Wake' },
    { beat: bar(32), name: 'The Chase' },
    { beat: bar(48), name: 'Stampede' },
    { beat: bar(64), name: 'Collapse' },
  ],
  player: [
    { inst: 'clean', chorus: 0.05, gain: 1.5, verb: 0.25, notes: statement(0, { staccato: true, v: 0.7 }) },
    { inst: 'drive', tone: 0.5, gain: 1, verb: 0.08, notes: [...statement(16, { transpose: -12 }), ...seq(CODA, bar(64))] },
    { inst: 'lead', tone: 0.65, gain: 1, verb: 0.2, echo: 0.1, notes: [...statement(32), ...statement(48, { transpose: 12, v: 0.9 })] },
  ],
  backing: [
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...pedal(0, 'R*:4 . R* .'), ...pedal(16, '(R:2)x8'), ...pedal(32, '(R:2)x8'), ...pedal(48, '(R:2)x8'), ...seq(CODA_BASS, bar(64))] },
    { inst: 'strings', gain: 0.5, pan: -0.15, verb: 0.4, notes: [...strings(16), ...strings(32)] },
    // (an octave down, but never below the guitar's low E)
    { inst: 'drive', tone: 0.35, gain: 0.4, verb: 0.05, notes: [...chugs(32), ...statement(48, { transpose: -12, v: 0.75 }).map((n) => (n.p[0] < 40 ? { ...n, p: n.p.map((p) => p + 12) } : n))] },
  ],
  drums: [{ kit: 'rock', hits: drums() }],
  solos: [],
  lengthBeats: bar(68),
  previewBeat: bar(32),
  art: { from: '#07120c', to: '#3f6b3a', ink: '#d8f5a2', motif: 'shards' },
}, { bar: 4, phrase: 16, shape: [0.85, 1, 0.9], gate: 0.82, accent: 0.08 });
