import { perform } from '../performance.ts';
import { abc } from '../abc.ts';
import { bassOf, comp, nearVoicing, powerOf, prog } from '../arrange.ts';
import { drumBars, PUNK } from '../patterns.ts';
import { at, diatonic, grid, seq, transpose } from '../score.ts';
import type { Hit, Note, SongDef } from '../score.ts';

// What Shall We Do with the Drunken Sailor?, the sea shanty (19th century; public domain), as
// shanty punk: accordion and fiddle up front, a polka-punk band behind. Verse after the
// transcription on thesession.org (tune 15961); the chorus and the fiddle break are ours.
const head = 'M:4/4\nL:1/8\nK:Edor\n';
const VERSE = abc(`${head}B2BB B2BB|B2E2 G2B2|A2AA A2AA|A2D2 F2A2|B2BB B2BB|B2c2 d2e2|d2B2 A2F2|E4 z4|]`);
const CHORUS = abc(`${head}B4 B4|B2E2 G2B2|A4 A4|A2D2 F2A2|B4 B4|B2c2 d2e2|d2B2 A2F2|E4 z4|]`);
const BREAK = abc(`${head}e2dB e2dB|B2E2 G2B2|d2cA d2cA|A2D2 F2A2|e2dB e2dB|g2fe d2e2|f2e2 d2B2|e4 z4|]`);
const H = prog('Em Em D D Em Em D Em');
const EDOR = [4, 6, 7, 9, 11, 1, 2];
const bar = (n: number) => n * 4;
/** The tune an octave up with a third below it: double stops. */
const thirds = (notes: Note[]): Note[] => notes.map((n) => ({ ...n, p: [...diatonic([n], EDOR, -2)[0].p, ...n.p].map((p) => p + 12) }));

// Bar map: intro 0 (accordion alone), verse 8, chorus 16, fiddle break 24, verse 32, chorus 40,
// last chorus 48, tag 56, end 58.
const POLKA = { kick: 'x...x...x...x...', snare: '..X...X...X...X.', hat: 'x.x.x.x.x.x.x.x.' };
const STOMP = { kick: 'x.......x.......', clap: '....x.......x...' };

function drums(): Hit[] {
  return [
    ...drumBars(STOMP, bar(0), 8, { fill: 'snare1' }),
    ...drumBars(POLKA, bar(8), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(PUNK, bar(16), 8, { crash: true, fill: 'toms2' }),
    ...drumBars(POLKA, bar(24), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(POLKA, bar(32), 8, { crash: true, fill: 'snare1' }),
    ...drumBars(PUNK, bar(40), 8, { crash: true, fill: 'build4' }),
    ...drumBars(PUNK, bar(48), 8, { crash: true, fill: 'roll2' }),
    ...grid({ crash: 'X...X...X.......', kick: 'X...X...X.......', snare: 'X...X...X.......' }, bar(56)),
  ];
}

/** Oom-pah: root on the beat, fifth on the next. */
const oompah = (from: number, n = 1) => comp([...Array(n)].flatMap(() => H), 4, bar(from), 'x...x...', (c) => [bassOf(c, 'E1'), bassOf(c, 'E1') + 7], { arp: [0, 1] });
const chugs = (from: number, n = 1) => comp([...Array(n)].flatMap(() => H), 4, bar(from), 'x.mmx.mmx.mmx.mm', (c) => powerOf(c, 'E2'), { v: 0.75 });
const squeeze = (from: number, n = 1) => comp([...Array(n)].flatMap(() => H), 4, bar(from), '..x...x...x...x.', (c) => nearVoicing(c, 'B3'), { v: 0.55 });

export const drunkenSailor: SongDef = perform({
  id: 'drunken-sailor',
  name: 'Drunken Sailor',
  artist: 'Traditional',
  album: 'Songs of the Sea',
  genre: 'Folk Punk',
  year: '1839',
  composer: 'Traditional',
  loadingPhrase: 'Early in the morning, and a bit louder than usual.',
  tempo: [{ beat: 0, bpm: 172 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Squeezebox' },
    { beat: bar(8), name: 'Verse 1' },
    { beat: bar(16), name: 'Chorus 1' },
    { beat: bar(24), name: 'Fiddle Break' },
    { beat: bar(32), name: 'Verse 2' },
    { beat: bar(40), name: 'Chorus 2' },
    { beat: bar(48), name: 'All Hands' },
    { beat: bar(56), name: 'Ending' },
  ],
  player: [
    { inst: 'fiddle', tone: 0.4, gain: 0.95, verb: 0.16, notes: at(BREAK.notes, bar(24)) },
    { inst: 'accordion', gain: 1, verb: 0.2, notes: at(VERSE.notes, bar(0)) },
    { inst: 'drive', tone: 0.5, gain: 1, verb: 0.05, notes: [...chugs(8), ...seq('E2^5!:8 D2^5!:8 E2^5!:16', bar(56))] },
    {
      inst: 'lead',
      tone: 0.6,
      gain: 1,
      verb: 0.2,
      echo: 0.08,
      notes: [
        ...at(CHORUS.notes, bar(16)),
        // verse 2 in thirds, an octave up
        ...thirds(at(VERSE.notes, bar(32))),
        ...transpose(at(CHORUS.notes, bar(40)), 12),
        ...thirds(at(CHORUS.notes, bar(48))),
      ],
    },
  ],
  backing: [
    { inst: 'accordion', gain: 0.48, pan: -0.3, verb: 0.2, notes: [...at(VERSE.notes, bar(8)), ...squeeze(16), ...squeeze(24), ...at(VERSE.notes, bar(32)), ...squeeze(40, 2)] },
    { inst: 'fiddle', gain: 0.55, pan: 0.35, verb: 0.3, notes: [...at(CHORUS.notes, bar(16)), ...diatonic(at(BREAK.notes, bar(24)), EDOR, -2), ...at(CHORUS.notes, bar(48))] },
    { inst: 'drive', tone: 0.4, gain: 0.4, verb: 0.05, notes: chugs(16, 2).concat(chugs(32, 3)) },
    { inst: 'pickbass', gain: 1, verb: 0, notes: [...oompah(8, 6), ...seq('E1:8 D1:8 E1:16', bar(56))] },
  ],
  drums: [{ kit: 'rock', hits: drums(), gain: 0.8 }],
  solos: [[bar(24), bar(32)]],
  lengthBeats: bar(58),
  previewBeat: bar(16),
  art: { from: '#0c2233', to: '#c9483a', ink: '#f6ecd2', motif: 'wave' },
}, { bar: 4, phrase: 16, shape: [0.88, 1, 0.88], gate: 0.85, accent: 0.1 });
