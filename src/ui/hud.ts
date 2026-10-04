import type { LyricLine } from '../chart/lyrics.ts';
import { TouchFrets } from './touchFrets.ts';
import { formatTime } from '../util/text.ts';
import { h, setText } from './dom.ts';
import { VocalLane } from './vocalLane.ts';

const MULT_CLASS = ['', 'm1', 'm2', 'm3', 'm4'];
const MULT_TEXT = ['', '×1', '×2', '×3', '×4', '×5', '×6', '×7', '×8'];
const SP_SEGMENTS = 4;
/** seconds a lyric line shows before it is sung, and the longest pause over which the next line is previewed */
const LYRIC_LEAD = 1.2;
const LYRIC_NEXT_GAP = 4;

/** One span per syllable; a space after each word. */
function lyricSpans(line: LyricLine): HTMLSpanElement[] {
  return line.syllables.map((s) => h('span', null, s.join ? s.text : s.text + ' '));
}

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
  /** hits / notes judged so far, 0..1 */
  accuracy: number;
  progress: number;
  /** seconds into the song (or practice range) and its length */
  elapsed: number;
  total: number;
  /** estimated seconds of Star Power left while it is active */
  spSeconds: number;
  fps: number;
  cpuMs: number;
  /** longest frame interval over the last half second */
  worstMs: number;
  showFps: boolean;
  /** rock meter 0..1, and whether it is shown */
  rock: number;
  rockOn: boolean;
}

