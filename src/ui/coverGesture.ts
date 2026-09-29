import { CoverMotion } from './coverMotion.ts';

/** Drag the covers directly, then coast and snap. Buttons/scrubber remain normal tap targets. */
export class CoverGesture {
  private readonly motion = new CoverMotion();
  private pointer: { id: number; x: number; y: number; start: number; step: number; dragged: boolean } | null = null;
  private raf = 0;
  private lastFrame = 0;
  private suppressClickUntil = 0;
  private readonly stage: HTMLElement;
  private readonly options: { count: () => number; selected: () => number; change: (position: number) => void };

  constructor(stage: HTMLElement, options: CoverGesture['options']) {
    this.stage = stage;
    this.options = options;
    stage.addEventListener('pointerdown', this.down);
    stage.addEventListener('pointermove', this.move);
    stage.addEventListener('pointerup', this.up);
    stage.addEventListener('pointercancel', this.cancel);
    stage.addEventListener('lostpointercapture', this.cancel);
    stage.addEventListener('click', this.click, { capture: true });
  }

  get position(): number | undefined { return this.motion.active ? this.motion.position : undefined; }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.motion.stop();
    const p = this.pointer;
    this.pointer = null;
    if (p && this.stage.hasPointerCapture(p.id)) this.stage.releasePointerCapture(p.id);
    this.stage.classList.remove('moving');
  }

  destroy(): void {
    this.stop();
    this.stage.removeEventListener('pointerdown', this.down);
    this.stage.removeEventListener('pointermove', this.move);
    this.stage.removeEventListener('pointerup', this.up);
    this.stage.removeEventListener('pointercancel', this.cancel);
    this.stage.removeEventListener('lostpointercapture', this.cancel);
    this.stage.removeEventListener('click', this.click, { capture: true });
  }

  private down = (e: PointerEvent) => {
    if (this.pointer || (e.pointerType === 'mouse' && e.button !== 0) || !this.options.count()) return;
    const coasting = this.motion.active;
    const start = this.position ?? this.options.selected();
    this.stop();
    if (coasting) this.suppressClickUntil = performance.now() + 350;
    this.motion.begin(start, this.options.count(), e.timeStamp);
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, start, step: Math.max(64, Math.min(180, this.stage.clientWidth * 0.3)), dragged: false };
  };

  private move = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    if (!p.dragged) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - p.y)) return;
      p.dragged = true;
      this.stage.classList.add('moving');
      try { this.stage.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    }
    e.preventDefault();
    this.motion.move(p.start - dx / p.step, e.timeStamp);
    this.options.change(this.motion.position);
  };

  private up = (e: PointerEvent) => {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId) return;
    this.pointer = null;
    if (this.stage.hasPointerCapture(p.id)) this.stage.releasePointerCapture(p.id);
    if (!p.dragged) {
      this.motion.stop();
      this.options.change(this.options.selected());
      return;
    }
    this.suppressClickUntil = performance.now() + 350;
    this.motion.release(e.timeStamp, matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.options.change(this.motion.position);
    if (!this.motion.active) { this.stage.classList.remove('moving'); return; }
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    const active = this.motion.tick((now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.options.change(this.motion.position);
    if (active) this.raf = requestAnimationFrame(this.frame);
    else { this.raf = 0; this.stage.classList.remove('moving'); }
  };

  private cancel = (e: PointerEvent) => {
    if (this.pointer?.id !== e.pointerId) return;
    this.stop();
    this.options.change(this.options.selected());
  };

  private click = (e: MouseEvent) => {
    if (performance.now() >= this.suppressClickUntil) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
}
