import { audio } from '../../audio/audio.ts';
import type { Action } from '../../input/bindings.ts';
import { ACTIONS, ACTION_LABEL, DEFAULT_KEYS, saveKeyBindings } from '../../input/bindings.ts';
import { input } from '../../input/input.ts';
import type { NavAction } from '../../input/input.ts';
import { settings, updateSettings } from '../../settings.ts';
import type { Settings } from '../../settings.ts';
import { shortPadName } from '../app.ts';
import type { App, Screen } from '../app.ts';
import { h, replace } from '../dom.ts';

type Tab = 'gameplay' | 'audio' | 'video' | 'controls';

export class SettingsModal implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly body: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private tab: Tab = 'gameplay';
  private padTimer = 0;
  private readonly inGame: boolean;

  constructor(app: App, inGame = false) {
    this.app = app;
    this.inGame = inGame;
    this.body = h('div', { class: 'settings-body' });
    this.tabs = h('div', { class: 'tabs' });
    this.el = h(
      'div',
      { class: 'modal-backdrop', onclick: (e: Event) => e.target === this.el && this.close() },
      h('div', { class: 'modal settings-modal' }, h('div', { class: 'modal-head' }, h('h2', null, 'Settings'), this.tabs, h('button', { class: 'btn ghost close', onclick: () => this.close() }, '✕')), this.body),
    );
    this.render();
  }

  destroy(): void {
    clearInterval(this.padTimer);
  }

  private close() {
    this.app.popModal(this);
  }

  private render() {
    const tabs: [Tab, string][] = [
      ['gameplay', 'Gameplay'],
      ['audio', 'Audio'],
      ['video', 'Display'],
      ['controls', 'Controls'],
    ];
    replace(this.tabs, ...tabs.map(([t, label]) => h('button', { class: `tab ${t === this.tab ? 'on' : ''}`, onclick: () => ((this.tab = t), this.render()) }, label)));
    clearInterval(this.padTimer);
    if (this.tab === 'gameplay') this.gameplay();
    else if (this.tab === 'audio') this.audioTab();
    else if (this.tab === 'video') this.video();
    else this.controls();
  }

  private gameplay() {
    replace(
      this.body,
      slider('Note speed', 'noteSpeed', 0.5, 2.5, 0.05, (v) => `${v.toFixed(2)}×`),
      slider('Hit window', 'hitWindowMs', 40, 150, 5, (v) => `±${v} ms`, 'How early or late a note still counts. Default ±90 ms.'),
      slider('Strum leniency', 'strumLeniencyMs', 0, 120, 5, (v) => `${v} ms`, 'How long a strum may come before its fret press.'),
      toggle('Lefty flip', 'lefty'),
      toggle('Timing bar', 'timingBar', 'Shows early/late ticks under the strike line.'),
      select(
        'When you miss',
        'missFeedback',
        [
          ['auto', 'Mute my part (or muffle)'],
          ['mute', 'Mute my part'],
          ['muffle', 'Muffle the mix'],
          ['off', 'Nothing'],
        ],
      ),
      toggle('Miss / overstrum sounds', 'missSounds'),
    );
  }

  private audioTab() {
    const apply = () => audio().applyVolumes();
    replace(
      this.body,
      slider('Master', 'volMaster', 0, 1, 0.05, pct, '', apply),
      slider('Your part', 'volInstrument', 0, 1, 0.05, pct, '', apply),
      slider('Band', 'volSong', 0, 1, 0.05, pct, '', apply),
      slider('Crowd', 'volCrowd', 0, 1, 0.05, pct, '', apply),
      slider('Sound effects', 'volSfx', 0, 1, 0.05, pct, '', apply),
      slider('Song preview', 'volPreview', 0, 1, 0.05, pct),
      slider('Audio offset', 'audioOffsetMs', -200, 300, 1, (v) => `${v} ms`, 'Raise this if you consistently hit late (Bluetooth headphones need 150+).'),
      this.inGame ? null : h('button', { class: 'btn', onclick: () => this.calibrate('audio') }, 'Calibrate audio offset…'),
    );
  }

  private video() {
    replace(
      this.body,
      select('Theme', 'theme', [
        ['system', 'Match system'],
        ['dark', 'Dark'],
        ['light', 'Light'],
      ]),
      select('Quality', 'quality', [
        ['high', 'High'],
        ['medium', 'Medium'],
        ['low', 'Low (no glow)'],
      ]),
      slider('Video offset', 'videoOffsetMs', -150, 150, 1, (v) => `${v} ms`, 'Raise this if notes look late compared to what you hear.'),
      this.inGame ? null : h('button', { class: 'btn', onclick: () => this.calibrate('video') }, 'Calibrate video offset…'),
      toggle('Show FPS', 'showFps'),
    );
  }

  private calibrate(kind: 'audio' | 'video') {
    void import('./calibrate.ts').then(({ CalibrationModal }) => this.app.pushModal(new CalibrationModal(this.app, kind, () => this.render())));
  }

  private controls() {
    const pads = h('div', { class: 'pads' });
    const refreshPads = () => {
      const list = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p);
      if (!list.length) {
        replace(pads, h('p', { class: 'hint' }, 'No controller detected yet. Plug in your guitar and press any fret: browsers only reveal controllers after a button press.'));
        return;
      }
      const sig = list.map((p) => p.id + (input().profiles[p.id] ? '1' : '0')).join('|');
      if (pads.dataset.sig === sig) return;
      pads.dataset.sig = sig;
      replace(
        pads,
        ...list.map((p) => {
          const configured = !!input().profiles[p.id];
          return h(
            'div',
            { class: 'pad' },
            h('div', null, h('b', null, shortPadName(p.id)), h('div', { class: 'hint' }, `${p.buttons.length} buttons, ${p.axes.length} axes · ${configured ? 'configured' : p.mapping === 'standard' ? 'standard mapping' : 'not configured'}`)),
            h(
              'button',
              { class: configured ? 'btn' : 'btn primary', onclick: () => void import('./wizard.ts').then(({ PadWizard }) => this.app.pushModal(new PadWizard(this.app, p.index, () => ((pads.dataset.sig = ''), refreshPads())))) },
              configured ? 'Reconfigure' : 'Set up',
            ),
          );
        }),
      );
    };
    refreshPads();
    this.padTimer = window.setInterval(refreshPads, 500);

    const keys = h('div', { class: 'keys' });
    const renderKeys = () => {
      const kb = input().keys;
      replace(
        keys,
        ...[...ACTIONS, 'whammy' as const].map((a) =>
          h(
            'div',
            { class: 'key-row' },
            h('span', null, a === 'whammy' ? 'Whammy (wobble)' : ACTION_LABEL[a as Action]),
            h(
              'button',
              {
                class: 'btn small',
                onclick: (e: Event) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  btn.textContent = 'press a key…';
                  const onKey = (ev: KeyboardEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    window.removeEventListener('keydown', onKey, true);
                    if (ev.code !== 'Escape' || a === 'start') {
                      kb[a] = [ev.code];
                      saveKeyBindings(kb);
                      input().reloadBindings();
                    }
                    renderKeys();
                  };
                  window.addEventListener('keydown', onKey, true);
                },
              },
              (kb[a] ?? []).map(prettyKey).join(' / ') || '—',
            ),
          ),
        ),
        h(
          'button',
          {
            class: 'btn ghost small',
            onclick: () => {
              saveKeyBindings(structuredClone(DEFAULT_KEYS));
              input().reloadBindings();
              renderKeys();
            },
          },
          'Reset keyboard to defaults',
        ),
      );
    };
    renderKeys();
    replace(this.body, h('h3', null, 'Controllers'), pads, h('h3', null, 'Keyboard'), keys);
  }

  nav(a: NavAction): void {
    if (a === 'back' || a === 'start') this.close();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.close();
      return true;
    }
    return false;
  }
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