/** DOM overlay for score, multiplier, star power, streak, toasts and the timing bar. */
export class Hud {
  readonly root: HTMLDivElement;
  /** on-screen frets for touch screens */
  readonly touch: TouchFrets;
  onTouchPause: (() => void) | null = null;
  /** vocals: the scrolling pitch lane (shown only for a vocal part) */
  readonly vocals = new VocalLane();
  /** the skip button of the break countdown was pressed */
  onSkip: (() => void) | null = null;
  private readonly left: HTMLDivElement;
  private readonly right: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly mult: HTMLDivElement;
  private readonly multText: HTMLSpanElement;
  private readonly streak: HTMLDivElement;
  private readonly meter: HTMLDivElement;
  private readonly rock: HTMLDivElement;
  private lastRock = -1;
  private lastRockOn = false;
  private readonly spFills: HTMLElement[] = [];
  private readonly spMeter: HTMLDivElement;
  private readonly spText: HTMLDivElement;
  private readonly acc: HTMLDivElement;
  private readonly stars: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly section: HTMLSpanElement;
  private readonly timeline: HTMLDivElement;
  private readonly marks: HTMLDivElement;
  private readonly elapsed: HTMLSpanElement;
  private readonly totalEl: HTMLSpanElement;
  private markTimes: number[] = [];
  private readonly track: HTMLDivElement;
  private readonly solo: HTMLDivElement;
  private readonly soloPct: HTMLSpanElement;
  private readonly soloCount: HTMLSpanElement;
  private readonly soloHit: HTMLElement;
  private readonly soloMiss: HTMLElement;
  private soloTimer = 0;
  /** screen positions of the five lanes at the strike line, for the full-combo cannons */
  private lanes: [number, number][] = [];
  private readonly timing: HTMLDivElement;
  private readonly timingTicks: HTMLDivElement[] = [];
  private readonly title: HTMLDivElement;
  private readonly partEl: HTMLSpanElement;
  private readonly fps: HTMLDivElement;
  private readonly countdown: HTMLDivElement;
  private readonly breakEl: HTMLDivElement;
  private readonly breakLabel: HTMLDivElement;
  private readonly breakTime: HTMLDivElement;
  private readonly breakFill: HTMLElement;
  private readonly breakSkip: HTMLButtonElement;
  private readonly breakKeys: HTMLSpanElement;
  private readonly keys: HTMLDivElement;
  private readonly keyCaps: HTMLSpanElement[] = [];
  private readonly lyricsEl: HTMLDivElement;
  private readonly lyricCur: HTMLDivElement;
  private readonly lyricNext: HTMLDivElement;
  private lyricLines: LyricLine[] = [];
  private lyricsOn = true;
  /** index of the line shown (-1: none), syllables of it already sung, last time seen */
  private lyricIdx = -1;
  private lyricSung = 0;
  private lyricT = -Infinity;
  private lastKeysDown = -1;
  private tickIndex = 0;
  private readonly scoreText = document.createTextNode('0');
  private lastScore = 0;
  private lastStreak = -1;
  private lastRing = -1;
  private lastSp = -1;
  private lastSecond = -1;
  private lastAcc = -1;
  private lastSpText = '';
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
    this.multText = h('span', null, '×1');
    this.mult = h('div', { class: 'hud-mult m1' }, this.multText);
    this.streak = h('div', { class: 'hud-streak' }, '');
    this.meter = h('div', { class: 'hud-meter' });
    this.rock = h('div', { class: 'hud-rock', title: 'Rock meter' }, h('span', { class: 'zone bad' }), h('span', { class: 'zone meh' }), h('span', { class: 'zone good' }), h('i', { class: 'needle' }));
    this.left = h('div', { class: 'hud-left', 'data-m': '1' }, this.score, h('div', { class: 'hud-row' }, this.streak, this.mult), this.meter, this.rock);
    this.spMeter = h('div', { class: 'hud-sp' });
    for (let i = 0; i < SP_SEGMENTS; i++) {
      const fill = h('i');
      this.spFills.push(fill);
      this.spMeter.append(h('div', { class: 'seg' }, fill));
    }
    this.spMeter.append(h('div', { class: 'hud-sp-label' }, 'SP'));
    this.acc = h('div', { class: 'hud-acc' });
    this.stars = h('div', { class: 'hud-stars' });
    this.spText = h('div', { class: 'hud-sp-text' });
    // Solo progress lives beside the highway, above the accuracy, never on the track itself.
    this.soloPct = h('span', { class: 'pct' });
    this.soloCount = h('span', { class: 'cnt' });
    this.soloHit = h('i', { class: 'hit' });
    this.soloMiss = h('i', { class: 'miss' });
    this.solo = h(
      'div',
      { class: 'hud-solo' },
      h('div', { class: 'head' }, h('span', { class: 'lbl' }, 'Solo'), this.soloPct),
      h('div', { class: 'bar' }, this.soloHit, this.soloMiss),
      this.soloCount,
    );
    this.right = h('div', { class: 'hud-right' }, this.spMeter, h('div', { class: 'hud-info' }, this.solo, this.acc, this.stars, this.spText));
    this.toasts = h('div', { class: 'hud-toasts' });
    this.section = h('span', { class: 'hud-section' });
    this.marks = h('div', { class: 'hud-marks' });
    this.elapsed = h('span', null, '0:00');
    this.totalEl = h('span', null, '0:00');
    this.timeline = h(
      'div',
      { class: 'hud-timeline' },
      h('div', { class: 'hud-line' }, h('div', { class: 'hud-line-fill' })),
      this.marks,
      h('div', { class: 'hud-dot' }),
      h('div', { class: 'hud-times' }, this.elapsed, this.section, this.totalEl),
    );
    this.track = h('div', { class: 'hud-track' }, h('div', { class: 'hud-timing-center' }));
    this.timing = h('div', { class: 'hud-timing' }, h('span', { class: 'early' }, 'early'), this.track, h('span', { class: 'late' }, 'late'));
    for (let i = 0; i < 24; i++) {
      const t = h('div', { class: 'hud-tick' });
      this.timingTicks.push(t);
      this.track.append(t);
    }
    this.partEl = h('span', { class: 'part' });
    this.title = h('div', { class: 'hud-top' }, h('span', { class: 't' }), h('span', { class: 'a' }), h('span', { class: 'grow' }), this.partEl);
    this.fps = h('div', { class: 'hud-fps' });
    this.countdown = h('div', { class: 'hud-countdown' });
    this.breakLabel = h('div', { class: 'lbl' });
    this.breakTime = h('div', { class: 'n' });
    this.breakFill = h('i');
    this.breakKeys = h('span', { class: 'keys' });
    this.breakSkip = h(
      'button',
      {
        class: 'skip',
        onpointerdown: (e: PointerEvent) => {
          e.preventDefault();
          this.onSkip?.();
        },
      },
      h('span', { class: 'what' }, 'Skip'),
      this.breakKeys,
    );
    this.breakEl = h('div', { class: 'hud-break' }, this.breakLabel, this.breakTime, h('div', { class: 'bar' }, this.breakFill), this.breakSkip);
    this.keys = h('div', { class: 'hud-keys' });
    for (let i = 0; i < 5; i++) {
      const cap = h('span', { class: `cap f${i}` });
      this.keyCaps.push(cap);
      this.keys.append(cap);
    }
    this.lyricCur = h('div', { class: 'cur' });
    this.lyricNext = h('div', { class: 'next' });
    this.lyricsEl = h('div', { class: 'hud-lyrics', 'aria-live': 'off' }, this.lyricCur, this.lyricNext);
    this.root = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-vignette' }),
      this.title,
      this.timeline,
      this.lyricsEl,
      this.left,
      this.right,
      this.toasts,
      this.timing,
      this.fps,
      this.countdown,
      this.vocals.el,
      this.breakEl,
      this.keys,
    );
    this.touch = new TouchFrets(() => this.onTouchPause?.());
    this.root.append(this.touch.el);
  }

  /**
   * Position panels next to the highway, given screen coords of the strike line edges, the strike
   * line centre and a point far down the highway. Call only when the camera changes.
   */
  layout(leftEdge: Float64Array, rightEdge: Float64Array, strikeCenter: Float64Array, farCenter: Float64Array): void {
    // On narrow (portrait) screens the highway fills the width: dock the panels in the top corners.
    const narrow = leftEdge[0] < 170 || this.root.clientWidth - rightEdge[0] < 170;
    this.root.classList.toggle('narrow', narrow);
    if (narrow) {
      // --dock-y: below the timeline (lower when lyrics take the top bar)
      this.left.style.transform = 'translate(12px, var(--dock-y))';
      this.right.style.transform = `translate(${this.root.clientWidth - 12}px, var(--dock-y)) translate(-100%, 0)`;
    } else {
      this.left.style.transform = `translate(${leftEdge[0]}px, ${leftEdge[1]}px) translate(-100%, -100%)`;
      this.right.style.transform = `translate(${rightEdge[0]}px, ${rightEdge[1]}px) translate(0, -100%)`;
    }
    this.timing.style.transform = `translate(${strikeCenter[0]}px, ${strikeCenter[1]}px) translate(-50%, 0)`;
    this.toasts.style.transform = `translate(${farCenter[0]}px, ${farCenter[1]}px) translate(-50%, -50%)`;
  }

  /** Screen positions of the five lanes just in front of the strike line, green first. */
  layoutKeys(lanes: Float64Array[]): void {
    for (let i = 0; i < 5; i++) this.keyCaps[i].style.transform = `translate(${lanes[i][0]}px, ${lanes[i][1]}px) translate(-50%, 0)`;
    this.lanes = lanes.map((l) => [l[0], l[1]]);
  }

  /** Keyboard labels under the frets; null hides them (e.g. when playing on a guitar). */
  setKeyLabels(labels: string[] | null): void {
    this.keys.classList.toggle('on', labels !== null);
    if (labels) for (let i = 0; i < 5; i++) setText(this.keyCaps[i], labels[i] ?? '');
  }

  /** Drums: the key caps take the pad colours (red, yellow, blue, green) and the kick's. */
  setDrums(on: boolean): void {
    this.keys.classList.toggle('drums', on);
  }

  setKeysDown(mask: number): void {
    if (mask === this.lastKeysDown) return;
    this.lastKeysDown = mask;
    for (let i = 0; i < 5; i++) this.keyCaps[i].classList.toggle('down', (mask & (1 << i)) !== 0);
  }

  setTitle(name: string, artist: string, part: string): void {
    this.title.children[0].textContent = name;
    this.title.children[1].textContent = artist;
    this.partEl.textContent = part;
  }

  /** Section tick marks on the timeline; times in seconds, range = the span the bar covers. */
  setSections(times: number[], start: number, end: number): void {
    this.markTimes = times.filter((t) => t > start + 0.5 && t < end - 0.5);
    const span = Math.max(0.001, end - start);
    this.marks.replaceChildren(...this.markTimes.map((t) => h('i', { style: `left:${(((t - start) / span) * 100).toFixed(3)}%` })));
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
      this.left.dataset.m = s.multiplier > 4 ? 'sp' : String(s.multiplier);
      if (up) restartAnim(this.mult, 'pop-a', 'pop-b');
    }
    const ring = s.multiplier >= 4 ? 10 : s.streak % 10;
    if (ring !== this.lastRing) {
      this.lastRing = ring;
      this.meter.style.setProperty('--n', String(ring));
    }
    if (s.streak !== this.lastStreak) {
      this.lastStreak = s.streak;
      setText(this.streak, s.streak >= 5 ? `${s.streak} streak` : '');
      const fifty = Math.floor(s.streak / 50);
      if (fifty !== this.lastStreakTen) {
        if (fifty > this.lastStreakTen && fifty > 0) this.toast(`${fifty * 50} note streak`, 'streak');
        this.lastStreakTen = fifty;
      }
    }
    const sp = Math.round(s.spBar * 200);
    if (sp !== this.lastSp) {
      this.lastSp = sp;
      for (let i = 0; i < SP_SEGMENTS; i++) {
        const f = Math.max(0, Math.min(1, (sp / 200) * SP_SEGMENTS - i));
        this.spFills[i].style.transform = `scaleY(${f})`;
      }
    }
    const spText = s.spActive ? `Star Power active · ${Math.max(0, Math.round(s.spSeconds))}s` : s.spBar >= 0.5 ? (this.touch.el.classList.contains('on') ? 'Star Power ready · ★ or flick up' : 'Star Power ready · tilt') : '';
    if (spText !== this.lastSpText) {
      this.lastSpText = spText;
      setText(this.spText, spText);
    }
    const acc = Math.round(s.accuracy * 1000);
    if (acc !== this.lastAcc) {
      this.lastAcc = acc;
      setText(this.acc, `${(acc / 10).toFixed(1)}%`);
    }
    const ready = s.spBar >= 0.5 && !s.spActive;
    if (ready !== this.lastSpReady) {
      this.lastSpReady = ready;
      this.spMeter.classList.toggle('ready', ready);
      this.touch.setStarPower(ready, s.spActive);
    }
    if (s.spActive !== this.lastSpActive) {
      this.lastSpActive = s.spActive;
      this.touch.setStarPower(ready, s.spActive);
      this.spMeter.classList.toggle('active', s.spActive);
    }
    const full = Math.floor(s.stars);
    if (full !== this.lastStars) {
      this.lastStars = full;
      this.stars.replaceChildren(...Array.from({ length: 5 }, (_, i) => h('span', { class: i < full ? (full >= 6 ? 'on gold' : 'on') : '' }, '★')));
      if (full > 0) restartAnim(this.stars, 'pop-a', 'pop-b');
    }
    const progress = Math.round(Math.min(1, Math.max(0, s.progress)) * 2000);
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      this.timeline.style.setProperty('--p', String(progress / 2000));
    }
    const second = Math.floor(Math.max(0, s.elapsed));
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      setText(this.elapsed, formatTime(second));
      setText(this.totalEl, formatTime(s.total));
    }
    if (s.rockOn !== this.lastRockOn) {
      this.lastRockOn = s.rockOn;
      this.rock.classList.toggle('on', s.rockOn);
    }
    const rock = Math.round(s.rock * 200);
    if (s.rockOn && rock !== this.lastRock) {
      this.lastRock = rock;
      this.rock.style.setProperty('--r', String(rock / 200));
      this.rock.classList.toggle('danger', rock < 50);
      this.root.classList.toggle('rock-danger', rock < 50);
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
    setText(this.section, name);
    restartAnim(this.section, 'pop-a', 'pop-b');
  }

  /** Solo progress: hits so far out of the notes played, and how far through the solo we are. */
  setSolo(active: boolean, hits = 0, total = 0, seen = 0): void {
    if (!active) {
      if (!this.soloTimer) this.solo.classList.remove('on');
      return;
    }
    clearTimeout(this.soloTimer);
    this.soloTimer = 0;
    this.solo.classList.add('on');
    this.solo.classList.remove('done', 'perfect');
    const pct = seen ? Math.round((hits / seen) * 100) : 100;
    setText(this.soloPct, `${pct}%`);
    setText(this.soloCount, `${hits} / ${total} notes`);
    const n = Math.max(1, total);
    this.soloHit.style.transform = `scaleX(${hits / n})`;
    this.soloMiss.style.left = `${(hits / n) * 100}%`;
    this.soloMiss.style.transform = `scaleX(${(seen - hits) / n})`;
    this.solo.classList.toggle('slipping', pct < 100);
  }

  /** The solo's result, shown in place of its progress for a moment. */
  soloResult(hits: number, total: number, bonus: number): void {
    const perfect = hits === total;
    setText(this.soloPct, perfect ? 'Perfect' : `${Math.round((hits / Math.max(1, total)) * 100)}%`);
    setText(this.soloCount, `+${bonus.toLocaleString('en-US')} bonus`);
    this.solo.classList.add('on', 'done');
    this.solo.classList.toggle('perfect', perfect);
    restartAnim(this.solo, 'pop-a', 'pop-b');
    clearTimeout(this.soloTimer);
    this.soloTimer = window.setTimeout(() => {
      this.soloTimer = 0;
      this.solo.classList.remove('on', 'done', 'perfect');
    }, 2500);
  }

  /** The rock meter ran out: the song is over. */
  songFailed(): void {
    this.root.append(h('div', { class: 'hud-failed' }, h('div', { class: 't' }, 'SONG FAILED'), h('div', { class: 's' }, 'The crowd has had enough.')));
  }

  /** The last note is in and nothing was missed: a title, confetti from the frets and fireworks. */
  fullCombo(): void {
    const word = (text: string, from: number) => h('span', { class: 'w' }, ...[...text].map((c, i) => h('span', { style: `--i:${from + i}` }, c)));
    const title = h('div', { class: 'hud-fc' }, h('div', { class: 't' }, word('FULL', 0), word('COMBO', 4)), h('div', { class: 's' }, 'Every note. Not one missed.'));
    this.root.append(title);
    setTimeout(() => title.remove(), 5200);
    const box = this.root.getBoundingClientRect();
    const cannons: [number, number][] = [[0, box.height], [box.width, box.height], ...this.lanes.filter((_, i) => i % 2 === 0)];
    const run = ++this.runId;
    void import('./confetti.ts').then(({ celebrate }) => {
      if (run === this.runId) this.stopConfetti = celebrate(this.root, { cannons, fireworks: 6, spread: 2.2 });
    });
  }

  private runId = 0;
  private stopConfetti: (() => void) | null = null;

  /** A new run (start, restart, practice loop): clear what the last one left on screen. */
  resetRun(): void {
    this.runId++;
    this.lyricT = -Infinity;
    this.lyricIdx = -1;
    this.lyricsEl.classList.remove('on');
    clearTimeout(this.soloTimer);
    this.soloTimer = 0;
    this.solo.classList.remove('on', 'done', 'perfect', 'slipping');
    this.root.querySelectorAll('.hud-fc, .hud-failed').forEach((el) => el.remove());
    this.root.classList.remove('rock-danger');
    this.lastRock = -1;
    this.stopConfetti?.();
    this.stopConfetti = null;
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

  /** The song's lyric lines (empty: none). */
  setLyrics(lines: LyricLine[]): void {
    this.lyricLines = lines;
    this.root.classList.toggle('has-lyrics', lines.length > 0 && this.lyricsOn);
    this.lyricIdx = -1;
    this.lyricSung = 0;
    this.lyricT = -Infinity;
    this.lyricCur.replaceChildren();
    this.lyricNext.replaceChildren();
    this.lyricsEl.classList.remove('on');
  }

  /** Lyrics setting: hides the lyrics without forgetting them. */
  showLyrics(on: boolean): void {
    if (on === this.lyricsOn) return;
    this.lyricsOn = on;
    this.lyricsEl.style.display = on ? '' : 'none';
    this.root.classList.toggle('has-lyrics', on && this.lyricLines.length > 0);
  }

  /**
   * Called every frame with the song time: shows the line being sung (from a moment before it starts)
   * with its sung syllables lit, and the next line under it. Touches the DOM only when a syllable is
   * reached or the line changes.
   */
  setLyricsTime(t: number): void {
    const lines = this.lyricLines;
    if (!lines.length || !this.lyricsOn) return;
    // seeking back (restart, practice loop): find the line again from the top
    let i = Math.max(0, this.lyricIdx);
    if (t < this.lyricT - 0.05) {
      i = 0;
      this.lyricIdx = -2; // rebuild the line: its sung syllables are not sung any more
    }
    this.lyricT = t;
    while (i < lines.length && lines[i].endTime <= t) i++;
    // a line appears shortly before it starts; long breaks leave the bar empty
    const show = i < lines.length && lines[i].startTime - t < LYRIC_LEAD ? i : -1;
    if (show !== this.lyricIdx) {
      this.lyricIdx = show;
      this.lyricSung = 0;
      if (show < 0) {
        this.lyricsEl.classList.remove('on');
      } else {
        this.lyricCur.replaceChildren(...lyricSpans(lines[show]));
        const next = lines[show + 1];
        this.lyricNext.replaceChildren(...(next && next.startTime - lines[show].endTime < LYRIC_NEXT_GAP ? lyricSpans(next) : []));
        this.lyricsEl.classList.add('on');
        restartAnim(this.lyricCur, 'in-a', 'in-b');
      }
    }
    if (show < 0) return;
    const syl = lines[show].syllables;
    let k = this.lyricSung;
    while (k < syl.length && syl[k].time <= t) k++;
    if (k !== this.lyricSung) {
      const spans = this.lyricCur.children;
      for (let j = this.lyricSung; j < k; j++) spans[j]?.classList.add('sung');
      this.lyricSung = k;
    }
  }

  private lastBreakKind = 0;
  private lastBreakSecond = -1;
  private lastBreakFill = -1;
  private lastSkipHint: string | null = '';

  /**
   * The countdown through an intro or a long break. kind: 0 hides it, 1 = intro, 2 = break.
   * skipHint: how to skip (e.g. the keys), '' for the button alone, null when skipping is not offered.
   * Called every frame; the DOM changes only when what is shown does.
   */
  setBreak(kind: number, secondsLeft: number, fill: number, skipHint: string | null): void {
    if (kind !== this.lastBreakKind) {
      this.lastBreakKind = kind;
      this.breakEl.classList.toggle('on', kind !== 0);
      if (kind) setText(this.breakLabel, kind === 1 ? 'First note in' : 'Next note in');
      setText(this.breakSkip.firstChild as HTMLElement, kind === 1 ? 'Skip intro' : 'Skip break');
    }
    if (!kind) return;
    const sec = Math.max(0, Math.ceil(secondsLeft));
    if (sec !== this.lastBreakSecond) {
      this.lastBreakSecond = sec;
      setText(this.breakTime, formatTime(sec));
    }
    const f = Math.round(Math.min(1, Math.max(0, fill)) * 400);
    if (f !== this.lastBreakFill) {
      this.lastBreakFill = f;
      this.breakFill.style.transform = `scaleX(${f / 400})`;
    }
    if (skipHint !== this.lastSkipHint) {
      this.lastSkipHint = skipHint;
      this.breakSkip.hidden = skipHint === null;
      setText(this.breakKeys, skipHint ?? '');
    }
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
