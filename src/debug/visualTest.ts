// Dev-only page (visual-test.html): a frozen scene with every gem and sustain state, for tuning the look.
import type { NoteType } from '../chart/types.ts';
import { noteListOf } from '../chart/types.ts';
import { Renderer } from '../render/renderer.ts';
import type { RenderState } from '../render/renderer.ts';
import { THEMES } from '../ui/themes.ts';
import { SKINS } from '../render/skins.ts';
import type { SkinId } from '../render/skins.ts';
import type { ThemeId } from '../ui/themes.ts';

const canvas = document.querySelector('canvas')!;
const r = new Renderer(canvas);
const params = new URLSearchParams(location.search);
if (params.get('q')) r.setQuality(params.get('q') as 'high' | 'medium' | 'low');
if (params.has('close')) r.camera = { height: 2.0, back: 1.2, lookZ: -3.5, fov: 0.6 };

type Spec = Parameters<typeof noteListOf>[0][number];
function mk(time: number, mask: number, type: NoteType, len = 0, sp = -1): Spec {
  return { time, mask, type, endTime: time + len, sp };
}

const notes = noteListOf([
  mk(0.2, 8, 0), // missed blue strum (behind the strike line)
  mk(0.35, 1, 0, 1.2), // held green sustain
  mk(0.55, 8, 1), // blue HOPO
  mk(0.62, 1, 1), // green HOPO
  mk(0.7, 4, 0), // yellow strum
  mk(0.8, 16, 2), // orange tap
  mk(0.95, 2, 0), // red strum
  mk(1.1, 0, 0), // open strum
  mk(1.3, 0b10101, 0, 0, 0), // star power chord
  mk(1.5, 2, 1, 0, 0), // star power HOPO
  mk(1.7, 0, 1), // open HOPO
  mk(2.0, 0b110, 0, 0.8), // chord sustain
  mk(2.3, 4, 0, 0.6), // yellow sustain, dropped
]);
const n = notes.length;
const noteState = new Uint8Array(n);
noteState[0] = 2;
noteState[1] = 1;
noteState[12] = 1;
const sustainHeld = new Uint8Array(n);
sustainHeld[1] = 1;
const sustainDrop = new Float32Array(n).fill(NaN);
sustainDrop[12] = 2.35;
const beats = { length: 30, time: Float64Array.from({ length: 30 }, (_, i) => (i - 4) * 0.5), kind: Uint8Array.from({ length: 30 }, (_, i) => (i % 4 === 0 ? 0 : 1)) };

const state: RenderState = {
  time: 0.3,
  dt: 0.016,
  speed: 11,
  notes,
  noteState,
  spBroken: new Uint8Array(1),
  sustainHeld,
  sustainDrop,
  sustainMask: 1,
  beats,
  frets: 0b00001,
  laneHit: new Float32Array([0.3, 0, 0, 0, 0]),
  laneWrong: new Float32Array([0, 0, 0, Number(params.get('wrong') ?? 1), 0]),
  spActive: params.has('sp'),
  multiplier: Number(params.get('mult') ?? 2),
  missPulse: Number(params.get('miss') ?? 0),
  whammy: 0.3,
  lefty: params.has('lefty'),
  solo: params.has('solo'),
  beatPulse: 0.2,
  theme: THEMES[(params.get('theme') ?? 'neon') as ThemeId]?.render ?? THEMES.neon.render,
  skin: SKINS[(params.get('skin') ?? THEMES[(params.get('theme') ?? 'neon') as ThemeId]?.skin ?? 'neon') as SkinId] ?? SKINS.neon,
};
document.getElementById('legend')!.textContent =
  'near → far: missed blue · held green sustain · blue HOPO · green HOPO · yellow strum · orange tap · red strum\n' +
  'open strum · SP chord · SP HOPO · open HOPO · chord sustain · dropped yellow sustain   (blue button: wrong fret)\n' +
  'query: ?sp ?solo ?lefty ?miss=1 ?mult=4 ?q=low';
const loop = () => {
  r.render(state);
  requestAnimationFrame(loop);
};
loop();
