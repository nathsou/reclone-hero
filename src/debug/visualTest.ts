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
// ?btn: a close look at the fret buttons and the strike line
if (params.has('btn')) r.camera = { height: 2.6, back: 3.4, lookZ: -0.4, fov: 0.7 };
// ?cam=height,back,lookZ,fov: any camera
const cam = params.get('cam')?.split(',').map(Number);
if (cam && cam.length === 4 && cam.every(Number.isFinite)) r.camera = { height: cam[0], back: cam[1], lookZ: cam[2], fov: cam[3] };
// ?art: a colourful stand-in for album art, to check how the highway lets it through
if (params.has('art')) {
  const art = document.createElement('canvas');
  art.width = art.height = 256;
  const g = art.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#ff5a3c');
  grad.addColorStop(0.5, '#3cb8ff');
  grad.addColorStop(1, '#ffe14a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff';
  g.fillRect(90, 60, 80, 140);
  r.setBackground(art);
}

type Spec = Parameters<typeof noteListOf>[0][number];
function mk(time: number, mask: number, type: NoteType, len = 0, sp = -1): Spec {
  return { time, mask, type, endTime: time + len, sp };
}

// ?stream: a gameplay-like passage at the default note speed, for judging how readable the highway is
const stream = params.has('stream');
const notes = stream ? streamNotes() : noteListOf([
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
const sustainHeld = new Uint8Array(n);
const sustainDrop = new Float32Array(n).fill(NaN);
if (!stream) {
  noteState[0] = 2;
  noteState[1] = 1;
  noteState[12] = 1;
  sustainHeld[1] = 1;
  sustainDrop[12] = 2.35;
}

/** Eighths and sixteenths at 150 BPM: singles, chords, a HOPO run, taps, an open note, sustains, star power. */
function streamNotes() {
  const e = 0.2;
  const out: Spec[] = [];
  let t = 0.25;
  const add = (mask: number, type: NoteType, step: number, len = 0, sp = -1) => {
    out.push(mk(t, mask, type, len, sp));
    t += step;
  };
  for (const m of [1, 2, 4, 2, 1, 2, 4, 8]) add(m, 0, e);
  for (const m of [0b11, 0b110, 0b11, 0b1100]) add(m, 0, e);
  for (const m of [1, 2, 4, 8, 16, 8, 4, 2]) add(m, m === 1 || m === 16 ? 0 : 1, e / 2);
  add(0, 0, e);
  for (const m of [4, 8, 16, 8]) add(m, 2, e / 2);
  add(0b101, 0, e * 2, e * 1.5);
  for (const m of [2, 4, 2, 1]) add(m, 0, e, 0, 0);
  add(0b10010, 0, e, 0, 0);
  add(0, 1, e);
  for (const m of [8, 4, 2, 1, 2, 4]) add(m, 0, e / 2);
  return noteListOf(out);
}
const beats = { length: 30, time: Float64Array.from({ length: 30 }, (_, i) => (i - 4) * 0.5), kind: Uint8Array.from({ length: 30 }, (_, i) => (i % 4 === 0 ? 0 : 1)) };

const state: RenderState = {
  time: Number(params.get('t') ?? (stream ? 0.12 : 0.3)),
  dt: 0.016,
  speed: 11 * Number(params.get('speed') ?? (stream ? 1.4 : 1)),
  length: Number(params.get('length') ?? 1),
  notes,
  noteState,
  spBroken: new Uint8Array(1),
  sustainHeld,
  sustainDrop,
  sustainMask: stream ? 0 : 1,
  beats,
  frets: stream ? 0 : 0b00001,
  laneHit: new Float32Array([stream ? 0 : 0.3, 0, 0, 0, 0]),
  laneWrong: new Float32Array([0, 0, 0, Number(params.get('wrong') ?? (stream ? 0 : 1)), 0]),
  spActive: params.has('sp'),
  multiplier: Number(params.get('mult') ?? 2),
  missPulse: Number(params.get('miss') ?? 0),
  whammy: 0.3,
  lefty: params.has('lefty'),
  solo: params.has('solo'),
  beatPulse: 0.2,
  theme: THEMES[(params.get('theme') ?? 'classic') as ThemeId]?.render ?? THEMES.classic.render,
  skin: SKINS[(params.get('skin') ?? THEMES[(params.get('theme') ?? 'classic') as ThemeId]?.skin ?? 'dome') as SkinId] ?? SKINS.dome,
};
document.getElementById('legend')!.textContent = stream ? '' :
  'near → far: missed blue · held green sustain · blue HOPO · green HOPO · yellow strum · orange tap · red strum\n' +
  'open strum · SP chord · SP HOPO · open HOPO · chord sustain · dropped yellow sustain   (blue button: wrong fret)\n' +
  'query: ?sp ?solo ?lefty ?miss=1 ?mult=4 ?q=low ?close ?btn ?art ?theme=ink ?skin=glass ?stream ?speed=1.4 ?length=1 ?t=0';
const loop = () => {
  r.render(state);
  requestAnimationFrame(loop);
};
loop();
