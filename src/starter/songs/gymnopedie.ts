import { abc } from '../abc.ts';
import type { Note, SongDef } from '../score.ts';

// Erik Satie, Gymnopédie No. 1 (1888; public domain), played straight on the piano: you play the
// right hand and the left hand's chords; the bass notes are played for you. After Colin Hume's
// transcription.
const MELODY = `
|: z3 | z3 | z3 | z3 | zfa | gfc | Bcd | A3 |
F3- | F3- | F3- | F3 | zfa | gfc | Bcd | A3 |
c3 | f3 | E3- | E3- | E3 | AB=c | edB | d=cB |
d3- | d2d | e=fg | a=cd | edB | d3- | d2d |
[1g3 | f3 | BAB | cde | cde | F3 | =c3 | d3 :|
[2g3 | =f3 | B=c=f | ed=c | ed=c | =F3 | =c3 | d3 |]
`;
const CHORDS = `
|: z[B,DF]2 | z[A,CF]2 | z[B,DF]2 | z[A,CF]2 | z[B,DF]2 | z[A,CF]2 | z[B,DF]2 | z[A,CF]2 |
z[B,DF]2 | z[A,CF]2 | z[B,DF]2 | z[A,CF]2 | z[B,DF]2 | z[A,CF]2 | z[B,DF]2 | z[A,CF]2 |
z[A,CF]2 | z[B,DF]2 | z[G,B,]2 | z[B,DG]2 | [K:bass] z[=F,A,D]2 | z[A,=CE]2 | z[G,B,E]2 | z[D,G,B,E]2 |
z[=C,E,A,D]2 | z[=C,E,A,D]2 | z[A,=C=F]2 | z[A,=CE]2 | z[D,G,B,E]2 | z[=C,E,A,D]2 | z[=C,F,A,D]2 |
[1 [K:treble] z[B,EG]2 | z[A,CF]2 | z[B,DF]2 | z[CEA]2 | z[A,CFA]2 | z[A,D][B,DG] |[=CEA=c]3 |[DFAd]3 :|
[2 z[B,EG]2 | z[A,D=FA]2 | z[A,=CF]2 | z[=CEA]2 | z[A,=C=FA]2 | z[A,D][B,DG] |[=CEA=c]3 |[D=FAd]3 |]
`;
const BASS = `
|: "Gmaj7"G3 | "Dmaj7"D3 | "Gmaj7"G3 | "Dmaj7"D3 | "Gmaj7"G3 | "Dmaj7"D3 | "Gmaj7"G3 | "Dmaj7"D3 |
"Gmaj7"G3 | "Dmaj7"D3 | "Gmaj7"G3 | "Dmaj7"D3 | "Gmaj7"G3 | "Dmaj7"D3 | "Gmaj7"G3 | "Dmaj7"D3 |
"F#m"F3 | "Bm"B,3 | "Em"E3 | "Em7"E3 | "Dm"D3 | "Am"A,3 | "Em7/D"D3 | "/"D3 |
"Am/D"D3 | "D7"D3 | "Dm7"D3 | "Am/D"D3 | "Em7/D"D3 | "Am/D"D3 | "D7"D3 |
[1 "Em"E3 | "F#m"F3 | "Bm"B,3 | "A/E"E3 | "F#m7/E"E3 | "/"EBe | "Am7"A3 | "D"[DAd]3 :|
[2 "Em"E3 | "Dm/E"E3 | "F/E"E3 | "Am/E"E3 | "F/E"E3 | "/"EBe | "Am7"[Ag]3 | "Dm"[DAd]3 |]
`;

const read = (voice: string, shift = 0): Note[] => abc(`M:3/4\nL:1/4\nK:D\n${voice}`, { transpose: shift }).notes;
const bar = (n: number) => n * 3;
const END = bar(78);

export const gymnopedie: SongDef = {
  id: 'gymnopedie',
  name: 'Gymnopédie No. 1',
  artist: 'Erik Satie',
  album: 'Trois Gymnopédies',
  genre: 'Impressionist',
  year: '1888',
  composer: 'Erik Satie',
  loadingPhrase: 'Lent et douloureux: slow, and a little sad. Take your time.',
  tempo: [
    { beat: 0, bpm: 72 },
    { beat: END - bar(2), bpm: 60 },
  ],
  timeSigs: [{ beat: 0, num: 3, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Lent et douloureux' },
    { beat: bar(4), name: 'Melody' },
    { beat: bar(16), name: 'Second Phrase' },
    { beat: bar(31), name: 'Close' },
    { beat: bar(39), name: 'Once More' },
    { beat: bar(55), name: 'Second Phrase' },
    { beat: bar(70), name: 'The Other Close' },
  ],
  player: [
    { inst: 'piano', gain: 1.2, pan: 0.1, verb: 0.45, notes: read(MELODY) },
    { inst: 'piano', gain: 1, pan: -0.05, verb: 0.45, notes: read(CHORDS).map((n) => ({ ...n, v: 0.55 })) },
  ],
  backing: [{ inst: 'piano', gain: 1, pan: -0.15, verb: 0.45, notes: read(BASS, -24).map((n) => ({ ...n, v: 0.6 })) }],
  drums: [],
  solos: [],
  lengthBeats: END + 3,
  previewBeat: bar(4),
  art: { from: '#1c2433', to: '#9fb4c7', ink: '#fbf8f2', motif: 'orbit' },
};
