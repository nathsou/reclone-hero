import { bassOf, comp, nearVoicing, prog } from '../arrange.ts';
import { drumBars, FOUR_FLOOR, ROCK, SYNTHWAVE } from '../patterns.ts';
import { loop, seq } from '../score.ts';
import type { SongDef } from '../score.ts';

// Three original pop singles: separate hooks, progressions, grooves and instrumental bridges.
// Each hook is eight bars long; the final chorus adds an octave answer rather than more chords.
function single(o: {
  id: string; name: string; artist: string; genre: string; bpm: number;
  verse: string; chorus: string; hook: string; bridge: string;
  sound: 'clean' | 'piano' | 'pluck'; groove: typeof ROCK; colors: [string, string];
}): SongDef {
  const V = prog(o.verse), C = prog(o.chorus), B = prog(o.bridge);
  const chords = (h: string[], at: number, rhythm: string, v = 0.6) => comp(h, 4, at, rhythm, c => nearVoicing(c, 'C4'), { v });
  const bass = (h: string[], at: number, busy = false) => comp(h, 4, at, busy ? 'x.....x.x..x..x.' : 'x-------x-------', c => [bassOf(c, 'E1'), bassOf(c, 'E1') + 7, bassOf(c, 'E1') + 12], { arp: busy ? [0, 1, 0, 2, 1] : [0], v: 0.75 });
  const arps = (h: string[], at: number) => comp(h, 4, at, 'x.x.x.x.x.x.x.x.', c => nearVoicing(c, 'C4'), { arp: [0, 1, 2, 1, 0, 2, 1, 2], v: 0.6 });
  const CHORUSES = [48, 112, 160];
  return {
    id: o.id, name: o.name, artist: o.artist, album: 'Radio Windows', genre: o.genre, year: '2026',
    loadingPhrase: 'A verse to find your feet, a chorus to sing with your fingers.',
    tempo: [{ beat: 0, bpm: o.bpm }], timeSigs: [{ beat: 0, num: 4, den: 4 }],
    sections: [{ beat: 0, name: 'Intro' }, { beat: 16, name: 'Verse' }, { beat: 48, name: 'Chorus' }, { beat: 80, name: 'Verse 2' }, { beat: 112, name: 'Chorus 2' }, { beat: 144, name: 'Bridge' }, { beat: 160, name: 'Final Chorus' }, { beat: 192, name: 'Outro' }],
    player: [
      { inst: o.sound, gain: o.sound === 'piano' ? 1.4 : 1.1, verb: 0.2, echo: 0.08, notes: [...arps(V.slice(0, 4), 0), ...chords(V, 16, 'x---..x...x---..'), ...chords(V, 80, 'x---..x...x---..'), ...arps(B, 144), ...arps(C.slice(0, 4), 192)] },
      { inst: o.sound === 'clean' ? 'lead' : 'supersaw', tone: 0.45, gain: 0.85, verb: 0.25, echo: 0.1, notes: CHORUSES.flatMap((at, i) => seq(o.hook, at, { v: 0.7, transpose: i === 2 ? 12 : 0 })) },
    ],
    backing: [
      { inst: 'pad', gain: 0.55, tone: 0.3, verb: 0.35, pump: 0.25, notes: [...chords(V, 16, 'x---------------', 0.5), ...chords(V, 80, 'x---------------', 0.5), ...CHORUSES.flatMap(at => chords(C, at, 'x---------------')), ...chords(B, 144, 'x---------------'), ...chords(C.slice(0, 4), 192, 'x---------------', 0.4)] },
      { inst: o.sound === 'clean' ? 'pickbass' : 'synthbass', gain: 0.8, tone: 0.4, verb: 0, notes: [...bass(V, 16), ...bass(V, 80), ...CHORUSES.flatMap(at => bass(C, at, true)), ...bass(B, 144), ...bass(C.slice(0, 4), 192)] },
      { inst: 'piano', gain: 0.55, pan: -0.25, verb: 0.2, notes: CHORUSES.flatMap(at => chords(C, at, '..x...x...x...x.', 0.5)) },
      { inst: 'bell', gain: 0.3, pan: 0.25, verb: 0.3, notes: loop(seq('E6:2 .:6 D6:2 .:6'), 4, 4, 160) },
    ],
    drums: [{ kit: o.sound === 'clean' ? 'rock' : 'electro', gain: 0.72, hits: [...drumBars({ hat: 'x.x.x.x.x.x.x.x.' }, 0, 4), ...drumBars(o.groove, 16, 8, { fill: 'snare1' }), ...drumBars(o.groove, 80, 8, { fill: 'toms1' }), ...CHORUSES.flatMap(at => drumBars({ ...o.groove, ohat: '..x.......x.....' }, at, 8, { crash: true, fill: 'toms1' })), ...drumBars({ rim: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' }, 144, 4), ...drumBars(o.groove, 192, 3), { b: 204, k: 'crash', v: 0.6 }] }],
    solos: [[144, 160]], lengthBeats: 208, previewBeat: 48,
    art: { from: o.colors[0], to: o.colors[1], ink: '#fff5df', motif: 'sun' },
  };
}

export const paperHearts = single({
  id: 'paper-hearts', name: 'Paper Hearts', artist: 'Harbour Kites', genre: 'Power Pop', bpm: 132,
  verse: 'D A Bm G D A G A', chorus: 'G D A Bm G D A A', bridge: 'Em G Bm A', sound: 'clean', groove: ROCK, colors: ['#422247', '#ff867a'],
  hook: 'B4:2 A4:2 G4:4 D5:4 B4:4 A4:2 F#4:2 A4:4 F#4:8 | E5:2 D5:2 C#5:4 A4:4 E5:4 D5:6 B4:2 F#5:4 D5:4 | B4:2 A4:2 G4:4 D5:6 B4:2 A4:4 F#4:4 E4:4 D4:4 | E4:2 F#4:2 A4:4 C#5:4 B4:4 A4:12 .:4',
});
export const cityLights = single({
  id: 'city-lights', name: 'City Lights', artist: 'June Satellite', genre: 'Synth Pop', bpm: 116,
  verse: 'C Am F G C Am Dm G', chorus: 'F G Em Am F C Dm G', bridge: 'Am Em F G', sound: 'pluck', groove: SYNTHWAVE, colors: ['#16295c', '#ff50ba'],
  hook: 'A4:3 C5:1 A4:4 G4:4 F4:4 G4:3 B4:1 D5:4 B4:6 G4:2 | G4:4 B4:2 D5:2 E5:4 D5:4 C5:6 A4:2 E5:4 C5:4 | A4:2 G4:2 F4:4 A4:4 C5:4 E5:3 D5:1 C5:8 G4:4 | F4:2 A4:2 D5:4 C5:6 A4:2 B4:4 A4:4 G4:8',
});
export const goldenHour = single({
  id: 'golden-hour', name: 'Golden Hour', artist: 'Sunday Cinema', genre: 'Dance Pop', bpm: 122,
  verse: 'Fmaj7 Am7 Dm7 Bbmaj7 Fmaj7 C Dm7 Bbmaj7', chorus: 'Bb F C Dm Bb F Gm C', bridge: 'Gm Am Bb C', sound: 'piano', groove: FOUR_FLOOR, colors: ['#652c57', '#ffc466'],
  hook: 'D5:2 F5:2 D5:4 Bb4:6 A4:2 C5:4 A4:2 G4:2 F4:8 | G4:2 C5:2 E5:4 G5:4 E5:4 F5:3 E5:1 D5:4 A4:4 D5:4 | F5:4 D5:2 C5:2 Bb4:4 D5:4 C5:2 A4:2 F4:4 A4:8 | Bb4:2 A4:2 G4:4 D5:4 Bb4:4 C5:8 G4:4 C5:4',
});
