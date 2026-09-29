import type { Action, KeyBindings, PadProfile } from './bindings.ts';
import { ACTIONS, FRET_ACTIONS, STANDARD_PROFILE, analogValue, digitalActive, loadKeyBindings, loadPadProfiles } from './bindings.ts';

export interface InputEvent {
  action: Action;
  down: boolean;
  /** performance.now() timestamp of the physical change */
  time: number;
  source: InputSource;
}

/** Keyboard, a guitar (or other gamepad), or on-screen touch frets. */
export type InputSource = 'kb' | 'pad' | 'touch';

export type NavAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'start' | 'alt' | 'menu';

const REPEAT_DELAY_MS = 300;

const PAD_NAV: Partial<Record<Action, NavAction>> = {
  strumUp: 'up',
  strumDown: 'down',
  green: 'confirm',
  red: 'back',
  start: 'start',
  yellow: 'alt',
  blue: 'left',
  orange: 'right',
  starPower: 'menu',
};

/**
 * Collects timestamped input from keyboard and gamepads. Gamepads are polled on a fast timer during
 * play so that quick strums are not lost between frames; each event keeps the device's own
 * timestamp so judgement does not depend on when we got around to reading it.
 */
export class InputManager {
  keys: KeyBindings = loadKeyBindings();
  profiles: Record<string, PadProfile> = loadPadProfiles();
  private _gameMode = false;
  onNav: ((a: NavAction) => void) | null = null;
  onPadConnected: ((pad: Gamepad, configured: boolean) => void) | null = null;

  // Double-buffered queue of pooled records: polling at 250 Hz creates no garbage.
  private queue: InputEvent[] = [];
  private back: InputEvent[] = [];
  private readonly pool: InputEvent[] = [];
  private kbDown = new Set<Action>();
  private padDown = new Map<number, Set<Action>>();
  private padWhammy = 0;
  private kbWhammyHeld = false;
  private touchMask = 0;
  private touchWhammy = 0;
  private timer = 0;
  /** Browsers expose no pads before a connect event, so skip polling (and its allocations) until then. */
  private padCount = 0;
  private repeatNav: NavAction | null = null;
  private repeatAt = 0;
  private repeatCount = 0;
  private keyToActions = new Map<string, Action[]>();

