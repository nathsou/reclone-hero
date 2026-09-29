import { abc } from '../abc.ts';
import type { Note, SongDef } from '../score.ts';

// J. S. Bach, Fugue in G minor, BWV 578, the "Little" (c. 1707; public domain), played straight on
// a two-manual organ in Jeff Bigler's two-voice arrangement (via John Chambers' ABC collection):
// you take the upper voice, which states the subject first; the lower voice answers.
const UPPER = `
G4 d4 B6 A2 |
G2B2A2G2 (^F2A2) D4 |
G2D2A2D2 B2AG A2D2 |
G2DG A2DA B2AG ADdc |
BAGB AG^FA GDGA Bcd=e |
=f=edf ed^ce d2A2d2e2 |
(fg)fg (Tg3f/2g/2) agab agf=e |
faga ^caga daga caga |
fd^cd gdcd adcd gdcd |
A2f2G2=e2 F2A2d2f2 |
_e2a2 z2 e2 d2g2 z2 d2 "A"|
cBcd caga Bg^fg Af=ef |
g2D2G2A2 (Bc)Bc (Tc3B/2c/2) |
dcd_e dcBA Bdcd ^Fdcd |
Gdcd ^Fdcd BGFG cGFG |
dG^FG cGFG D2B2C2A2 |
B,2D2 GABG D4 A4 |
F6 =E2 D2F2E2D2 |
(^C2=E2) A,4 D2A,2E2A,2 |
F2=ED E2A,2 D2A,D E2A,E |
F2=ED E2A,2 D2G,2 A,4 |
D2A2d2c2 B2d2g2f2 |
_e2G2c2B2 A2c2f2e2 |
d4- dg^fg c4- cBAc "B"|
BAGB AG^FA GD=EF GDGA |
BGBc dAdc B6 A2 |
G2B2A2G2 (^F2A2) D4 |
G2D2A2D2 B2AG A2D2 |
G2DG A2DA B2AG ADdc |
BAGB AG^FA GBcd eBAG |
^FABc dAG=F EGAB cGFE |
DFGA BdcB Acde fgfe "C"|
dfed cBAc BFGA BcBc |
(d=e)de (Te3d/2e/2) f_efg fedc |
dfef Afef Bfef Afef |
dBAB eBAB fBAB eBAB |
BcdB edce dcde dcBd |
cBcd cBAc BABc BAGB |
A2f2 z2 _A2 G2e2 z2 G2 |
F2d2 z2 F2 EGcB =AGFE "D"|
DEFG ABcA BFGA BcBc |
(d=e)de (Te3d/2e/2) fefg fgf_e |
dfef Afef Bfef Afef |
dbab ebab fbab ebab |
fefg c3a babc' bagf |
edef edcB agab agfe |
dcde dcBA gfg_a gfed |
c=Bcd cdec fedc =B_agf |
e8- ecde fg_af "E"|
=BcdB G2 z2 c4 g4 |
e6 d2 c2e2d2c2 |
(=B2d2) G4 c2G2d2G2 |
e2dc d2G2 c2Gc d2Gd |
e2dc dGgf edce dc=Bd |
cg_eg ceG_B AcAc FACE |
Dfdf BdFA GBGB EGB,D |
Cece Ac=EG ^FAFA DFA,C "F"|
B,2G2A,2^F2 G2d2^F2d2 |
GBAG dADc BdcB =fc=Fe |
dfed gdGf =egfe aeAg |
^f_edc BdAd G_ag=f gf_ed |
e4 =a4- [a4d4] g4- |
[g4c2] ^f4 G,B,DG ^FG=EF |
G6 ^F2 G4 A2D2 |
Dg^f=e dcBA Bdcd ^Fdcd |
Gdcd ^Fdcd BGFG cGFG |
dG^FG cGFG B2g2A2^f2 |
[G,16D16=B16g16] |]
`;
const LOWER = `
z16 |
z16 |
z16 |
z16 |
z16 |
d4 a4 f6 =e2 |
d2f2=e2d2 (^c2e2) A4 |
d2A2=e2A2 f2ed e2A2 |
d2Ad =e2Ae f2ed eAag |
f=edf ed^ce dAde fga=b |
c'_bc'd' c'bac' babc' bagb |
a2g2^f2d2 G4 d4 |
B6 A2 G2B2A2G2 |
(^F2A2) D4 G2D2A2D2 |
B2AG A2D2 G2DG A2DA |
B2AG ADdc BAGB AG^FA |
GDGA Bcd=e =fedf ed^ce |
d2A2d2=e2 (fg)fg (Tg3f/2g/2) |
agab agf=e faga ^caga |
daga ^caga fdcd gdcd |
ad^cd gdcd f2=ed (T^c3d) |
d=cd=e dcBA GFG=A GF_ED |
cBcd cBAG FEFG FEDC |
BBcd e4- eABc d4 |
G4 d4 B6 A2 |
GBAG ^FG=EF GDEF GDGA |
(Bc)Bc (Tc3B/2c/2) dcd_e dcBA |
Bdcd ^Fdcd Gdcd Fdcd |
BG^FG cGFG dGFG cGFG |
G2B2 cBAc B4- BdcB |
A4- AcBA G4- GBAG |
F6 =E2 F2_e2d2c2 |
B4 f4 d6 c2 |
B2d2c2B2 (A2c2) F4 |
B2F2c2F2 d2cB c2F2 |
B2FB c2Fc d2cB cFfe |
dcBd cBAc B2g2 z2 G2 |
A2f2 z2 F2 G2f2c2=e2 |
f_efg fedf edef edce |
dcde dcBd cBcd cBAc |
B4 f4 d6 c2 |
B2d2c2B2 (A2c2) F4 |
B2F2c2F2 d2cB c2F2 |
B2FB c2Fc d2cB c2F2 |
d2e2f2F2 B2f2b2a2 |
g2G2c2B2 A2c2a2g2 |
f2F2B2A2 G2B2g2f2 |
e2E2_A2G2 F4 G4- |
GG=A=B cdec _A2c2_a2f2- |
f4-ffed edce dc=Bd |
cGcd efef gecg _afga |
dedc =Bgfg egfg =Bgfg |
cgfg =Bgfg ec'=bc' fc'bc' |
gc'=bc' gbab c2e2f2g2 |
c2g2e2c2 f2c'2a2f2 |
b2f2d2B2 b2b2g2e2 |
a2e2c2A2 a2a2^f2d2 |
GBAG dADc gbag d'adc' |
b4 ^f4 g4 a4 |
b4 =b4 c'4 ^c'4 |
d'4 =e2^f2 g4 =a2b2 |
c'g=f_e c'afa Bfed bgeg |
Aedc a^fdf G4 d4 |
B6 A2 G2B2A2G2 |
(^F2A2) D4 G2D2A2D2 |
B2AG A2D2 G2DG A2DA |
B2AG A2D2 G2e2c2d2 |
[G16d16=b16] |]
`;

