import { input } from '../input/input.ts';
import { settings } from '../settings.ts';
import { h } from './dom.ts';

const FRET_NAMES = ['green', 'red', 'yellow', 'blue', 'orange'];

/**
 * On-screen frets for phones and tablets. Pads across the bottom of the screen (five, or three for
 * the touch part: green, yellow, orange): touching one
 * plays the note (there is no strum to do), several fingers make a chord, sliding onto another pad
 * moves to that fret, and moving a held finger up and down is the whammy. A quick flick upwards,
 * or the ★ button, sets off Star Power.
 */
export class TouchFrets {
  readonly el: HTMLDivElement;
  private pads: HTMLElement[] = [];
  private readonly zone: HTMLDivElement;
  /** the fret each pad plays, left to right before any lefty flip */
  private frets = [0, 1, 2, 3, 4];
  private readonly spButton: HTMLButtonElement;
  /** active pointers: which fret each is on, where it started, and when */
  private readonly fingers = new Map<number, { fret: number; y0: number; t0: number; flicked: boolean; whammy: number }>();
  private mask = 0;

  constructor(onPause: () => void) {
    const zone = (this.zone = h('div', { class: 'tf-zone' }));
    zone.addEventListener('pointerdown', this.down);
    zone.addEventListener('pointermove', this.move);
    zone.addEventListener('pointerup', this.up);
    zone.addEventListener('pointercancel', this.up);
    zone.addEventListener('lostpointercapture', this.up);
    this.spButton = h(
      'button',
      {
        class: 'tf-sp',
        'aria-label': 'Star Power',
        onpointerdown: (e: PointerEvent) => {
          e.preventDefault();
          input().touchPress('starPower', e.timeStamp);
        },
      },
      '★',
    );
    const pause = h(
      'button',
      {
        class: 'tf-pause',
        'aria-label': 'Pause',
        onpointerdown: (e: PointerEvent) => {
          e.preventDefault();
          onPause();
        },
      },
      h('i'),
      h('i'),
    );
    this.el = h('div', { class: 'touch-frets' }, zone, this.spButton, pause);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari can still recognize a double-tap through compatibility touch events. Cancel their
    // default gesture explicitly while Pointer Events continue to judge every fret press.
    const preventGesture = (e: Event) => { if (e.cancelable) e.preventDefault(); };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange']) {
      this.el.addEventListener(type, preventGesture, { passive: false });
    }
  }

  /** Whether the frets should show: always, never, or on screens whose main pointer is a finger. */
  static wanted(): boolean {
    if (settings.touchControls === 'on') return true;
    if (settings.touchControls === 'off') return false;
    return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
  }

  /** Show or hide the pads; `frets` are the frets they play (all five, or 0, 2, 4 for the touch part). */
  setVisible(on: boolean, frets: readonly number[] = [0, 1, 2, 3, 4]): void {
    this.el.classList.toggle('on', on);
    this.releaseAll();
    this.frets = [...frets];
    this.pads = this.frets.map(() => h('div', { class: 'tf-pad' }, h('i')));
    // lefty mirrors the highway, so the pads mirror too
    this.pads.forEach((p, i) => p.classList.add(FRET_NAMES[this.padFret(i)]));
    this.zone.style.setProperty('--tf-cols', String(this.pads.length));
    this.zone.replaceChildren(...this.pads);
  }

  private padFret(i: number): number {
    return this.frets[settings.lefty ? this.frets.length - 1 - i : i];
  }

  setStarPower(ready: boolean, active: boolean): void {
    this.spButton.classList.toggle('ready', ready);
    this.spButton.classList.toggle('active', active);
  }

  private fretAt(e: PointerEvent): number {
    const r = this.zone.getBoundingClientRect();
    const n = this.pads.length;
    return this.padFret(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))));
  }

  private down = (e: PointerEvent) => {
    e.preventDefault();
    try {
      // keep receiving this finger's moves when it slides off the pads
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // not a live pointer (synthetic events)
    }
    this.fingers.set(e.pointerId, { fret: this.fretAt(e), y0: e.clientY, t0: e.timeStamp, flicked: false, whammy: 0 });
    this.update(e.timeStamp);
  };

  private move = (e: PointerEvent) => {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    const fret = this.fretAt(e);
    const dy = e.clientY - f.y0;
    // a fast flick upwards is the tilt
    if (!f.flicked && dy < -60 && e.timeStamp - f.t0 < 300) {
      f.flicked = true;
      input().touchPress('starPower', e.timeStamp);
    }
    // up and down on a held note is the whammy
    f.whammy = Math.min(1, Math.abs(dy) / 50);
    let whammy = 0;
    for (const g of this.fingers.values()) whammy = Math.max(whammy, g.whammy);
    input().setTouchWhammy(whammy);
    if (fret !== f.fret) {
      // sliding onto another pad: that fret now, with a fresh whammy origin
      f.fret = fret;
      f.y0 = e.clientY;
      this.update(e.timeStamp);
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.fingers.delete(e.pointerId)) return;
    if (!this.fingers.size) input().setTouchWhammy(0);
    this.update(e.timeStamp);
  };

  private releaseAll() {
    this.fingers.clear();
    input().setTouchWhammy(0);
    this.update(performance.now());
  }

  private update(time: number) {
    let mask = 0;
    for (const f of this.fingers.values()) mask |= 1 << f.fret;
    if (mask === this.mask) return;
    this.mask = mask;
    input().touchFrets(mask, time);
    this.pads.forEach((p, i) => p.classList.toggle('down', (mask & (1 << this.padFret(i))) !== 0));
  }
}