function prettyKey(code: string): string {
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return arrows[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
}

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function slider(label: string, key: NumKey, min: number, max: number, step: number, fmt: (v: number) => string, hint = '', onChange?: () => void) {
  const val = h('span', { class: 'val' }, fmt(settings[key]));
  const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(settings[key]) });
  inp.addEventListener('input', () => {
    const v = Number(inp.value);
    updateSettings({ [key]: v } as Partial<Settings>);
    val.textContent = fmt(v);
    onChange?.();
  });
  return h('label', { class: 'row' }, h('span', { class: 'lbl' }, label, hint ? h('small', null, hint) : null), inp, val);
}

function toggle(label: string, key: BoolKey, hint = '') {
  const inp = h('input', { type: 'checkbox', checked: settings[key] });
  inp.addEventListener('change', () => updateSettings({ [key]: inp.checked } as Partial<Settings>));
  return h('label', { class: 'row' }, h('span', { class: 'lbl' }, label, hint ? h('small', null, hint) : null), inp);
}

function select<K extends keyof Settings>(label: string, key: K, options: [Settings[K], string][]) {
  const sel = h('select', null, ...options.map(([v, l]) => h('option', { value: String(v), selected: settings[key] === v }, l)));
  sel.addEventListener('change', () => updateSettings({ [key]: sel.value } as Partial<Settings>));
  return h('label', { class: 'row' }, h('span', { class: 'lbl' }, label), sel);
}
