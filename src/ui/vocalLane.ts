import { pitchDistance } from '../audio/pitch.ts';
import type { Track } from '../chart/types.ts';
import { HIT, MISSED, PENDING } from '../engine/engine.ts';
import type { VocalJudge } from '../engine/vocals.ts';
import { h } from './dom.ts';

/** Seconds of notes shown ahead of the now-line, and behind it. */
const AHEAD = 4;
const BEHIND = 1;
/** Seconds of sung pitch kept for the trail. */
const TRAIL = 1.2;
const TRAIL_N = 160;

/**
 * The vocal lane, Rock Band style: notes as bars at their pitch, scrolling right to left towards the
 * now-line, each with its syllable under it; the sung pitch as a trail and a marker on the line (folded
 * to the octave of the notes, as any octave counts); notes fill in as they are sung in tune.
 */
export class VocalLane {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private w = 0;
  private hgt = 0;
  private dpr = 1;
  private readonly ro: ResizeObserver;
  private track: Track | null = null;
  private lo = 48;
  private hi = 72;
  /** sung pitch history: ring buffer of (song time, pitch) */
  private readonly trailT = new Float64Array(TRAIL_N);
  private readonly trailP = new Float32Array(TRAIL_N);
  private trailAt = 0;
  private colors = { text: '#f2efe9', dim: 'rgba(255,255,255,.35)', line: 'rgba(255,255,255,.12)', accent: '#fd6a3a', good: '#3cd070', bad: '#ff4d5e', sp: '#5ee7ff', panel: 'rgba(0,0,0,.45)' };