const read = (voice: string): Note[] => abc(`M:4/4\nL:1/16\nK:Gm\n${voice}`).notes;
const bar = (n: number) => n * 4;
const UPPER_NOTES = read(UPPER);
const LOWER_NOTES = read(LOWER);
/** A pedal an octave below the lower voice's long notes and the closing chord. */
const PEDAL: Note[] = [
  ...LOWER_NOTES.filter((n) => n.d >= 1 && n.b >= bar(40)).map((n) => ({ ...n, p: [n.p[0] - 24], v: 0.6 })),
  { b: bar(67), d: 4, p: [31], v: 0.8 },
];

export const littleFugue: SongDef = {
  id: 'little-fugue',
  name: 'Little Fugue in G Minor',
  artist: 'Johann Sebastian Bach',
  album: 'Organ Works, BWV 578',
  genre: 'Baroque',
  year: '1707',
  composer: 'Johann Sebastian Bach',
  loadingPhrase: 'One tune, chasing itself through two hands.',
  tempo: [{ beat: 0, bpm: 84 }],
  timeSigs: [{ beat: 0, num: 4, den: 4 }],
  sections: [
    { beat: bar(0), name: 'Subject' },
    { beat: bar(5), name: 'Answer' },
    { beat: bar(11.5), name: 'Third Entry' },
    { beat: bar(16.5), name: 'Fourth Entry' },
    { beat: bar(24), name: 'Middle Entries' },
    { beat: bar(32), name: 'In B-flat Major' },
    { beat: bar(40), name: 'In the Major Again' },
    { beat: bar(49.5), name: 'Back Home' },
    { beat: bar(62.5), name: 'Last Entry' },
  ],
  player: [{ inst: 'organ', gain: 1.9, pan: 0.2, verb: 0.45, notes: UPPER_NOTES }],
  backing: [
    { inst: 'organ', gain: 1.5, pan: -0.2, verb: 0.45, notes: LOWER_NOTES.map((n) => ({ ...n, v: 0.72 })) },
    { inst: 'organ', gain: 1.1, verb: 0.5, notes: PEDAL },
  ],
  drums: [],
  solos: [],
  lengthBeats: bar(68) + 2,
  previewBeat: bar(5),
  art: { from: '#1b0f14', to: '#7a4a2a', ink: '#f1d9a6', motif: 'crest' },
};
