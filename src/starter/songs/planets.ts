import { comp, nearVoicing, prog, bassOf } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { loop, seq, transpose } from '../score.ts';
import type { SongDef } from '../score.ts';

// Short playable arrangements of Holst's opening motifs, with original development passages.
// Pitch/rhythm source: public-domain incipits at
// https://imslp.org/wiki/The_Planets,_Op.32_(Holst,_Gustav)
// These are excerpts and variations, not reductions of the complete movements.
export const MARS_OSTINATO = seq('G2*:4/3 G2* G2* G2*:4 G2* G2*:2 G2* G2*:4'); // 5/4
export const MERCURY_MOTIF = seq('F4:2 Bb4 D5 E5 B4 G#4 A5 E5 C#5 E5 B4 G#4'); // 2 x 6/8
export const JUPITER_MOTIF = seq('A3!:2 B3:4 G3:4 B3:2 A3:4 B3:1 C4 A3 B3 C4:3 G3:5 B3:2 A3 G3:1 A3 C4 E4 G4:3 G4:1 A4:2 B4:4 G4:4 .:2 C3+G3+C4!:2 .:2'); // 7 x 2/4
const meta = (id: string, name: string, bpm: number, num: number, den: number, end: number, colors: [string, string]): Omit<SongDef, 'player' | 'backing' | 'drums' | 'sections'> => ({
  id, name, artist: 'Gustav Holst', composer: 'Gustav Holst', album: 'The Planets · Excerpts & Variations', genre: 'Orchestral', year: '1916',
  loadingPhrase: 'A planetary motif, reimagined for five frets.', tempo: [{ beat: 0, bpm }], timeSigs: [{ beat: 0, num, den }],
  solos: [], lengthBeats: end, previewBeat: num === 5 ? 40 : 48,
  art: { from: colors[0], to: colors[1], ink: '#fff4dc', motif: 'orbit' },
});
const martial = prog('G5 Db5 G5 D5 G5 Ab5 Eb5 D5');
const marsMelody = seq('G3:8 D4:8 Db4:4 G3:8 D4:8 Db4:4 | G3:4 Ab3:4 Bb3:4 Db4:4 D4:4 Eb4:4 D4:4 Db4:4 Bb3:4 G3:4');
export const mars: SongDef = {
  ...meta('mars-war-machine', 'Mars (War Machine)', 108, 5, 4, 240, ['#260e16', '#e05a34']),
  sections: [{ beat: 0, name: 'Five-Beat Ostinato' }, { beat: 40, name: 'War Machine' }, { beat: 80, name: 'Brass Answer' }, { beat: 120, name: 'Quiet Threat' }, { beat: 160, name: 'Full Force' }, { beat: 200, name: 'Retreat' }],
  player: [
    { inst: 'strings', tone: 0.35, gain: 0.8, verb: 0.2, notes: [...loop(transpose(MARS_OSTINATO, 12), 8, 5), ...loop(transpose(MARS_OSTINATO, 24), 8, 5, 120), ...loop(transpose(MARS_OSTINATO, 12), 8, 5, 200)] },
    { inst: 'brass', tone: 0.5, gain: 0.95, verb: 0.35, notes: [...seq('G3:8 D4:8 Db4:4 G3:8 D4:8 Db4:4 G3:4 Ab3:4 Bb3:4 Db4:4 D4:4 Eb4:4 D4:4 Db4:4 Bb3:4 G3:4', 40), ...transpose(marsMelody.map(n => ({ ...n, b: n.b + 80 })), 12), ...marsMelody.map(n => ({ ...n, b: n.b + 160, p: [n.p[0], n.p[0] + 12] }))] },
  ],
  backing: [
    { inst: 'strings', gain: 0.65, tone: 0.25, verb: 0.25, notes: [40, 80, 160].flatMap(at => loop(MARS_OSTINATO, 8, 5, at)) },
    { inst: 'drive', gain: 0.5, verb: 0.1, notes: comp(martial, 5, 160, 'x---x---x---x-x-x---', c => nearVoicing(c, 'G2'), { v: 0.6 }) },
    { inst: 'timpani', gain: 0.65, verb: 0.4, notes: [0, 40, 80, 160, 200].flatMap(at => comp(martial, 5, at, 'x-------x-------x---', c => [bassOf(c, 'G1')], { v: 0.65 })) },
    { inst: 'pad', gain: 0.4, tone: 0.2, verb: 0.5, notes: comp(martial, 5, 120, 'x-------------------', c => nearVoicing(c, 'G3'), { v: 0.45 }) },
  ],
  drums: [{ kit: 'orchestral', gain: 0.6, hits: [40, 80, 160].flatMap(at => drumBars({ kick: 'x...x...x...x.x.x...', snare: '........X.......X...' }, at, 8, { beats: 5, crash: true })) }],
};
const mercH = prog('Bb E A E Bb Db A E');
const mercArps = (at: number) => comp(mercH, 3, at, 'x.x.x.x.x.x.', c => nearVoicing(c, 'F4'), { arp: [0, 1, 2, 1, 2, 0], v: 0.6 });
export const mercury: SongDef = {
  ...meta('mercury-winged-messenger', 'Mercury (Winged Messenger)', 144, 6, 8, 168, ['#15203f', '#8cd5bf']),
  sections: [{ beat: 0, name: 'Winged Motif' }, { beat: 24, name: 'Flight' }, { beat: 48, name: 'Cross Currents' }, { beat: 72, name: 'Harp Interlude' }, { beat: 96, name: 'Flight, Higher' }, { beat: 120, name: 'Chase' }, { beat: 144, name: 'Landing' }],
  player: [
    { inst: 'harpsichord', gain: 1.2, verb: 0.2, notes: [...loop(MERCURY_MOTIF, 4, 6), ...mercArps(24), ...mercArps(72), ...mercArps(144)] },
    { inst: 'fiddle', gain: 0.95, verb: 0.25, notes: [...loop(MERCURY_MOTIF, 4, 6, 48), ...loop(transpose(MERCURY_MOTIF, 12), 4, 6, 96), ...loop(MERCURY_MOTIF, 4, 6, 120)] },
  ],
  backing: [
    { inst: 'strings', tone: 0.4, gain: 0.5, verb: 0.3, notes: [0, 24, 48, 96, 120, 144].flatMap(at => comp(mercH, 3, at, 'x-----x-----', c => nearVoicing(c, 'F3'), { v: 0.5 })) },
    { inst: 'pluck', tone: 0.35, gain: 0.4, pan: -0.3, verb: 0.3, echo: 0.1, notes: [...mercArps(48), ...mercArps(96), ...mercArps(120)] },
    { inst: 'pickbass', gain: 0.6, verb: 0, notes: [24, 48, 72, 96, 120, 144].flatMap(at => comp(mercH, 3, at, 'x-----x-----', c => [bassOf(c, 'E2')], { v: 0.65 })) },
  ],
  drums: [{ kit: 'orchestral', gain: 0.4, hits: [24, 48, 96, 120].flatMap(at => drumBars({ shaker: 'x.x.x.x.x.x.', rim: '......x.....' }, at, 8, { beats: 3 })) }],
  solos: [[72, 96]],
};
const jovial = prog('C G Am F C Em F G');
// The seven-bar opening brass tune is followed by one bar of original cadence (16 beats total).
const jupiterPhrase = [...JUPITER_MOTIF, ...seq('E4:2 D4 C4:4', 14)];
export const jupiter: SongDef = {
  ...meta('jupiter-jollity', 'Jupiter (Jollity)', 132, 2, 4, 192, ['#422443', '#e8aa50']),
  sections: [{ beat: 0, name: 'Jollity' }, { beat: 32, name: 'Dancing Strings' }, { beat: 64, name: 'Brass Celebration' }, { beat: 96, name: 'Warm Interlude' }, { beat: 128, name: 'Jollity, Higher' }, { beat: 160, name: 'Homecoming' }],
  player: [
    { inst: 'brass', gain: 0.9, tone: 0.5, verb: 0.3, notes: [...loop(jupiterPhrase, 2, 16), ...loop(jupiterPhrase, 2, 16, 64), ...loop(transpose(jupiterPhrase, 12), 2, 16, 128), ...loop(jupiterPhrase, 2, 16, 160)] },
    { inst: 'strings', gain: 0.8, verb: 0.25, notes: comp(jovial, 4, 32, 'xxxxxxxxxxxxxxxx', c => nearVoicing(c, 'C4'), { arp: [0, 1, 2, 1, 3, 2, 1, 0], v: 0.6 }) },
    { inst: 'piano', gain: 1.25, verb: 0.4, notes: comp(jovial, 4, 96, 'x.x.x.x.x.x.x.x.', c => nearVoicing(c, 'C4'), { arp: [0, 2, 1, 2], v: 0.65 }) },
  ],
  backing: [
    { inst: 'strings', gain: 0.45, verb: 0.35, notes: [0, 32, 64, 96, 128, 160].flatMap(at => comp(jovial, 4, at, 'x-------x-------', c => nearVoicing(c, 'C3'), { v: 0.5 })) },
    { inst: 'pickbass', gain: 0.6, verb: 0, notes: [0, 32, 64, 128, 160].flatMap(at => comp(jovial, 4, at, 'x---x---x---x---', c => [bassOf(c, 'E2')], { v: 0.65 })) },
    { inst: 'timpani', gain: 0.45, verb: 0.4, notes: [64, 128, 160].flatMap(at => comp(jovial, 4, at, 'x-------x-------', c => [bassOf(c, 'C2')], { v: 0.6 })) },
  ],
  drums: [{ kit: 'orchestral', gain: 0.45, hits: [0, 32, 64, 128, 160].flatMap(at => drumBars({ kick: 'x...x...x...x...', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' }, at, 8, { crash: at !== 0 })) }],
};