  constructor() {
    this.rebuildKeyMap();
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseKeyboard());
    window.addEventListener('gamepadconnected', (e) => {
      const pad = (e as GamepadEvent).gamepad;
      this.padCount++;
      this.onPadConnected?.(pad, this.profileFor(pad) !== null);
    });
    window.addEventListener('gamepaddisconnected', () => (this.padCount = Math.max(0, this.padCount - 1)));
    this.setPollRate(16);
  }

  get hasPads(): boolean {
    return this.padCount > 0;
  }

  /** When false, keyboard input is left to the DOM (menus, text fields). */
  get gameMode(): boolean {
    return this._gameMode;
  }

  set gameMode(on: boolean) {
    if (on === this._gameMode) return;
    this._gameMode = on;
    this.repeatNav = null;
    // Keys pressed in one mode must not appear held in the other.
    this.kbDown.clear();
    this.kbWhammyHeld = false;
    this.touchMask = 0;
    this.touchWhammy = 0;
    this.clear();
  }

  reloadBindings(): void {
    this.keys = loadKeyBindings();
    this.profiles = loadPadProfiles();
    this.rebuildKeyMap();
  }

  private rebuildKeyMap() {
    this.keyToActions.clear();
    for (const a of ACTIONS) {
      for (const code of this.keys[a] ?? []) {
        const list = this.keyToActions.get(code) ?? [];
        list.push(a);
        this.keyToActions.set(code, list);
      }
    }
  }

  setPollRate(ms: number): void {
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.poll(), ms);
  }

  profileFor(pad: Gamepad): PadProfile | null {
    return this.profiles[pad.id] ?? (pad.mapping === 'standard' ? STANDARD_PROFILE : null);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    // Menus handle keys first; anything they consumed must not also reach the game.
    if (!this._gameMode || (down && e.defaultPrevented)) return;
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    if (this.keys.whammy.includes(e.code)) this.kbWhammyHeld = down;
    const actions = this.keyToActions.get(e.code);
    if (!actions) return;
    e.preventDefault();
    for (const a of actions) {
      if (down === this.kbDown.has(a)) continue;
      if (down) this.kbDown.add(a);
      else this.kbDown.delete(a);
      this.push(a, down, e.timeStamp, 'kb');
    }
  }

  private releaseKeyboard() {
    const now = performance.now();
    for (const a of this.kbDown) this.push(a, false, now, 'kb');
    this.kbDown.clear();
    this.kbWhammyHeld = false;
  }

  /** Read all gamepads and queue any changes. Called from a timer and every frame. */
  poll(): void {
    if (this.padCount === 0) return;
    const pads = navigator.getGamepads?.() ?? [];
    const now = performance.now();
    let whammy = 0;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const profile = this.profileFor(pad);
      if (!profile) continue;
      let prev = this.padDown.get(pad.index);
      if (!prev) this.padDown.set(pad.index, (prev = new Set()));
      // Trust the device timestamp only when it is recent; some drivers never update it.
      const ts = pad.timestamp > 0 && pad.timestamp <= now && now - pad.timestamp < 40 ? pad.timestamp : now;
      for (const a of ACTIONS) {
        const binds = profile.digital[a];
        let down = false;
        if (binds) for (let b = 0; b < binds.length && !down; b++) down = digitalActive(binds[b], pad);
        if (down === prev.has(a)) continue;
        if (down) prev.add(a);
        else prev.delete(a);
        this.push(a, down, ts, 'pad');
        if (!this.gameMode) {
          const nav = PAD_NAV[a];
          if (nav && down) {
            this.onNav?.(nav);
            if (nav === 'up' || nav === 'down') {
              this.repeatNav = nav;
              this.repeatAt = now + REPEAT_DELAY_MS;
              this.repeatCount = 0;
            }
          } else if (nav && nav === this.repeatNav) this.repeatNav = null;
        }
      }
      if (profile.whammy) whammy = Math.max(whammy, analogValue(profile.whammy, pad));
    }
    this.padWhammy = whammy;
    // Holding the strum bar in menus keeps scrolling, faster the longer it is held.
    if (this.repeatNav && !this.gameMode && now >= this.repeatAt) {
      this.onNav?.(this.repeatNav);
      this.repeatCount++;
      this.repeatAt = now + (this.repeatCount < 5 ? 90 : this.repeatCount < 20 ? 55 : 32);
    }
    if (!this.gameMode) this.clear();
  }

  /** The on-screen frets now held (bit per fret, green first): queues a press or release for each change. */
  touchFrets(mask: number, time: number): void {
    if (!this._gameMode) return;
    const changed = mask ^ this.touchMask;
    this.touchMask = mask;
    for (let i = 0; i < FRET_ACTIONS.length; i++) if (changed & (1 << i)) this.push(FRET_ACTIONS[i], (mask & (1 << i)) !== 0, time, 'touch');
  }

  /** A tap on an on-screen button (Star Power, pause). */
  touchPress(action: Action, time: number): void {
    if (!this._gameMode) return;
    this.push(action, true, time, 'touch');
    this.push(action, false, time, 'touch');
  }

  /** 0..1 from moving a held finger up and down. */
  setTouchWhammy(v: number): void {
    this.touchWhammy = v;
  }

  private push(action: Action, down: boolean, time: number, source: InputSource) {
    const e = this.pool.pop() ?? { action, down, time, source };
    e.action = action;
    e.down = down;
    e.time = time;
    e.source = source;
    this.queue.push(e);
  }

  /**
   * Events since the last drain, oldest first. The array and its records are reused: process them
   * before calling drain() again.
   */
  drain(): InputEvent[] {
    const back = this.back;
    for (let i = 0; i < back.length; i++) this.pool.push(back[i]);
    back.length = 0;
    const q = this.queue;
    this.queue = back;
    this.back = q;
    if (q.length > 1) q.sort(byTime);
    return q;
  }

  clear(): void {
    for (let i = 0; i < this.queue.length; i++) this.pool.push(this.queue[i]);
    this.queue.length = 0;
  }

  isDown(a: Action): boolean {
    if (this.kbDown.has(a)) return true;
    const f = (FRET_ACTIONS as readonly Action[]).indexOf(a);
    if (f >= 0 && this.touchMask & (1 << f)) return true;
    for (const s of this.padDown.values()) if (s.has(a)) return true;
    return false;
  }

  fretMask(): number {
    let m = 0;
    for (let i = 0; i < FRET_ACTIONS.length; i++) if (this.isDown(FRET_ACTIONS[i])) m |= 1 << i;
    return m;
  }

  /** Frets currently held on gamepads only. */
  padFretMask(): number {
    let m = 0;
    for (let i = 0; i < FRET_ACTIONS.length; i++) for (const s of this.padDown.values()) if (s.has(FRET_ACTIONS[i])) m |= 1 << i;
    return m;
  }

  /** 0..1; keyboard "whammy" key wobbles the value while held. */
  whammy(now: number): number {
    if (this.kbWhammyHeld) return 0.5 + 0.5 * Math.sin(now / 45);
    return Math.max(this.padWhammy, this.touchWhammy);
  }
}

function byTime(a: InputEvent, b: InputEvent): number {
  return a.time - b.time;
}

let shared: InputManager | null = null;
export function input(): InputManager {
  shared ??= new InputManager();
  return shared;
}
