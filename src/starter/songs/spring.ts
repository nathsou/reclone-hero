import { abc } from '../abc.ts';
import type { Note, SongDef } from '../score.ts';

// Antonio Vivaldi, La primavera (Spring), Op. 8 No. 1, first movement (1725; public domain),
// played straight by a string band: you are the solo violin. All five parts come from Frank
// Nordberg's transcription (musicaviva.com, via John Chambers' ABC collection), with a few
// slips in the second violins mended. The recapitulations and the second storm are cut: after
// the storm's ritornello the piece skips to the final ritornello.
const PRINCIPALE = `
e|gg gf/e/ b3 b/a/|gg gf/e/ b3 b/a/|ga/b/ ag fdBe|
gg gf/e/ b3 b/a/|gg gf/e/ b3 b/a/|ga/b/ ag f2 z e|ba/g/ ab
c'b2e|ba/g/ ab c'b2e|
c'b2a gf/e/ Tf2|e2 z e ba/g/ ab|c'b2e ba/g/ ab|c'b2 e c'b2 a|
gf/e/ Tf2 Mb2 Mb2|(Mb2 Mb2 Mb2
Mb2)|(.b.b.b.b) (.b.b.b.b)|(.b.b.b.b .b.b .bc'/d'/)|
(e'/d'/c'/b/ a/g/f/e/) z4|z8|z2 z (.e' .e'.e'.e'.e')|Te3 (.e' .e'.e'.e'.e')|
Te2 z2 b2-(b/e'/)(b/c'/)|b2-(b/e'/)(b/c'/) (b/e'/)(b/c'/)
(b/e'/)(b/c'/)|(b/e'/)(b/c'/) (b/e'/)(b/c'/) (.b.e) Tg2|
z2 Tg2 z2 g2|z2 Tg2 (.e'2.e'2)|Te'4 (.e'2.e'2)|Te'4 z2 z e|
ba/g/ ab c'b2e|ba/g/ ab c'b2e|c'b2a gf/e/ Tf2|e
(G/A/) (B/A/)(B/A/) (G/A/)(G/A/) (B/A/)(B/A/)|
(G/A/)(G/A/)
(B/A/)(B/A/) (G/A/)(G/A/) (B/c/)(B/c/)|(d/e/)(d/e/) (f/e/)(f/e/)
(d/e/)(d/e/) (f/e/)(f/e/)|(d/e/)(d/e/) (f/g/)(f/g/) (a/g/)(a/g/) (f/a/)(g/f/)|
g(f/e/) (d/c/)(B/A/) (G/A/)(G/A/) (B/A/)(B/A/)|(G/A/)(G/A/) (B/A/)(B/A/)
(G/A/)(G/A/) (B/A/)(B/A/)|G2 z g a4|
g4f4|g4a4|g4f2 z B|fe/d/ ef gf2B|
fe/d/ ef gf2B|gf2e dc/B/ c2|B/ B,/4B,/4B,/4B,/4B,/4B,/4
B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4|
(B/4c/4d/4e/4f/4g/4a/4b/4) z2 (B/4c/4d/4e/4f/4g/4a/4b/4)
z2|B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4
A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4 A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4|
(3b/g/b/(3e'/b/e'/ (3b/g/b/(3e'/b/e'/ (3b/g/b/(3d'/b/d'/
(3b/g/b/(3d'/b/d'/|c'2 z2 (3c'/^a/c'/(3f'/c'/f'/
(3c'/a/c'/(3f'/c'/f'/|(3c'/^a/c'/(3e'/c'/e'/ (3c'/a/c'/(3e'/c'/e'/ d'2 z2|
(3d'/^b/d'/(3g'/d'/g'/ (3d'/b/d'/(3g'/d'/g'/ (3d'/b/d'/(3f'/d'/f'/
(3d'/b/d'/(3f'/d'/f'/|e'2 z2 (3e'/c'/e'/(3g'/e'/g'/ (3e'/c'/e'/(3g'/e'/g'/|
(3d'/b/d'/(3g'/d'/g'/ (3d'/b/d'/(3g'/d'/g'/ (3c'/a/c'/(3f'/c'/f'/
(3c'/a/c'/(3f'/c'/f'/|(3b/g/b/(3e'/b/e'/ (3b/g/b/(3e'/b/e'/
(3a/f/a/(3d'/a/d'/ (3a/f/a/(3d'/a/d'/|
(3g/e/g/(3c'/g/c'/ (3g/e/g/(3c'/g/c'/ (3g/d/g/(3c'/g/c'/
(3g/d/g/(3c'/g/c'/|(3g/d/g/(3^b/g/b/ (3g/d/g/(3b/g/b/ c'2 z
c|gf/e/ fg ag2c|
gf/e/ fg ag2c|ag2f ed/c/Td2|(c .g.g.g
.g.g.g.g)|(.a.a.^a.a .b.b.^b.b)|Tc'8-|
(c'/d'/)(c'/d'/) c'2 (c'/d'/)(c'/d'/) Tc'2-|(c'/d'/)(c'/d'/)
(c'/d'/)(c'/d'/) Tc'4-|(c'/4d'/4)(c'/4d'/4)(c'/4d'/4)(c'/4d'/4)
(c'/4d'/4)(c'/4d'/4)(c'/4d'/4)(c'/4d'/4) Tc'4|
gg gf/g/ a3 a/g/|ff fe/f/ g3 g/a/|bb bb/a/ gg gg/a/|bb bb/a/ gg gg/a/|
bb ba/g/ (f/B/)(c/B/) (d/c/)(e/d/)|(f/e/)(g/f/) (a/g/)(b/a/)
(B/A/)(c/B/) (d/c/)(e/d/)|(f/e/)(g/f/) (a/g/)(b/a/) (g/e/)(f/e/)
(g/e/)(f/e/)|(a/e/)(f/e/) (a/e/)(f/e/) (b/e/)(f/e/) (b/e/)(f/e/)|
(c'd')e'2 (e'/b/)(e'/b/) (c'/b/)(e'/b/)|(c'/b/)(e'/b/)
(c'/b/)(e'/b/) e'e Tf2|e>g ab c'b2e|ba/g/ ab c'b2e|
c'b2a gf/e/ Tf2|e2 z e ba/g/ ab|c'b2e ba/g/ ab|c'b2e c'b2a|gf/e/ Tf2 He4|]
`;
const VIOLINO_1 = `
e|gg gf/e/ b3 b/a/|gg gf/e/ b3 b/a/|ga/b/ ag fdBe|
gg gf/e/ b3 b/a/|gg gf/e/ b3 b/a/|ga/b/ ag f2 ze|ba/g/ ab
c'b2e|ba/g/ ab c'b2e|
c'b2a gf/e/ Tf2|e2 z e ba/g/ ab|c'b2e ba/g/ ab|c'b2 e c'b2 a|
gf/e/ Tf2 e2 z2|z8|z4 Mb2 Mb2|Mb2 Mb2 Mb2 Mb2|
(.b.b.b.b .b.b.b.b)|(.b.b.b.b .b.b .b)c'/d'/|
e'/d'/c'/b/ a/g/f/e/ z2 z (.e'|.e'.e'.e'.e') Te3 (.e'|
.e'.e'.e'.e') Te2 Tg2|z2 Tg2 z2 Tg2|z2 Tg2 b2-(b/e'/)(b/c'/)|
b2-(b/e'/)(b/c'/) (b/e'/)(b/c'/) (b/e'/)(b/c'/)|(b/e'/)(b/c'/)
(b/e'/)(b/c'/) be z2|(.e'2 .e'2) Te'4|(.e'2.e'2) Te'2 z e|
ba/g/ ab c'b2e|ba/g/ ab c'b2e|c'b2a gf/e/ Tf2|e
(G/A/) (B/A/)(B/A/) (G/A/)(G/A/) (B/A/)(B/A/)|
(G/A/)(G/A/)
(B/A/)(B/A/) (G/A/)(G/A/) (B/c/)(B/c/)|(d/e/)(d/e/) (f/e/)(f/e/)
(d/e/)(d/e/) (f/e/)(f/e/)|(d/e/)(d/e/) (f/g/)(f/g/) (a/g/)(a/g/) (f/a/)(g/f/)|
g(f/e/) (d/c/)(B/A/) (G/A/)(G/A/) (B/A/)(B/A/)|(G/A/)(G/A/) (B/A/)(B/A/)
(G/A/)(G/A/) (B/A/)(B/A/)|G2 z g a4|
g4f4|g4a4|g4f2 z B|fe/d/ ef gf2B|
fe/d/ ef gf2B|gf2e dc/B/ c2|B/ B,/4B,/4B,/4B,/4B,/4B,/4
B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4|
(B/4c/4d/4e/4f/4g/4a/4b/4) z2 (B/4c/4d/4e/4f/4g/4a/4b/4)
z2|B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4
A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4 A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4|
G,2 z2 z4|NA,4 ^A,2 z2|z4 NB,4|
^B,2 z2 z4|NC4 C2 z2|
NB,4 A,2 z2|NG4 F2 z2|
NE2 NC2 NG,2 NG,2|NG,4 C2  z c|gf/e/ fg ag2c|
gf/e/ fg ag2c|ag2f ed/c/Td2|c2 z2 z4|z8|z (.c.c.c)
(.c.c.c.d)|(.e.e.^e.e) (.f.f.^^f.f)|
g2-(g/a/)(g/a/) g2-(g/a/)(g/a/)|Tg4-(g/a/)(g/a/)
(g/a/)(g/a/)|Tg4-(g/4a/4)(g/4a/4)(g/4a/4)(g/4a/4) (g/4a/4)(g/4a/4)(g/4a/4)(g/4a/4)|
gg gf/g/ a3 a/g/|ff fe/f/ g3 g/a/|bb bb/a/ gg gg/a/|bb bb/a/ gg gg/a/|
bb ba/g/ f2 z2|z8|z8|z8|
z8|z8|ba/g/ ab c'b2e|ba/g/ ab c'b2e|
c'b2a gf/e/ Tf2|e2 z e ba/g/ ab|c'b2e ba/g/ ab|c'b2e c'b2a|gf/e/ Tf2 He4|]
`;
const VIOLINO_2 = `
c|eeee g3 g/f/|eeee g3 g/f/|ef/g/ fe d2 zc|
eeee g3 g/f/|eeee g3 g/f/|ef/g/ fe d2 z g|gf/e/ fg ag2g|gf/e/ fg ag2g|
ag2f e2 d2|e2 z e gf/e/ fg|ag2e gf/e/ fg|ag2 g ag2 f|
e2 d2 e2 z2|z/ a/g/a/ Tg2 z/ a/g/a/ Tg2|z (b/4a/4g/4f/4) e2 z
(b/4a/4g/4f/4) e2|z/ a/g/a/ Tg2 z/ a/g/a/ Tg2|
z4 z (b/4a/4g/4f/4) e2|z (b/4a/4g/4f/4) e2 z (b/4a/4g/4f/4) e2|z4
(g>a)(g>a)|(g>a)(g>a) (g/a/) (g/a/)  (g/a/) (g/a/)|
(g/4a/4g/4a/4) (g/4a/4g/4a/4)  (g/4a/4g/4a/4) (g/4a/4g/4a/4) Tg2 z2|Tg2
z2 Tg2 z2|Tg2 z2 Tg2 z2|
Tg2 z2 Tg2 z2|Tg2 z2 e2-(e/b/)(e/f/)|e2-(e/b/)(e/f/) (e/b/)(e/f/)
(e/b/)(e/f/)|(e/b/)(e/f/) (e/b/)(e/f/) e2 z e|
gf/e/ fg ag2g|gf/e/ fg ag2g|ag2f e2 d2|e (E/F/) (G/F/)(G/F/)
(E/F/)(E/F/) (G/F/)(G/F/)|
(E/F/)(E/F/) (G/F/)(G/F/) (E/F/)(E/F/) (G/A/)(G/A/)|(B/c/)(B/c/)
(d/c/)(d/c/) (B/c/)(B/c/) (d/c/)(d/c/)|(B/c/)(B/c/) (d/e/)(d/e/)
(f/e/)(f/e/) (d/f/)(e/d/)|
e(d/c/) (B/A/)(G/F/) (E/F/)(E/F/) (G/F/)(G/F/)|(E/F/)(E/F/) (G/F/)(G/F/)
(E/F/)(E/F/) (G/F/)(G/F/)|E2 z e f4|
e4d4|e4f4|e4d2 z d|dc/B/ cd ed2d|
dc/B/ cd ed2d|ed2c B2 ^A2|B/ B,/4B,/4B,/4B,/4B,/4B,/4
B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4|
(B/4c/4d/4e/4f/4g/4a/4b/4) z2 (B/4c/4d/4e/4f/4g/4a/4b/4)
z2|B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4
A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4 A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4|
G,2 z2 z4|NA,4 ^A,2 z2|z4 NB,4|
^B,2 z2 z4|NC4 C2 z2|
NB,4 A,2 z2|NG4 F2 z2|
NE2 NC2 NG,2 NG,2|NG,4 C2 z G|ed/c/ de fe2e|
ed/c/ de fe2e|fe2d c2 ^B2|c2 z2 z4|z8|z8|z8|
e2-(e/f/)(e/f/) e2-(e/f/)(e/f/)|Te4-(e/f/)(e/f/)
(e/f/)(e/f/)|Te4-(e/4f/4)(e/4f/4)(e/4f/4)(e/4f/4) (e/4f/4)(e/4f/4)(e/4f/4)(e/4f/4)|
ee ed/e/ f3 f/e/|dd dc/d/ e3 e/f/|gg gg/f/ ee ee/f/|gg gg/f/ ee ee/f/|
gg gf/e/ d2 z2|z8|z8|z8|
z8|z8|gf/e/ fg ag2g|gf/e/ fg ag2g|
ag2f e2 d2|e2 z g gf/e/ fg|ag2g gf/e/ fg|ag2g ag2f|e2 d2 He4|]
`;
const VIOLA = `
G|BBBB E3G/A/|BBBB E3G/A/|BB cc F2 z G|
BBBB E3G/A/|BBBB E3G/A/|BBcc F2 z G|E2E2 AE2E|E2E2 AE2E|
AE2d B2B2|G2 z B E2E2|AE2B E2E2|AE2E AE2d|
B2B2 G2 z2|z8|z8|z8|
z8|z8|z8|z8|
z8|z8|z8|
z8|z8|z8|z4 z2 z B|
E2E2 AE2B|E2E2 AE2B|E2Gd B2B2|G B,B,B, B,B,B,B,|
B,B,B,B, B,B,B,B,|B, FFF FFFF|FFFF DDDD|
B,B,B,B, B,B,B,B,|B,B,B,B, B,B,B,B,|B,8-|
B,8|B,8|B,4 B,2 z F|B,2B,2 EB,2F|
B,2B,2 EB,2F|EB,E^A F2F2|B/ B,/4B,/4B,/4B,/4B,/4B,/4
B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4|
B, z B, z B, z B, z|B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4
B,/4B,/4B,/4B,/4B,/4B,/4B,/4B,/4 A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4 A,/4A,/4A,/4A,/4A,/4A,/4A,/4A,/4|
G,2 z2 z4|NA,4 ^A,2 z2|z4 NB,4|
^B,2 z2 z4|NC4 C2 z2|
NB,4 A,2 z2|NG4 F2 z2|
NE2 NC2 NG,2 NG,2|NG,4 C2 z G|C2C2 FC2G|
C2C2 FC2G|FCF=c G2G2|E2 z2 z4|z8|z8|z8|
z8|z8|z8|
EEEE CCFA|AAFD B,B,B,B,|B,B,B,B, B,B,B,B,|B,B,B,B, B,B,B,B,|
B,B,B,B, B,2 z2|z8|z8|z8|
z8|z8|E2E2 AE2B|E2E2 AE2B|
AEGd B2B2|G2 z B E2E2|AE2B E2E2|AE2B AEGd|B2B2 HG4|]
`;
const BASSO = `
e|e2e2e2e2|e2e2e2e2|ee A^A B2 z e|
e2e2e2e2|e2e2e2e2|ee A^A B2 z e|e2e2e2e2|e2e2e2e2|
e2 eB eE bB|E2 z e e2e2|e2e2e2e2|e2e2e2e2|
eE bB E2 z2|z8|z8|z8|
z8|z8|z8|z8|
z8|z8|z8|
z8|z8|z8|z4 z2 z e|
e2e2e2e2|e2e2e2e2|e2 eB eE bB|eeee eeee|
eeee eeee|BBBB BBBB|BBBB BBBB|
eeee eeee|eeee eeee|(e/B/)(e/B/) (e/B/)(e/B/) (d/B/)(d/B/) (d/B/)(d/B/)|
(e/B/)(e/B/) (e/B/)(e/B/) (f/B/)(f/B/) (f/B/)(f/B/)|(e/B/)(e/B/)
(e/B/)(e/B/) (d/B/)(d/B/) (d/B/)(d/B/)|(e/B/)(e/B/) (e/B/)(e/B/) B2 z B|B2B2B2B2|
B2B2B2B2|B2 Bf bB fF|
B/4B/4B/4B/4B/4B/4B/4B/4 B/4B/4B/4B/4B/4B/4B/4B/4
B/4B/4B/4B/4B/4B/4B/4B/4 B/4B/4B/4B/4B/4B/4B/4B/4|
B z B z B z B z|B/4B/4B/4B/4B/4B/4B/4B/4
B/4B/4B/4B/4B/4B/4B/4B/4 A/4A/4A/4A/4A/4A/4A/4A/4 A/4A/4A/4A/4A/4A/4A/4A/4|
G2 z2 z4|NA4 ^A2 z2|z4 NB4|
^B2 z2 z4|Nc4 c2 z2|
NB4 A2 z2|Ng4 f2 z2|
Ne2 Nc2 NG2 NG2|NG4 c2  z c|c2c2c2c2|
c2c2c2c2|c2 cg c'c gG|c8-|c8-|c8-|c8-|
c8-|c8-|c8|
cccc ffff|BBBB eeeB|eeeB eeeB|eeeB eeeB|
eeeB [B2B2-]B2-|B8-|B4 e2e2|f2f2g2g2|
(a2g)f e2 z2|e2 z2 e2B2|e2e2e2e2|e2e2e2e2|
e2 eB eE bB|E2 z e e2e2|e2e2e2e2|e2e2e2 eB|eE bB HE4|]
`;

