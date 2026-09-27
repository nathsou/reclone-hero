import { h, setText } from './dom.ts';

const MULT_CLASS = ['', 'm1', 'm2', 'm3', 'm4'];
const MULT_TEXT = ['', '1×', '2×', '3×', '4×', '5×', '6×', '7×', '8×'];
const RING = ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1'];

/** Group digits without Intl (cheaper, and only called when the number changes). */
function groupDigits(n: number): string {
  let s = '';
  let v = Math.floor(n);
  if (v < 1000) return String(v);
  while (v >= 1000) {
    const r = v % 1000;
    s = (r < 10 ? ',00' : r < 100 ? ',0' : ',') + r + s;
    v = Math.floor(v / 1000);
  }
  return v + s;
}

/**
 * Restart a CSS animation without forcing layout: alternate between two classes that run
 * identical keyframes under different names.
 */
function restartAnim(el: HTMLElement, a: string, b: string) {
  if (el.classList.contains(a)) {
    el.classList.remove(a);
    el.classList.add(b);
  } else {
    el.classList.remove(b);
    el.classList.add(a);
  }
}

export interface HudState {
  score: number;
  multiplier: number;
  streak: number;
  spBar: number;
  spActive: boolean;
  stars: number;
  progress: number;
  fps: number;
  cpuMs: number;
  /** longest frame interval over the last half second */
  worstMs: number;
  showFps: boolean;
}

