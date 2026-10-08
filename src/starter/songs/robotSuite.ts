import { perform } from '../performance.ts';
import { bassOf, comp, nearVoicing, parseChord, prog, voicing } from '../arrange.ts';
import { drumBars, HOUSE_OPEN, FOUR_FLOOR, HALF_TIME } from '../patterns.ts';
import { seq } from '../score.ts';
import type { Part, SongDef } from '../score.ts';

// Two retained originals: raw French house and cinematic electronica.
// No melodies or samples from existing records.
const section = (beat: number, name: string) => ({ beat, name });
const rhythm = (h: string[], at: number, pattern: string, low = 'C4') => comp(h, 4, at, pattern, c => nearVoicing(c, low), { v: 0.65 });
const bass = (h: string[], at: number, pattern: string) => comp(h, 4, at, pattern, c => [bassOf(c, 'E1'), bassOf(c, 'E1') + 7, bassOf(c, 'E1') + 12], { arp: [0, 0, 2, 0, 1, 2], v: 0.8 });
const meta = (id: string, name: string, genre: string, bpm: number, colors: [string, string], motif: SongDef['art']['motif']): Omit<SongDef, 'sections' | 'player' | 'backing' | 'drums'> => ({
  id, name, artist: 'Circuit Atlas', album: 'Machines with Feelings', genre, year: '2026',
  loadingPhrase: 'Original circuits. Human hands.', tempo: [{ beat: 0, bpm }], timeSigs: [{ beat: 0, num: 4, den: 4 }],
  solos: [], lengthBeats: 224, previewBeat: 64, art: { from: colors[0], to: colors[1], ink: '#edfbff', motif },
});
const H = prog('Fm7 Fm7 Bbm7 Eb7 Fm7 Abmaj7 Bbm7 C7');
const warehouseRiff = 'F3*:2 .:1 F3*:1 Ab3:2 F3*:1 .:1 C4:2 Bb3:1 Ab3:1 F3:2 Eb3:2';
// Keep the riff's rhythm while following each chord's third and seventh.
// The fixed F-minor loop formerly ignored changing thirds and sevenths.
const warehouseNotes = (at: number) => H.flatMap((name, i) => {
  const chord = parseChord(name);
  const root = bassOf(name, 'C3');
  return seq(warehouseRiff, at + i * 4).map(n => ({ ...n, p: n.p.map(p => {
    const degree = p - 53; // original riff starts on F3
    return root + (degree === 3 ? chord.intervals[1] : degree === -2 ? chord.intervals[3] - 12 : degree);
  }) }));
});
const warehouseParts = (at: number, tone: number): Part[] => [
  { inst: 'synthbass', tone, gain: 1.15, verb: 0.05, pump: 0.35, notes: warehouseNotes(at) },
  { inst: 'organ', tone, gain: 0.5, verb: 0.1, pump: 0.45, notes: rhythm(H, at, '..x...x..x....x.', 'F3') },
];
export const warehouseCurrent: SongDef = perform({
  ...meta('warehouse-current', 'Warehouse Current', 'French House', 125, ['#29191b', '#ff793a'], 'bars'),
  sections: [section(0, 'Needle Drop'), section(32, 'Filter Opens'), section(64, 'Warehouse'), section(96, 'Dub Break'), section(128, 'Rebuild'), section(160, 'Full Circuit'), section(192, 'Runout')],
  player: [...warehouseParts(0, 0.2), ...warehouseParts(32, 0.4), ...warehouseParts(64, 0.7), ...warehouseParts(128, 0.5), ...warehouseParts(160, 0.8), { inst: 'pluck', gain: 0.8, tone: 0.3, verb: 0.3, echo: 0.4, notes: rhythm(H, 96, 'x---......x---..') }, ...warehouseParts(192, 0.25)],
  backing: [
    { inst: 'subbass', gain: 0.6, verb: 0, pump: 0.5, notes: [32, 64, 128, 160, 192].flatMap(at => bass(H, at, 'x-------x-------')) },
    { inst: 'clean', gain: 0.5, pan: -0.25, verb: 0.12, notes: [64, 160].flatMap(at => rhythm(H, at, '...x..x....x..x.')) },
    { inst: 'pad', tone: 0.2, gain: 0.5, verb: 0.5, notes: rhythm(H, 96, 'x---------------') },
  ],
  drums: [{ kit: 'electro', gain: 0.85, hits: [...drumBars({ kick: 'x...x...x...x...', hat: '..x...x...x...x.' }, 0, 8), ...[32, 64, 128, 160, 192].flatMap(at => drumBars(HOUSE_OPEN, at, 8, { crash: true, fill: 'snare1' })), ...drumBars({ clap: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' }, 96, 8)] }],
}, { bar: 4, phrase: 16, shape: [0.9, 1, 0.86], gate: 0.78, accent: 0.08 });

const T = prog('Dm Bb F C Dm Gm Bb A');
const pulse = (at: number, v = 0.65) => comp(T, 4, at, 'xxxxxxxxxxxxxxxx', c => voicing(c, 'D3'), { arp: [0, 1, 2, 1, 3, 2, 1, 2], v });
const horizon = 'D4:8 A4:4 F4:4 D5:8 C5:4 Bb4:4 A4:6 C5:2 F5:4 E5:4 D5:8 C5:8 | F5:4 E5:4 D5:8 Bb4:4 A4:4 G4:8 F4:4 Bb4:4 D5:8 C#5:4 E5:4 A4:8';
export const photonRun: SongDef = perform({
  ...meta('photon-run', 'Photon Run', 'Cinematic Electronica', 104, ['#061b35', '#27d9ff'], 'grid'),
  sections: [section(0, 'Awakening'), section(32, 'Grid Pulse'), section(64, 'Light Trail'), section(96, 'Memory'), section(128, 'Pursuit'), section(160, 'Open Horizon'), section(192, 'Dawn')],
  player: [
    { inst: 'pluck', gain: 0.9, tone: 0.35, verb: 0.2, echo: 0.18, notes: [...pulse(0, 0.5).filter((_, i) => i % 2 === 0), ...pulse(32), ...pulse(128, 0.75).filter((_, i) => i % 8 < 6), ...pulse(192, 0.45).filter((_, i) => i % 2 === 0)] },
    { inst: 'strings', tone: 0.5, gain: 0.95, verb: 0.35, notes: [...seq(horizon, 64), ...seq(horizon, 160, { v: 0.8 })] },
    { inst: 'epiano', gain: 1.1, verb: 0.3, notes: seq(horizon, 96, { v: 0.6 }) },
  ],
  backing: [
    { inst: 'synthbass', tone: 0.45, gain: 0.8, verb: 0, pump: 0.35, notes: [32, 64, 128, 160].flatMap(at => bass(T, at, 'x.x.x.x.x.x.x.x.')) },
    { inst: 'pad', tone: 0.25, gain: 0.55, verb: 0.5, notes: [0, 32, 96, 192].flatMap(at => rhythm(T, at, 'x---------------', 'D3')) },
    { inst: 'brass', tone: 0.35, gain: 0.35, verb: 0.25, notes: [64, 160].flatMap(at => rhythm(T, at, 'x-------..x-----', 'D3')) },
    { inst: 'supersaw', tone: 0.4, gain: 0.45, verb: 0.2, pump: 0.5, notes: pulse(160, 0.45) },
    { inst: 'timpani', gain: 0.6, verb: 0.35, notes: seq('D2:4 .:12 Bb2:4 .:12 F2:4 .:12 C2:4 .:12 D2:4 .:12 G2:4 .:12 Bb2:4 .:12 A2:4 .:12', 160) },
  ],
  drums: [{ kit: 'electro', gain: 0.75, hits: [...drumBars(HALF_TIME, 32, 8), ...drumBars(FOUR_FLOOR, 64, 8, { crash: true }), ...drumBars({ rim: '........x.......' }, 96, 8), ...drumBars(HOUSE_OPEN, 128, 8, { fill: 'build4' }), ...drumBars({ ...HOUSE_OPEN, tomLo: 'x.......x.......' }, 160, 8, { crash: true, fill: 'toms2' }), ...drumBars({ kick: 'x.......x.......', shaker: 'x.x.x.x.x.x.x.x.' }, 192, 7)] }],
}, { bar: 4, phrase: 32, shape: [0.78, 1, 0.85], gate: 0.9, accent: 0.045 });