  constructor() {
    this.canvas = h('canvas', { class: 'vocal-canvas' });
    this.g = this.canvas.getContext('2d')!;
    this.el = h('div', { class: 'hud-vocals' }, this.canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
  }

  /** The part to show (null hides the lane). */
  setTrack(track: Track | null): void {
    this.track = track;
    this.el.classList.toggle('on', !!track);
    this.trailT.fill(-Infinity);
    if (!track) return;
    let lo = Infinity;
    let hi = -Infinity;
    const N = track.notes;
    for (let i = 0; i < N.length; i++) {
      if (N.type[i] !== 0) continue;
      lo = Math.min(lo, N.mask[i]);
      hi = Math.max(hi, N.mask[i]);
    }
    if (!Number.isFinite(lo)) [lo, hi] = [55, 67];
    // at least an octave, with a little room above and below
    const mid = (lo + hi) / 2;
    const half = Math.max(6, (hi - lo) / 2) + 1.5;
    this.lo = mid - half;
    this.hi = mid + half;
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    this.colors = { ...this.colors, text: v('--text', this.colors.text), accent: v('--accent', this.colors.accent), good: v('--good', this.colors.good), bad: v('--bad', this.colors.bad) };
  }

  /** Remember what was sung at song time t (NaN: nothing). */
  push(t: number, pitch: number): void {
    this.trailAt = (this.trailAt + 1) % TRAIL_N;
    this.trailT[this.trailAt] = t;
    this.trailP[this.trailAt] = pitch;
  }

  private resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.el.clientWidth;
    this.hgt = this.el.clientHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.hgt * this.dpr);
  }

  destroy(): void {
    this.ro.disconnect();
  }

  /** Draw the lane at song time t. */
  draw(t: number, judge: VocalJudge): void {
    const track = this.track;
    const { g, w, hgt: H } = this;
    if (!track || !w || !H) return;
    const c = this.colors;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const nowX = Math.round(w * 0.2);
    const pps = (w - nowX) / AHEAD;
    const top = 10;
    const bottom = H - 30; // room for the syllables
    const y = (p: number) => bottom - ((p - this.lo) / (this.hi - this.lo)) * (bottom - top);
    const barH = Math.max(6, Math.min(16, ((bottom - top) / (this.hi - this.lo)) * 0.9));

    // panel and the octave lines (C) for orientation
    g.fillStyle = c.panel;
    g.beginPath();
    g.roundRect(0, 0, w, H, 12);
    g.fill();
    g.fillStyle = c.line;
    for (let p = Math.ceil(this.lo / 12) * 12; p <= this.hi; p += 12) g.fillRect(0, Math.round(y(p)), w, 1);

    const N = track.notes;
    const syl = track.syllables ?? [];
    let i = lowerBound(N.endTime, N.length, t - BEHIND);
    let target = NaN;
    g.font = '600 14px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.textBaseline = 'top';
    for (; i < N.length && N.time[i] < t + AHEAD; i++) {
      const x0 = nowX + (N.time[i] - t) * pps;
      const x1 = nowX + (N.endTime[i] - t) * pps;
      const talkie = N.type[i] !== 0;
      const yy = talkie ? (top + bottom) / 2 : y(N.mask[i]);
      const st = judge.noteState[i];
      const sp = N.sp[i] >= 0 && !judge.spBroken[N.sp[i]];
      if (N.time[i] <= t && t < N.endTime[i] && !talkie) target = N.mask[i];
      else if (target !== target && N.time[i] > t && !talkie) target = N.mask[i];
      // the bar, then how much of it has been sung in tune
      g.globalAlpha = st === MISSED ? 0.35 : 1;
      if (talkie) {
        g.strokeStyle = sp ? c.sp : c.dim;
        g.lineWidth = 2;
        g.setLineDash([4, 4]);
        g.strokeRect(x0, yy - barH / 2, Math.max(4, x1 - x0), barH);
        g.setLineDash([]);
      } else {
        g.fillStyle = sp ? c.sp : c.dim;
        g.beginPath();
        g.roundRect(x0, yy - barH / 2, Math.max(4, x1 - x0), barH, barH / 2);
        g.fill();
      }
      const done = judge.progress(i);
      if (done > 0) {
        g.fillStyle = st === HIT || st === PENDING ? c.good : c.bad;
        g.beginPath();
        g.roundRect(x0, yy - barH / 2, Math.max(2, (x1 - x0) * done), barH, barH / 2);
        g.fill();
      }
      g.globalAlpha = st === MISSED ? 0.4 : 0.95;
      if (syl[i]) {
        g.fillStyle = N.time[i] <= t ? c.accent : c.text;
        g.fillText(syl[i], x0, bottom + 8);
      }
    }
    g.globalAlpha = 1;

    // the now-line
    g.fillStyle = c.text;
    g.globalAlpha = 0.6;
    g.fillRect(nowX - 1, top - 4, 2, bottom - top + 8);
    g.globalAlpha = 1;

    // the sung pitch: a trail behind the line and a marker on it, folded to the target's octave
    const fold = (p: number) => (target === target ? target + pitchDistance(p, target) : p);
    g.strokeStyle = c.accent;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    let pen = false;
    let lastP = NaN;
    for (let k = 1; k <= TRAIL_N; k++) {
      const idx = (this.trailAt + k) % TRAIL_N;
      const tt = this.trailT[idx];
      const p = this.trailP[idx];
      if (!(tt > t - TRAIL) || p !== p) {
        pen = false;
        continue;
      }
      const px = nowX + (tt - t) * pps;
      const py = y(fold(p));
      if (pen && Math.abs(fold(p) - lastP) < 3) g.lineTo(px, py);
      else g.moveTo(px, py);
      pen = true;
      lastP = fold(p);
    }
    g.stroke();
    const now = this.trailP[this.trailAt];
    if (now === now && this.trailT[this.trailAt] > t - 0.2) {
      const inTune = target === target && Math.abs(pitchDistance(now, target)) <= 1;
      g.fillStyle = inTune ? c.good : c.accent;
      g.beginPath();
      g.arc(nowX, y(fold(now)), 8, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function lowerBound(a: Float64Array, n: number, x: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (a[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}