/** DOM overlay for score, multiplier, star power, streak, toasts and the timing bar. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly left: HTMLDivElement;
  private readonly right: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly mult: HTMLDivElement;
  private readonly multText: HTMLSpanElement;
  private readonly streak: HTMLDivElement;
  private readonly streakRing: HTMLDivElement;
  private readonly spFill: HTMLDivElement;
  private readonly spMeter: HTMLDivElement;
  private readonly stars: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly section: HTMLDivElement;
  private readonly solo: HTMLDivElement;
  private readonly soloPct: HTMLSpanElement;
  private readonly soloCount: HTMLSpanElement;
  private readonly progress: HTMLDivElement;
  private readonly timing: HTMLDivElement;
  private readonly timingTicks: HTMLDivElement[] = [];
  private readonly title: HTMLDivElement;
  private readonly fps: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  private tickIndex = 0;
  private readonly scoreText = document.createTextNode('0');
  private lastScore = 0;
  private lastStreak = -1;
  private lastRing = -1;
  private lastSp = -1;
  private lastSpReady = false;
  private lastSpActive = false;
  private lastProgress = -1;
  private fpsFrame = 0;
  private lastMult = 1;
  private lastStreakTen = -1;
  private lastStars = -1;
  private windowMs = 70;

  constructor() {
    this.score = h('div', { class: 'hud-score' });
    this.score.append(this.scoreText);
    this.multText = h('span', null, '1×');
    this.streakRing = h('div', { class: 'hud-ring' });
    this.mult = h('div', { class: 'hud-mult m1' }, this.streakRing, this.multText);
    this.streak = h('div', { class: 'hud-streak' }, '');
    this.left = h('div', { class: 'hud-left' }, this.score, this.mult, this.streak);
    this.spFill = h('div', { class: 'hud-sp-fill' });
    this.spMeter = h('div', { class: 'hud-sp' }, this.spFill, h('div', { class: 'hud-sp-ticks' }), h('div', { class: 'hud-sp-label' }, 'SP'));
    this.stars = h('div', { class: 'hud-stars' });
    this.right = h('div', { class: 'hud-right' }, this.spMeter, this.stars);
    this.toasts = h('div', { class: 'hud-toasts' });
    this.section = h('div', { class: 'hud-section' });
    this.soloPct = h('span', { class: 'pct' });
    this.soloCount = h('span', { class: 'cnt' });
    this.solo = h('div', { class: 'hud-solo' }, h('span', { class: 'lbl' }, 'SOLO'), this.soloPct, this.soloCount);
    this.progress = h('div', { class: 'hud-progress-fill' });
    this.timing = h('div', { class: 'hud-timing' }, h('div', { class: 'hud-timing-center' }), h('span', { class: 'early' }, 'early'), h('span', { class: 'late' }, 'late'));
    for (let i = 0; i < 24; i++) {
      const t = h('div', { class: 'hud-tick' });
      this.timingTicks.push(t);
      this.timing.append(t);
    }
    this.title = h('div', { class: 'hud-title' });
    this.fps = h('div', { class: 'hud-fps' });
    this.countdown = h('div', { class: 'hud-countdown' });
    this.root = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-progress' }, this.progress),
      this.left,
      this.right,
      this.toasts,
      this.section,
      this.solo,
      this.timing,
      this.title,
      this.fps,
      this.countdown,
    );
  }

  /**
   * Position panels next to the highway, given screen coords of the strike line edges, the strike
   * line centre and a point far down the highway. Call only when the camera changes.
   */
  layout(leftEdge: Float64Array, rightEdge: Float64Array, strikeCenter: Float64Array, farCenter: Float64Array): void {
    this.left.style.transform = `translate(${leftEdge[0]}px, ${leftEdge[1]}px) translate(-100%, -100%)`;
    this.right.style.transform = `translate(${rightEdge[0]}px, ${rightEdge[1]}px) translate(0, -100%)`;
    this.timing.style.transform = `translate(${strikeCenter[0]}px, ${strikeCenter[1]}px) translate(-50%, 0)`;
    this.toasts.style.transform = `translate(${farCenter[0]}px, ${farCenter[1]}px) translate(-50%, -50%)`;
    this.solo.style.transform = `translate(${farCenter[0]}px, ${farCenter[1] + 70}px) translate(-50%, 0)`;
  }

  setTitle(name: string, artist: string, charter: string): void {
    this.title.replaceChildren(h('div', { class: 't' }, name), h('div', { class: 'a' }, artist));
    if (charter) this.title.append(h('div', { class: 'c' }, `charted by ${charter}`));
    this.title.classList.remove('gone');
    setTimeout(() => this.title.classList.add('gone'), 4500);
  }

  setTimingWindow(ms: number): void {
    this.windowMs = ms;
  }

  showTimingBar(on: boolean): void {
    this.timing.style.display = on ? '' : 'none';
  }

  /**
   * Called every frame. Only touches the DOM when a displayed value actually changes, and never with
   * freshly formatted strings unless it has to: steady frames allocate nothing and cause no style work.
   */
  update(s: HudState): void {
    const score = Math.floor(s.score);
    // Sustains tick the score every frame; three updates per 100 ms is plenty for the eye.
    if (score !== this.lastScore && (++this.fpsFrame & 3) === 0) {
      this.lastScore = score;
      this.scoreText.data = groupDigits(score);
    }
    if (s.multiplier !== this.lastMult) {
      const up = s.multiplier > this.lastMult;
      this.lastMult = s.multiplier;
      setText(this.multText, MULT_TEXT[s.multiplier] ?? '');
      this.mult.className = s.multiplier > 4 ? 'hud-mult sp' : `hud-mult ${MULT_CLASS[s.multiplier]}`;
      if (up) restartAnim(this.mult, 'pop-a', 'pop-b');
    }
    const ring = s.multiplier >= 4 ? 10 : s.streak % 10;
    if (ring !== this.lastRing) {
      this.lastRing = ring;
      this.streakRing.style.setProperty('--p', RING[ring]);
    }
    if (s.streak !== this.lastStreak) {
      this.lastStreak = s.streak;
      setText(this.streak, s.streak >= 5 ? String(s.streak) : '');
      const fifty = Math.floor(s.streak / 50);
      if (fifty !== this.lastStreakTen) {
        if (fifty > this.lastStreakTen && fifty > 0) this.toast(`${fifty * 50} NOTE STREAK!`, 'streak');
        this.lastStreakTen = fifty;
      }
    }
    const sp = Math.round(s.spBar * 200);
    if (sp !== this.lastSp) {
      this.lastSp = sp;
      this.spFill.style.transform = `scaleY(${sp / 200})`;
    }
    const ready = s.spBar >= 0.5 && !s.spActive;
    if (ready !== this.lastSpReady) {
      this.lastSpReady = ready;
      this.spMeter.classList.toggle('ready', ready);
    }
    if (s.spActive !== this.lastSpActive) {
      this.lastSpActive = s.spActive;
      this.spMeter.classList.toggle('active', s.spActive);
    }
    const full = Math.floor(s.stars);
    if (full !== this.lastStars) {
      this.lastStars = full;
      this.stars.replaceChildren(...Array.from({ length: 5 }, (_, i) => h('span', { class: i < full ? (full >= 6 ? 'on gold' : 'on') : '' }, '★')));
      if (full > 0) restartAnim(this.stars, 'pop-a', 'pop-b');
    }
    const progress = Math.round(Math.min(1, Math.max(0, s.progress)) * 1000);
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      this.progress.style.transform = `scaleX(${progress / 1000})`;
    }
    if (s.showFps) {
      if ((this.fpsFrame & 63) === 0) setText(this.fps, `${s.fps.toFixed(0)} fps · ${s.cpuMs.toFixed(2)} ms cpu · worst frame ${s.worstMs.toFixed(1)} ms`);
    } else if (this.fps.firstChild) setText(this.fps, '');
  }

  toast(text: string, kind: 'streak' | 'bad' | 'sp' | 'solo' | 'info' = 'info', sub?: string): void {
    const el = h('div', { class: `toast ${kind}` }, h('div', null, text), sub ? h('small', null, sub) : null);
    this.toasts.append(el);
    setTimeout(() => el.remove(), 2200);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
  }

  /** Shatter animation on the streak counter when a streak is lost. */
  streakLost(streak: number): void {
    const ghost = h('div', { class: 'hud-streak-lost' }, String(streak));
    this.left.append(ghost);
    setTimeout(() => ghost.remove(), 900);
  }

  setSection(name: string): void {
    if (!name) return;
    this.section.replaceChildren(h('span', null, name));
    restartAnim(this.section, 'pop-a', 'pop-b');
  }

  setSolo(active: boolean, hits = 0, total = 0, seen = 0): void {
    this.solo.classList.toggle('on', active);
    if (!active) return;
    const pct = seen ? Math.round((hits / seen) * 100) : 100;
    setText(this.soloPct, `${pct}%`);
    setText(this.soloCount, `${hits}/${total}`);
    this.solo.classList.toggle('slipping', pct < 100);
  }

  /** Add a tick to the hit-timing bar. delta in seconds; negative is early. */
  timingTick(delta: number): void {
    const t = this.timingTicks[this.tickIndex++ % this.timingTicks.length];
    const x = Math.max(-1, Math.min(1, (delta * 1000) / this.windowMs));
    const abs = Math.abs(delta * 1000);
    t.style.left = `${50 + x * 50}%`;
    t.style.background = abs < 20 ? 'var(--good)' : abs < 45 ? 'var(--ok)' : 'var(--meh)';
    restartAnim(t, 'show-a', 'show-b');
  }

  missTick(): void {
    restartAnim(this.root, 'missflash-a', 'missflash-b');
  }

  private lastCountdown = 0;

  /** Seconds left before play resumes; 0 hides it. */
  setCountdown(n: number): void {
    if (n === this.lastCountdown) return;
    this.lastCountdown = n;
    setText(this.countdown, n > 0 ? String(n) : '');
    this.countdown.classList.toggle('on', n > 0);
  }
}
