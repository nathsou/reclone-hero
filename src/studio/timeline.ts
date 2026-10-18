import { timingMap, snapTime } from './model.ts';
import type { StudioProject } from './model.ts';
import type { Difficulty } from '../chart/types.ts';

export interface TimelineState {
  project: StudioProject; difficulty: Difficulty; selected: Set<number>;
  start: number; span: number; cursor: number; snap: number; tool: 'select' | 'add' | 'erase';
}
export interface TimelineActions {
  select(ids: Set<number>): void;
  seek(time: number): void;
  add(time: number, lane: number): void;
  remove(id: number): void;
  move(ids: Set<number>, delta: number, lanes: number): void;
}

const COLORS = ['#37db6c', '#fa5964', '#ffd252', '#579dff', '#ffa351'];
const LABELS = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'];
const TOP = 86, ROW = 43, LEFT = 64, HEIGHT = TOP + ROW * 5 + 20;

/** Draws only the visible passage; long recordings never create a song-sized canvas or DOM. */
export class StudioTimeline {
  readonly canvas: HTMLCanvasElement;
  private state: () => TimelineState;
  private actions: TimelineActions;
  private observer: ResizeObserver;
  private drag: { x: number; y: number; time: number; lane: number; ids: Set<number>; delta: number; lanes: number } | null = null;
  constructor(canvas: HTMLCanvasElement, state: () => TimelineState, actions: TimelineActions) {
    this.canvas = canvas; this.state = state; this.actions = actions;
    canvas.style.height = `${HEIGHT}px`;
    this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(canvas);
    canvas.onpointerdown = (e) => this.down(e);
    canvas.onpointermove = (e) => this.move(e);
    canvas.onpointerup = () => this.up();
    canvas.onpointercancel = () => { this.drag = null; this.draw(); };
    canvas.oncontextmenu = (e) => e.preventDefault();
  }
  private point(e: PointerEvent): { x: number; y: number; time: number; lane: number } {
    const r = this.canvas.getBoundingClientRect(), s = this.state();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return { x, y, time: Math.max(0, Math.min(s.project.analysis.duration, s.start + (x - LEFT) / (r.width - LEFT) * s.span)), lane: Math.max(0, Math.min(4, Math.floor((y - TOP) / ROW))) };
  }
  private down(e: PointerEvent): void {
    const s = this.state(), p = this.point(e);
    if (p.x < LEFT) return;
    this.canvas.focus();
    if (p.y < TOP) { this.actions.seek(p.time); return; }
    const tolerance = s.span * 12 / Math.max(1, this.canvas.clientWidth - LEFT);
    const hit = s.project.notes[s.difficulty].filter((n) => n.lane === p.lane && Math.abs(n.time - p.time) < tolerance)
      .sort((a, b) => Math.abs(a.time - p.time) - Math.abs(b.time - p.time))[0];
    if (e.button === 2 || s.tool === 'erase') { if (hit) this.actions.remove(hit.id); return; }
    if (s.tool === 'add') { this.actions.add(snapTime(s.project, p.time, s.snap), p.lane); return; }
    if (!hit) { this.actions.select(new Set()); this.actions.seek(p.time); return; }
    const ids = e.shiftKey || s.selected.has(hit.id) ? new Set(s.selected) : new Set<number>();
    if (e.shiftKey && ids.has(hit.id)) ids.delete(hit.id); else ids.add(hit.id);
    this.actions.select(ids);
    if (!ids.has(hit.id)) return;
    this.drag = { ...p, time: hit.time, ids, delta: 0, lanes: 0 };
    this.canvas.setPointerCapture(e.pointerId);
  }
  private move(e: PointerEvent): void {
    if (!this.drag) return;
    const s = this.state(), p = this.point(e), d = this.drag;
    if (Math.hypot(p.x - d.x, p.y - d.y) < 4) return;
    const raw = (p.x - d.x) / (this.canvas.clientWidth - LEFT) * s.span;
    d.delta = snapTime(s.project, d.time + raw, s.snap) - d.time;
    d.lanes = p.lane - d.lane;
    this.draw();
  }
  private up(): void {
    const d = this.drag; this.drag = null;
    if (d && (d.delta || d.lanes)) this.actions.move(d.ids, d.delta, d.lanes);
    this.draw();
  }
  draw(): void {
    const s = this.state(), width = this.canvas.clientWidth;
    if (!width) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(HEIGHT * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(HEIGHT * dpr);
    }
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#11171d'; ctx.fillRect(0, 0, width, HEIGHT);
    const x = (time: number) => LEFT + (time - s.start) / s.span * (width - LEFT);
    const { map } = timingMap(s.project), end = s.start + s.span;
    ctx.font = '11px system-ui';
    for (let lane = 0; lane < 5; lane++) {
      ctx.fillStyle = COLORS[lane]; ctx.fillText(LABELS[lane], 7, TOP + lane * ROW + 26);
      ctx.fillStyle = lane % 2 ? '#ffffff07' : '#ffffff03'; ctx.fillRect(LEFT, TOP + lane * ROW, width - LEFT, ROW);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(LEFT, 0, width - LEFT, HEIGHT); ctx.clip();
    for (const lock of s.project.locks[s.difficulty]) {
      ctx.fillStyle = '#e7bd5330'; ctx.fillRect(x(lock.start), TOP, x(lock.end) - x(lock.start), ROW * 5);
      ctx.fillStyle = '#e7bd53'; ctx.fillText('Locked', Math.max(LEFT, x(lock.start)) + 4, TOP + 12);
    }
    const first = Math.floor(map.timeToBeat(s.start));
    for (let beat = first; map.tickToTime(beat * 480) <= end; beat++) {
      const time = map.tickToTime(beat * 480), px = x(time);
      ctx.strokeStyle = beat % 4 === 0 ? '#ffffff40' : '#ffffff15';
      ctx.beginPath(); ctx.moveTo(px, 65); ctx.lineTo(px, HEIGHT); ctx.stroke();
      if (s.span < 25 || beat % 4 === 0) { ctx.fillStyle = '#bac4ce'; ctx.fillText(time.toFixed(1), px + 3, 79); }
    }
    const wave = s.project.analysis.waveform;
    ctx.strokeStyle = '#68adbc'; ctx.beginPath();
    for (let px = LEFT; px < width; px++) {
      const a = Math.max(0, Math.floor((s.start + (px - LEFT) / (width - LEFT) * s.span) * 100));
      const b = Math.min(wave.length, Math.ceil((s.start + (px + 1 - LEFT) / (width - LEFT) * s.span) * 100));
      let peak = 0; for (let i = a; i < b; i++) peak = Math.max(peak, wave[i]);
      const h = Math.min(27, peak * 27); ctx.moveTo(px, 32 - h); ctx.lineTo(px, 32 + h);
    }
    ctx.stroke();
    for (const n of s.project.notes[s.difficulty]) {
      const selected = s.selected.has(n.id), moving = this.drag?.ids.has(n.id);
      const time = n.time + (moving ? this.drag!.delta : 0), lane = n.lane + (moving ? this.drag!.lanes : 0);
      if (time + n.length < s.start || time > end || lane < 0 || lane > 4) continue;
      const px = x(time), py = TOP + lane * ROW + ROW / 2;
      ctx.fillStyle = COLORS[lane];
      if (n.length > 0) { ctx.globalAlpha = 0.6; ctx.fillRect(px, py - 4, x(time + n.length) - px, 8); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(px, py, selected ? 9 : 7, 0, Math.PI * 2); ctx.fill();
      if (n.kind === 'tap') { ctx.fillStyle = '#11171d'; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
      if (selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
    }
    ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x(s.cursor), 0); ctx.lineTo(x(s.cursor), HEIGHT); ctx.stroke();
    ctx.restore();
  }
  destroy(): void { this.observer.disconnect(); }
}