const read = (voice: string): Note[] => abc(`M:C\nL:1/8\nK:E\n${voice}`).notes;
const PICKUP = 3.5; // the solo's upbeat lands on beat 3.5 of an empty first bar
const CUT = 0.5 + 58 * 4; // end of bar 58
/** Bars 0-58, then the final ritornello (which starts a bar earlier in the solo part). */
function excerpt(voice: string, finalBar: number): Note[] {
  const notes = read(voice);
  const from = 0.5 + (finalBar - 1) * 4;
  return [
    ...notes.filter((n) => n.b < CUT - 1e-6).map((n) => ({ ...n, b: n.b + PICKUP, d: Math.min(n.d, CUT - n.b) })),
    ...notes.filter((n) => n.b >= from - 1e-6).map((n) => ({ ...n, b: n.b - from + CUT + PICKUP })),
  ];
}
const soft = (notes: Note[], v: number): Note[] => notes.map((n) => ({ ...n, v }));
const down = (notes: Note[], semis: number): Note[] => notes.map((n) => ({ ...n, p: n.p.map((p) => p + semis) }));

const bar = (n: number) => n * 4;
const BASSO_LINE = excerpt(BASSO, 76);

export const spring: SongDef = {
  id: 'spring',
  name: 'Spring (Allegro)',
  artist: 'Antonio Vivaldi',
  album: 'The Four Seasons',
  genre: 'Baroque',
  year: '1725',
  composer: 'Antonio Vivaldi',
  loadingPhrase: 'Spring has come, and the birds greet it with happy song.',
  tempo: [{ beat: 0, bpm: 104 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Spring Has Come' },
    { beat: bar(13) + 2, name: 'Birdsong' },
    { beat: bar(28), name: 'Ritornello' },
    { beat: bar(31), name: 'Murmuring Brooks' },
    { beat: bar(37), name: 'Ritornello' },
    { beat: bar(44), name: 'Thunder and Lightning' },
    { beat: bar(56), name: 'Ritornello' },
    { beat: bar(59), name: 'Final Ritornello' },
  ],
  player: [{ inst: 'fiddle', tone: 0.6, gain: 1.1, verb: 0.3, notes: excerpt(PRINCIPALE, 75) }],
  backing: [
    { inst: 'strings', tone: 0.55, gain: 0.55, pan: -0.35, verb: 0.35, notes: soft(excerpt(VIOLINO_1, 76), 0.7) },
    { inst: 'strings', tone: 0.5, gain: 0.5, pan: 0.35, verb: 0.35, notes: soft(excerpt(VIOLINO_2, 76), 0.65) },
    { inst: 'strings', tone: 0.45, gain: 0.5, pan: 0.15, verb: 0.35, notes: soft(excerpt(VIOLA, 76), 0.65) },
    { inst: 'strings', tone: 0.4, gain: 0.7, pan: -0.1, verb: 0.3, notes: soft(BASSO_LINE, 0.75) },
    { inst: 'strings', tone: 0.3, gain: 0.45, verb: 0.3, notes: soft(down(BASSO_LINE, -12), 0.7) },
    { inst: 'harpsichord', gain: 0.45, pan: 0.25, verb: 0.25, notes: soft([...BASSO_LINE, ...excerpt(VIOLA, 76)], 0.6) },
  ],
  drums: [],
  solos: [[bar(13) + 2, bar(28)]],
  lengthBeats: CUT + 28 + PICKUP + 2,
  previewBeat: bar(28),
  art: { from: '#123d1c', to: '#b7e07a', ink: '#fffbe6', motif: 'sun' },
};
