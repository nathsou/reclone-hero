import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { drumBars, HOUSE_OPEN, FOUR_FLOOR, HALF_TIME } from '../patterns.ts';
import { loop, seq } from '../score.ts';
import type { Part, SongDef } from '../score.ts';

// Original compositions informed by four production palettes: raw French house (Homework),
// melodic disco/house (Discovery), mechanical guitar/electro (Human After All), and the
// orchestral/electronic contrast of TRON: Legacy. No melodies or samples from those records.
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
const warehouseParts = (at: number, tone: number): Part[] => [
  { inst: 'synthbass', tone, gain: 1.15, verb: 0.05, pump: 0.35, notes: loop(seq(warehouseRiff), 8, 4, at) },
  { inst: 'organ', tone, gain: 0.65, verb: 0.1, pump: 0.45, notes: rhythm(H, at, '..x...x..x....x.', 'F3') },
];
export const warehouseCurrent: SongDef = {
  ...meta('warehouse-current', 'Warehouse Current', 'French House', 125, ['#29191b', '#ff793a'], 'bars'),
  sections: [section(0, 'Needle Drop'), section(32, 'Filter Opens'), section(64, 'Warehouse'), section(96, 'Dub Break'), section(128, 'Rebuild'), section(160, 'Full Circuit'), section(192, 'Runout')],
  player: [...warehouseParts(0, 0.2), ...warehouseParts(32, 0.4), ...warehouseParts(64, 0.7), ...warehouseParts(128, 0.5), ...warehouseParts(160, 0.8), { inst: 'pluck', gain: 0.8, tone: 0.3, verb: 0.3, echo: 0.4, notes: rhythm(H, 96, 'x---......x---..') }, ...warehouseParts(192, 0.25)],
  backing: [
    { inst: 'subbass', gain: 0.6, verb: 0, pump: 0.5, notes: [32, 64, 128, 160, 192].flatMap(at => bass(H, at, 'x-------x-------')) },
    { inst: 'clean', gain: 0.5, pan: -0.25, verb: 0.12, notes: [64, 160].flatMap(at => rhythm(H, at, '...x..x....x..x.')) },
    { inst: 'pad', tone: 0.2, gain: 0.5, verb: 0.5, notes: rhythm(H, 96, 'x---------------') },
  ],
  drums: [{ kit: 'electro', gain: 0.85, hits: [...drumBars({ kick: 'x...x...x...x...', hat: '..x...x...x...x.' }, 0, 8), ...[32, 64, 128, 160, 192].flatMap(at => drumBars(HOUSE_OPEN, at, 8, { crash: true, fill: 'snare1' })), ...drumBars({ clap: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' }, 96, 8)] }],
};

const D = prog('Dmaj7 Bm7 Gmaj7 A7 Dmaj7 F#m7 Em7 A7');
const prismHook = 'F#5:2 E5:2 D5:4 A4:2 B4:2 D5:4 F#5:3 D5:1 B4:4 A4:4 F#4:4 | B4:2 D5:2 G5:4 F#5:4 D5:4 E5:3 C#5:1 A4:4 C#5:4 E5:4 | F#5:2 A5:2 F#5:4 E5:2 D5:2 A4:4 C#5:4 A4:2 F#4:2 E4:4 F#4:4 | G4:2 B4:2 E5:4 D5:4 B4:4 C#5:6 B4:2 A4:8';
export const prismParade: SongDef = {
  ...meta('prism-parade', 'Prism Parade', 'Disco House', 118, ['#271653', '#52e5d4'], 'rings'),
  sections: [section(0, 'Sparkle'), section(32, 'Disco Steps'), section(64, 'Prism Hook'), section(96, 'Electric Piano'), section(128, 'Lift'), section(160, 'Rainbow'), section(192, 'Last Dance')],
  player: [
    { inst: 'clean', gain: 1.1, verb: 0.1, pump: 0.3, notes: [0, 32, 128, 192].flatMap(at => rhythm(D, at, '..x..x....x..x..')) },
    { inst: 'supersaw', tone: 0.45, gain: 0.85, verb: 0.25, echo: 0.1, notes: [...seq(prismHook, 64), ...seq(prismHook, 160, { transpose: 12, v: 0.65 })] },
    { inst: 'piano', gain: 1.5, verb: 0.35, echo: 0.1, notes: comp(D, 4, 96, 'x.x...x.x...x.x.', c => voicing(c, 'D4'), { arp: [0, 2, 1, 3, 2, 1], v: 0.7 }) },
  ],
  backing: [
    { inst: 'synthbass', gain: 0.9, tone: 0.5, verb: 0, pump: 0.25, notes: [32, 64, 128, 160, 192].flatMap(at => bass(D, at, 'x..x..x.x..x..x.')) },
    { inst: 'pad', gain: 0.5, tone: 0.35, verb: 0.4, pump: 0.5, notes: [0, 64, 96, 160].flatMap(at => rhythm(D, at, 'x---------------')) },
    { inst: 'brass', gain: 0.5, pan: 0.25, verb: 0.15, notes: [64, 160].flatMap(at => rhythm(D, at, '......x.......x.', 'D4')) },
    { inst: 'pluck', gain: 0.4, pan: -0.25, verb: 0.2, echo: 0.3, notes: comp(D, 4, 128, 'x.x.x.x.x.x.x.x.', c => voicing(c, 'D4'), { arp: [0, 1, 2, 3], v: 0.5 }) },
  ],
  drums: [{ kit: 'electro', gain: 0.75, hits: [...drumBars({ shaker: 'xxxxxxxxxxxxxxxx' }, 0, 8), ...[32, 64, 128, 160, 192].flatMap(at => drumBars(HOUSE_OPEN, at, 8, { crash: true, fill: 'toms1' })), ...drumBars({ kick: 'x.......x.......', rim: '....x.......x...' }, 96, 8)] }],
  solos: [[96, 128]],
};

const A = prog('E5 E5 G5 A5 E5 E5 C5 D5');
const piston = 'E3*:1 E3* . E3* G3*:2 E3*:1 . E3*:2 D3*:1 E3* B3*:2 G3*:2';
export const assemblyLine: SongDef = {
  ...meta('assembly-line', 'Assembly Line', 'Electro Rock', 110, ['#282b2f', '#d9d6c7'], 'shards'),
  sections: [section(0, 'Boot'), section(32, 'Pistons'), section(64, 'Human Override'), section(96, 'Power Cut'), section(128, 'Restart'), section(160, 'Overdrive'), section(192, 'Shutdown')],
  player: [
    { inst: 'drive', gain: 0.95, verb: 0.08, notes: [0, 32, 128, 192].flatMap(at => loop(seq(piston), 8, 4, at)) },
    { inst: 'drive', gain: 1.2, tone: 0.7, verb: 0.08, notes: [64, 160].flatMap(at => comp(A, 4, at, 'mm.m..m.mm.m..m.', c => voicing(c, 'E2'), { v: 0.8 })) },
    { inst: 'chip', tone: 0.3, gain: 0.75, verb: 0.12, echo: 0.1, notes: [...loop(seq('E4:2 .:2 B4:2 G4:2 E4:4 D4:2 B3:2'), 8, 4, 96)] },
  ],
  backing: [
    { inst: 'synthbass', tone: 0.65, gain: 0.65, verb: 0, notes: [0, 32, 64, 128, 160, 192].flatMap(at => bass(A, at, 'x.x.x.x.x.x.x.x.')) },
    { inst: 'organ', gain: 0.45, verb: 0.1, pump: 0.5, notes: [64, 160].flatMap(at => rhythm(A, at, 'x---....x---....', 'E3')) },
    { inst: 'subbass', gain: 0.5, verb: 0, notes: bass(A, 96, 'x---------------') },
  ],
  drums: [{ kit: 'electro', gain: 0.85, hits: [...[0, 32, 64, 128, 160, 192].flatMap(at => drumBars({ ...FOUR_FLOOR, kick: 'x.x.x...x.x.x...' }, at, 8, { crash: at !== 0, fill: 'flam' })), ...drumBars(HALF_TIME, 96, 8)] }],
};

const T = prog('Dm Bb F C Dm Gm Bb A');
const pulse = (at: number, v = 0.65) => comp(T, 4, at, 'xxxxxxxxxxxxxxxx', c => voicing(c, 'D3'), { arp: [0, 1, 2, 1, 3, 2, 1, 2], v });
const horizon = 'D4:8 A4:4 F4:4 D5:8 C5:4 Bb4:4 A4:6 C5:2 F5:4 E5:4 D5:8 C5:8 | F5:4 E5:4 D5:8 Bb4:4 A4:4 G4:8 F4:4 Bb4:4 D5:8 C#5:4 E5:4 A4:8';
export const photonRun: SongDef = {
  ...meta('photon-run', 'Photon Run', 'Cinematic Electronica', 104, ['#061b35', '#27d9ff'], 'grid'),
  sections: [section(0, 'Awakening'), section(32, 'Grid Pulse'), section(64, 'Light Trail'), section(96, 'Memory'), section(128, 'Pursuit'), section(160, 'Open Horizon'), section(192, 'Dawn')],
  player: [
    { inst: 'pluck', gain: 0.9, tone: 0.35, verb: 0.2, echo: 0.18, notes: [...pulse(0, 0.5).filter((_, i) => i % 2 === 0), ...pulse(32), ...pulse(128, 0.75), ...pulse(192, 0.45).filter((_, i) => i % 2 === 0)] },
    { inst: 'strings', tone: 0.5, gain: 0.95, verb: 0.35, notes: [...seq(horizon, 64), ...seq(horizon, 160, { transpose: 12, v: 0.7 })] },
    { inst: 'piano', gain: 1.3, verb: 0.5, notes: seq(horizon, 96, { v: 0.6 }) },
  ],
  backing: [
    { inst: 'synthbass', tone: 0.45, gain: 0.8, verb: 0, pump: 0.35, notes: [32, 64, 128, 160].flatMap(at => bass(T, at, 'x.x.x.x.x.x.x.x.')) },
    { inst: 'pad', tone: 0.25, gain: 0.55, verb: 0.5, notes: [0, 32, 96, 192].flatMap(at => rhythm(T, at, 'x---------------', 'D3')) },
    { inst: 'brass', tone: 0.45, gain: 0.55, verb: 0.4, notes: [64, 160].flatMap(at => rhythm(T, at, 'x-------..x-----', 'D3')) },
    { inst: 'supersaw', tone: 0.4, gain: 0.45, verb: 0.2, pump: 0.5, notes: pulse(160, 0.45) },
    { inst: 'timpani', gain: 0.6, verb: 0.35, notes: seq('D2:4 .:12 Bb2:4 .:12 F2:4 .:12 C2:4 .:12 D2:4 .:12 G2:4 .:12 Bb2:4 .:12 A2:4 .:12', 160) },
  ],
  drums: [{ kit: 'electro', gain: 0.75, hits: [...drumBars(HALF_TIME, 32, 8), ...drumBars(FOUR_FLOOR, 64, 8, { crash: true }), ...drumBars({ rim: '........x.......' }, 96, 8), ...drumBars(HOUSE_OPEN, 128, 8, { fill: 'build4' }), ...drumBars({ ...HOUSE_OPEN, tomLo: 'x.......x.......' }, 160, 8, { crash: true, fill: 'toms2' }), ...drumBars({ kick: 'x.......x.......', shaker: 'x.x.x.x.x.x.x.x.' }, 192, 7)] }],
};
