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
  pan(delta: number): void;
  zoom(factor: number): void;
}

const COLORS = ['#37db6c', '#fa5964', '#ffd252', '#579dff', '#ffa351'];
const LABELS = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'];
const TOP = 86, LEFT = 64;

/** Draws only the visible passage; long recordings never create a song-sized canvas or DOM. */
export class StudioTimeline {
  readonly canvas: HTMLCanvasElement;
  private state: () => TimelineState;
  private actions: TimelineActions;
  private observer: ResizeObserver;
  private waveScale: number;
  private drag: { x: number; y: number; time: number; lane: number; ids: Set<number>; delta: number; lanes: number } | null = null;
  constructor(canvas: HTMLCanvasElement, state: () => TimelineState, actions: TimelineActions) {
    this.canvas = canvas; this.state = state; this.actions = actions;
    const peak = state().project.analysis.waveform.reduce((max, value) => Math.max(max, value), 0);
    this.waveScale = 25 / Math.max(0.01, peak);
    this.observer = new ResizeObserver(() => this.draw()); this.observer.observe(canvas);
    canvas.onpointerdown = (e) => this.down(e);
    canvas.onpointermove = (e) => this.move(e);
    canvas.onpointerup = () => this.up();
    canvas.onpointercancel = () => { this.drag = null; this.draw(); };
    canvas.oncontextmenu = (e) => e.preventDefault();
    canvas.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.actions.zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault(); this.actions.pan((e.deltaX || e.deltaY) / Math.max(1, canvas.clientWidth) * this.state().span);
      }
    }, { passive: false });
  }
  private point(e: PointerEvent): { x: number; y: number; time: number; lane: number } {
    const r = this.canvas.getBoundingClientRect(), s = this.state();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const row = (this.canvas.clientHeight - TOP - 20) / 5;
    return { x, y, time: Math.max(0, Math.min(s.project.analysis.duration, s.start + (x - LEFT) / (r.width - LEFT) * s.span)), lane: Math.max(0, Math.min(4, Math.floor((y - TOP) / row))) };
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
    const moving = s.project.notes[s.difficulty].filter((n) => d.ids.has(n.id));
    if (!moving.length) { this.drag = null; this.draw(); return; }
    d.delta = Math.max(-Math.min(...moving.map((n) => n.time)), Math.min(d.delta, s.project.analysis.duration - 0.0001 - Math.max(...moving.map((n) => n.time))));
    d.lanes = Math.max(-Math.min(...moving.map((n) => n.lane)), Math.min(d.lanes, 4 - Math.max(...moving.map((n) => n.lane))));
    this.draw();
  }
  private up(): void {
    const d = this.drag; this.drag = null;
    if (d && (d.delta || d.lanes)) this.actions.move(d.ids, d.delta, d.lanes);
    this.draw();
  }
  draw(): void {
    const s = this.state(), width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || height <= TOP + 20) return;
    const row = (height - TOP - 20) / 5;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    }
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#10161d'; ctx.fillRect(0, 0, width, height);
    const x = (time: number) => LEFT + (time - s.start) / s.span * (width - LEFT);
    const { map } = timingMap(s.project), end = s.start + s.span;
    ctx.font = '11px system-ui';
    for (let lane = 0; lane < 5; lane++) {
      const cy = TOP + lane * row + row / 2;
      ctx.fillStyle = COLORS[lane]; ctx.beginPath(); ctx.arc(12, cy, 7, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#10161d'; ctx.textAlign = 'center'; ctx.fillText(String(lane + 1), 12, cy + 4);
      ctx.textAlign = 'left'; ctx.fillStyle = COLORS[lane]; ctx.fillText(LABELS[lane], 24, cy + 4);
      ctx.fillStyle = lane % 2 ? '#ffffff07' : '#ffffff03'; ctx.fillRect(LEFT, TOP + lane * row, width - LEFT, row);
      ctx.strokeStyle = '#ffffff08'; ctx.beginPath(); ctx.moveTo(LEFT, cy); ctx.lineTo(width, cy); ctx.stroke();
    }
    ctx.save(); ctx.beginPath(); ctx.rect(LEFT, 0, width - LEFT, height); ctx.clip();
    for (const lock of s.project.locks[s.difficulty]) {
      ctx.fillStyle = '#e7bd5330'; ctx.fillRect(x(lock.start), TOP, x(lock.end) - x(lock.start), row * 5);
      ctx.fillStyle = '#e7bd53'; ctx.fillText('Locked', Math.max(LEFT, x(lock.start)) + 4, TOP + 12);
    }
    const first = Math.floor(map.timeToBeat(s.start));
    let lastLabel = LEFT - 70;
    for (let beat = first; map.tickToTime(beat * 480) <= end; beat++) {
      const time = map.tickToTime(beat * 480), px = x(time);
      ctx.strokeStyle = beat % 4 === 0 ? '#ffffff40' : '#ffffff15';
      ctx.beginPath(); ctx.moveTo(px, 65); ctx.lineTo(px, height); ctx.stroke();
      if (px >= LEFT && px < width - 38 && px - lastLabel >= 60) {
        ctx.fillStyle = '#9aa8b7'; ctx.fillText(`${Math.floor(Math.max(0, time) / 60)}:${(Math.max(0, time) % 60).toFixed(1).padStart(4, '0')}`, px + 3, 79); lastLabel = px;
      }
    }
    const wave = s.project.analysis.waveform;
    ctx.strokeStyle = '#68adbc'; ctx.beginPath();
    for (let px = LEFT; px < width; px++) {
      const a = Math.max(0, Math.floor((s.start + (px - LEFT) / (width - LEFT) * s.span) * 100));
      const b = Math.min(wave.length, Math.ceil((s.start + (px + 1 - LEFT) / (width - LEFT) * s.span) * 100));
      let peak = 0; for (let i = a; i < b; i++) peak = Math.max(peak, wave[i]);
      const h = Math.min(27, peak * this.waveScale); ctx.moveTo(px, 32 - h); ctx.lineTo(px, 32 + h);
    }
    ctx.stroke();
    for (const n of s.project.notes[s.difficulty]) {
      const selected = s.selected.has(n.id), moving = this.drag?.ids.has(n.id);
      const time = n.time + (moving ? this.drag!.delta : 0), lane = n.lane + (moving ? this.drag!.lanes : 0);
      if (time + n.length < s.start || time > end || lane < 0 || lane > 4) continue;
      const px = x(time), py = TOP + lane * row + row / 2;
      ctx.fillStyle = COLORS[lane];
      if (n.length > 0) { ctx.globalAlpha = 0.6; ctx.fillRect(px, py - 4, x(time + n.length) - px, 8); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(px, py, selected ? 9 : 7, 0, Math.PI * 2); ctx.fill();
      if (n.kind === 'tap') { ctx.fillStyle = '#11171d'; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
      if (selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 10, 0, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1; }
    }
    ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x(s.cursor), 0); ctx.lineTo(x(s.cursor), height); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x(s.cursor) - 5, 0); ctx.lineTo(x(s.cursor) + 5, 0); ctx.lineTo(x(s.cursor), 7); ctx.fill();
    ctx.restore();
  }
  destroy(): void { this.observer.disconnect(); }
}
