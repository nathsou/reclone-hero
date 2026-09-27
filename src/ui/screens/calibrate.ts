import { audio } from '../../audio/audio.ts';
import { input } from '../../input/input.ts';
import { settings, updateSettings } from '../../settings.ts';
import type { App, Screen } from '../app.ts';
import { h, replace, setText } from '../dom.ts';

const BPM = 100;
const COUNT_IN = 4;
const BEATS = 20;

/** Tap along to clicks (audio) or flashes (video) to measure latency. */
export class CalibrationModal implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly kind: 'audio' | 'video';
  private readonly onDone: () => void;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private raf = 0;
  private running = false;
  private diffs: number[] = [];
  private savedAudioOffset = settings.audioOffsetMs;
  private savedVideoOffset = settings.videoOffsetMs;

  constructor(app: App, kind: 'audio' | 'video', onDone: () => void) {
    this.app = app;
    this.kind = kind;
    this.onDone = onDone;
    this.canvas = h('canvas', { class: 'calib-canvas', width: 420, height: 180 });
    this.status = h('div', { class: 'calib-status' });
    this.actions = h('div', { class: 'actions' });
    this.el = h(
      'div',
      { class: 'modal-backdrop' },
      h(
        'div',
        { class: 'modal calib' },
        h('h2', null, kind === 'audio' ? 'Audio calibration' : 'Video calibration'),
        h(
          'p',
          { class: 'hint' },
          kind === 'audio'
            ? 'Close your eyes and strum (or press Space) exactly on each click. The first 4 clicks are a count-in.'
            : 'Watch the gem and strum (or press Space) the moment it crosses the line. There is no sound on purpose.',
        ),
        this.canvas,
        this.status,
        this.actions,
      ),
    );
    this.idle();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (document.hidden && this.running) this.stop(true);
  };

  private idle() {
    replace(this.actions, h('button', { class: 'btn primary', onclick: () => this.start() }, 'Start'), h('button', { class: 'btn ghost', onclick: () => this.close() }, 'Close'));
    this.draw(-10);
  }

  private start() {
    const a = audio();
    a.unload();
    this.diffs = [];
    // Measure raw latency: disable the offset being calibrated while measuring.
    if (this.kind === 'audio') updateSettings({ audioOffsetMs: 0 });
    else updateSettings({ videoOffsetMs: 0 });
    a.play(-1);
    const period = 60 / BPM;
    if (this.kind === 'audio') {
      for (let i = 0; i < BEATS; i++) a.scheduleSfx(i % 4 === 0 ? 'clickHi' : 'click', a.ctxTimeForSong(i * period), 1);
    }
    this.running = true;
    input().gameMode = true;
    input().setPollRate(4);
    input().clear();
    replace(this.actions, h('button', { class: 'btn ghost', onclick: () => this.stop(true) }, 'Cancel'));
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const a = audio();
    a.sync(now);
    const t = a.songTime(now);
    const period = 60 / BPM;
    input().poll();
    for (const ev of input().drain()) {
      if (!ev.down) continue;
      if (ev.action === 'start') {
        this.stop(true);
        return;
      }
      const et = a.songTime(ev.time);
      const beat = Math.round(et / period);
      if (beat >= COUNT_IN && beat < BEATS) this.diffs.push(et - beat * period);
    }
    const beatNo = Math.floor(t / period) + 1;
    setText(this.status, t < 0 ? 'Get ready…' : beatNo <= COUNT_IN ? `Count-in ${beatNo}` : `Tap along… (${this.diffs.length} taps)`);
    this.draw(t);
    if (t > BEATS * period + 0.3) this.finish();
  };

  private draw(t: number) {
    const c = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    const period = 60 / BPM;
    const strikeY = H - 36;
    c.strokeStyle = 'rgba(255,255,255,.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W / 2 - 80, strikeY);
    c.lineTo(W / 2 + 80, strikeY);
    c.stroke();
    const phase = t / period;
    const flash = Math.max(0, 1 - (phase - Math.round(phase)) * 6) * (Math.abs(phase - Math.round(phase)) < 0.17 ? 1 : 0);
    if (this.kind === 'video') {
      for (let i = Math.floor(phase) - 1; i <= Math.floor(phase) + 3; i++) {
        if (i < 0 || i >= BEATS) continue;
        const y = strikeY - (i * period - t) * 160;
        if (y < -20 || y > H + 20) continue;
        c.fillStyle = i % 4 === 0 ? '#ffd23a' : '#3cf06a';
        c.beginPath();
        c.ellipse(W / 2, y, 26, 12, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.fillStyle = `rgba(120,200,255,${0.15 + flash * 0.6})`;
    c.beginPath();
    c.arc(W / 2, strikeY, 10 + flash * 14, 0, Math.PI * 2);
    c.fill();
  }

  private finish() {
    this.stop(false);
    if (this.diffs.length < 8) {
      setText(this.status, 'Not enough taps. Try again.');
      this.idle();
      return;
    }
    const sorted = [...this.diffs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const spread = (sorted[Math.floor(sorted.length * 0.8)] - sorted[Math.floor(sorted.length * 0.2)]) * 500;
    const ms = Math.round(median * 1000);
    setText(this.status, `Measured ${ms} ms (consistency ±${Math.round(spread)} ms over ${sorted.length} taps).`);
    replace(
      this.actions,
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            if (this.kind === 'audio') updateSettings({ audioOffsetMs: ms });
            else updateSettings({ videoOffsetMs: ms });
            this.app.toast(`${this.kind === 'audio' ? 'Audio' : 'Video'} offset set to ${ms} ms.`);
            this.close(true);
          },
        },
        `Use ${ms} ms`,
      ),
      h('button', { class: 'btn', onclick: () => this.start() }, 'Retry'),
      h('button', { class: 'btn ghost', onclick: () => this.close() }, 'Cancel'),
    );
  }

  private stop(restore: boolean) {
    this.running = false;
    cancelAnimationFrame(this.raf);
    audio().unload();
    input().gameMode = false;
    input().setPollRate(16);
    if (restore) {
      this.restore();
      this.idle();
    }
  }

  private restore() {
    updateSettings({ audioOffsetMs: this.savedAudioOffset, videoOffsetMs: this.savedVideoOffset });
  }

  private close(applied = false) {
    if (this.running) this.stop(false);
    if (!applied) this.restore();
    else if (this.kind === 'audio') updateSettings({ videoOffsetMs: this.savedVideoOffset });
    else updateSettings({ audioOffsetMs: this.savedAudioOffset });
    this.onDone();
    this.app.popModal(this);
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.running) this.stop(false);
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.close();
      return true;
    }
    return false;
  }
}
