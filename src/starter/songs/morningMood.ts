import { bassOf, comp, nearVoicing, prog, voicing } from '../arrange.ts';
import { drumBars } from '../patterns.ts';
import { diatonic, grid, seq } from '../score.ts';
import type { Hit, SongDef } from '../score.ts';

// Grieg, Morning Mood (Peer Gynt, 1875; public domain), as a slow chill-out groove in 6/8 and E major.
// Gentle eighth notes throughout: a calm song for learning the highway.
const BAR = 3;
const bar = (n: number) => n * BAR;
const E_MAJOR = [4, 6, 8, 9, 11, 1, 3];

const PHRASE = 'G#5:2 E5 D#5 C#5 D#5 E5 | G#5:2 E5 D#5 C#5 D#5:1 E5 D#5 E5 | G#5:2 E5 G#5 B5 G#5 E5 | C#6:2 G#5 C#6 D#6:6';
const PHRASE_H = prog('E E E B');
const ARPS_H = prog('E E B B C#m A B E');
const OUTRO = 'G#5:6 E5 | B4:12 | E5+G#5+B5:12 | .:12';

const arps = (h: string[], from: number, v = 0.7) => comp(h, BAR, bar(from), 'x.x.x.x.x.x.', (c) => nearVoicing(c, 'E4'), { arp: [0, 1, 2, 3, 2, 1], v });
const keys = (h: string[], from: number, v = 0.5) => comp(h, BAR, bar(from), 'x-----x-----', (c) => voicing(c, 'G#3'), { v });
const bass = (h: string[], from: number) => comp(h, BAR, bar(from), 'x-----x.....', (c) => [bassOf(c, 'E1')], { v: 0.75 });
const LOFI = { kick: 'x.......x...', rim: '......x.....', shaker: 'x.x.x.x.x.x.' };

// Bar map: intro 0, phrase 4, phrase in B 12, arpeggios 20, sunrise 28, morning 36, outro 44, end 48.
function drums(): Hit[] {
  return [
    ...drumBars({ shaker: 'x.x.x.x.x.x.' }, bar(12), 8, { beats: BAR }),
    ...drumBars(LOFI, bar(20), 8, { beats: BAR }),
    ...drumBars({ ...LOFI, snare: '......X.....' }, bar(28), 16, { beats: BAR, crash: true }),
    ...grid({ crash: 'X', kick: 'X' }, bar(46)),
  ];
}

export const morningMood: SongDef = {
  id: 'morning-mood',
  name: 'Morning Mood',
  artist: 'Edvard Grieg',
  album: 'Peer Gynt Suite No. 1',
  genre: 'Classical Chill',
  year: '1875',
  composer: 'Edvard Grieg',
  loadingPhrase: 'Breathe in with the flute. A good song for a first try.',
  tempo: [{ beat: 0, bpm: 88 }],
  timeSigs: [{ beat: 0, num: 6, den: 8 }],
  sections: [
    { beat: bar(0), name: 'Before Dawn' },
    { beat: bar(4), name: 'Flute' },
    { beat: bar(12), name: 'Oboe' },
    { beat: bar(20), name: 'Birdsong' },
    { beat: bar(28), name: 'Sunrise' },
    { beat: bar(36), name: 'Morning' },
    { beat: bar(44), name: 'Day' },
  ],
  player: [
    { inst: 'pluck', tone: 0.4, gain: 1.2, verb: 0.35, echo: 0.2, notes: [...seq(PHRASE + ' | ' + PHRASE, bar(4)), ...seq(PHRASE + ' | ' + PHRASE, bar(12), { transpose: -5 }), ...arps(ARPS_H, 20)] },
    { inst: 'supersaw', tone: 0.4, gain: 0.9, verb: 0.35, echo: 0.2, notes: [...seq(PHRASE + ' | ' + PHRASE, bar(28), { transpose: -12 }), ...seq(PHRASE + ' | ' + PHRASE, bar(36), { transpose: -12, v: 0.85 }), ...seq(OUTRO, bar(44), { transpose: -12 })] },
  ],
  backing: [
    { inst: 'piano', gain: 0.9, pan: -0.15, verb: 0.4, notes: [...keys(prog('E E B E'), 0), ...keys([...PHRASE_H, ...PHRASE_H], 4), ...keys([...PHRASE_H, ...PHRASE_H].map((c) => (c === 'E' ? 'B' : 'F#')), 12), ...keys(ARPS_H, 20), ...keys([...PHRASE_H, ...PHRASE_H, ...PHRASE_H, ...PHRASE_H], 28), ...keys(prog('E A E E'), 44)] },
    { inst: 'strings', gain: 0.7, pan: 0.25, verb: 0.5, notes: comp([...PHRASE_H, ...PHRASE_H, ...PHRASE_H, ...PHRASE_H], BAR, bar(28), 'x-----------', (c) => voicing(c, 'B3'), { v: 0.5 }) },
    { inst: 'bell', gain: 0.3, pan: 0.3, verb: 0.5, echo: 0.3, notes: diatonic(seq(PHRASE + ' | ' + PHRASE, bar(36), { v: 0.45 }), E_MAJOR, -2) },
    { inst: 'synthbass', tone: 0.3, gain: 0.7, verb: 0, notes: [...bass([...PHRASE_H, ...PHRASE_H].map((c) => (c === 'E' ? 'B' : 'F#')), 12), ...bass(ARPS_H, 20), ...bass([...PHRASE_H, ...PHRASE_H, ...PHRASE_H, ...PHRASE_H], 28), ...seq('E1:12 A1 E1 E1', bar(44))] },
  ],
  drums: [{ kit: 'electro', hits: drums(), gain: 0.75, verb: 1.3 }],
  solos: [],
  lengthBeats: bar(48),
  previewBeat: bar(28),
  art: { from: '#2b1b3d', to: '#ffb36b', ink: '#fff5e6', motif: 'sun' },
};
