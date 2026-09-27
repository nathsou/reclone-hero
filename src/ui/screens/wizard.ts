import type { Action, AnalogBinding, DigitalBinding, PadProfile, PadSnapshot } from '../../input/bindings.ts';
import { ACTION_LABEL, FRET_ACTIONS, detectAnalog, detectDigital, savePadProfile, snapshot } from '../../input/bindings.ts';
import { input } from '../../input/input.ts';
import type { App, Screen } from '../app.ts';
import { shortPadName } from '../app.ts';
import { h, replace, setText } from '../dom.ts';

type Step = { action: Action | 'whammy'; optional: boolean; prompt: string };

const STEPS: Step[] = [
  ...FRET_ACTIONS.map((a) => ({ action: a, optional: false, prompt: `Press the ${ACTION_LABEL[a].toUpperCase()}` })),
  { action: 'strumUp', optional: false, prompt: 'Strum UP' },
  { action: 'strumDown', optional: false, prompt: 'Strum DOWN' },
  { action: 'starPower', optional: true, prompt: 'Press SELECT / Star Power button' },
  { action: 'tilt', optional: true, prompt: 'TILT the guitar neck up, then back down' },
  { action: 'start', optional: false, prompt: 'Press START' },
  { action: 'whammy', optional: true, prompt: 'Push the WHAMMY bar all the way, then let go' },
];

function sameBinding(a: DigitalBinding, b: DigitalBinding): boolean {
  if (a.type !== b.type || a.index !== b.index) return false;
  return a.type === 'button' || Math.abs((a as { value: number }).value - (b as { value: number }).value) < 0.1;
}

/** Walks the player through binding every guitar input by pressing it. */
export class PadWizard implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly padIndex: number;
  private readonly onDone: () => void;
  private readonly prompt: HTMLDivElement;
  private readonly progress: HTMLDivElement;
  private readonly raw: HTMLDivElement;
  private readonly note: HTMLDivElement;
  private step = 0;
  private phase: 'settle' | 'detect' | 'release' = 'settle';
  private phaseAt = performance.now();
  private base: PadSnapshot | null = null;
  private analog: AnalogBinding | null = null;
  private profile: PadProfile = { digital: {}, whammy: null };
  private raf = 0;

  constructor(app: App, padIndex: number, onDone: () => void) {
    this.app = app;
    this.padIndex = padIndex;
    this.onDone = onDone;
    const pad = navigator.getGamepads()[padIndex];
    this.prompt = h('div', { class: 'wiz-prompt' });
    this.progress = h('div', { class: 'wiz-steps' });
    this.raw = h('div', { class: 'wiz-raw' });
    this.note = h('div', { class: 'wiz-note' });
    this.el = h(
      'div',
      { class: 'modal-backdrop' },
      h(
        'div',
        { class: 'modal wizard' },
        h('h2', null, 'Set up controller'),
        h('div', { class: 'hint' }, pad ? shortPadName(pad.id) : 'Controller'),
        this.progress,
        this.prompt,
        this.note,
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => this.skip() }, 'Skip'), h('button', { class: 'btn ghost', onclick: () => this.cancel() }, 'Cancel')),
        this.raw,
      ),
    );
    this.renderStep();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  private renderStep() {
    const s = STEPS[this.step];
    setText(this.prompt, s ? s.prompt : 'All set!');
    setText(this.note, '');
    replace(this.progress, ...STEPS.map((st, i) => h('span', { class: i < this.step ? 'done' : i === this.step ? 'cur' : '' }, st.action === 'whammy' ? 'Whammy' : ACTION_LABEL[st.action].replace(' fret', ''))));
    this.phase = 'settle';
    this.phaseAt = performance.now();
    this.analog = null;
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const pad = navigator.getGamepads()[this.padIndex];
    if (!pad) {
      setText(this.note, 'Controller disconnected.');
      return;
    }
    const pressed = pad.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0);
    setText(this.raw, `buttons: ${pressed.join(', ') || '—'}   axes: ${pad.axes.map((a) => a.toFixed(2)).join('  ')}`);
    const s = STEPS[this.step];
    if (!s) return;
    const now = performance.now();

    if (this.phase === 'settle') {
      // Give the player time to let go of the previous input, then record the idle state.
      if (now - this.phaseAt > 300 && pressed.length === 0) {
        this.base = snapshot(pad);
        this.phase = 'detect';
      }
      return;
    }
    if (this.phase === 'detect') {
      if (s.action === 'whammy') {
        this.analog = detectAnalog(this.base!, pad, this.analog);
        if (this.analog) {
          const v = pad.axes[this.analog.index];
          if (Math.abs(v - this.analog.rest) < 0.15 && Math.abs(this.analog.full - this.analog.rest) > 0.4) {
            this.profile.whammy = this.analog;
            this.next();
          }
        }
        return;
      }
      const b = detectDigital(this.base!, pad);
      if (!b) return;
      const clash = (Object.entries(this.profile.digital) as [Action, DigitalBinding[]][]).find(([, list]) => list.some((x) => sameBinding(x, b)));
      if (clash) {
        setText(this.note, `That input is already ${ACTION_LABEL[clash[0]]}.`);
        return;
      }
      (this.profile.digital[s.action] ??= []).push(b);
      this.phase = 'release';
      this.phaseAt = now;
      return;
    }
    if (this.phase === 'release') {
      const b = this.profile.digital[s.action as Action]!.at(-1)!;
      const still = b.type === 'button' ? pad.buttons[b.index].pressed : Math.abs(pad.axes[b.index] - b.value) < 0.12;
      if (!still) this.next();
    }
  };

  private next() {
    this.step++;
    if (this.step >= STEPS.length) this.finish();
    else this.renderStep();
  }

  private skip() {
    const s = STEPS[this.step];
    if (!s) return;
    if (!s.optional) {
      setText(this.note, 'This one is needed to play. Press it, or Cancel.');
      return;
    }
    this.next();
  }

  private finish() {
    const pad = navigator.getGamepads()[this.padIndex];
    if (pad) {
      savePadProfile(pad.id, this.profile);
      input().reloadBindings();
    }
    this.app.toast('Controller saved.');
    this.onDone();
    this.app.popModal(this);
  }

  private cancel() {
    this.app.popModal(this);
  }

  // Ignore guitar navigation while binding: every press is an answer.
  nav(): void {}

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }
}
