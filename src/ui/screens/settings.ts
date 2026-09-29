import { audio } from '../../audio/audio.ts';
import type { Action } from '../../input/bindings.ts';
import { ACTIONS, ACTION_LABEL, DEFAULT_KEYS, describeAnalog, describeBinding, keyLabel, savePadProfile, saveKeyBindings } from '../../input/bindings.ts';
import { input } from '../../input/input.ts';
import type { NavAction } from '../../input/input.ts';
import { onSettingsChange, settings, updateSettings } from '../../settings.ts';
import type { Settings } from '../../settings.ts';
import { shortPadName } from '../app.ts';
import type { App, Screen } from '../app.ts';
import { h, replace } from '../dom.ts';
import { adjustFocused, canAdjust, controls } from '../focusNav.ts';
import { THEMES } from '../themes.ts';
import type { ThemeId } from '../themes.ts';
import { SKINS, SKIN_IDS } from '../../render/skins.ts';
import { skinPreviewSvg } from '../skinPreview.ts';
import { resolveSkin } from '../theme.ts';
import { applyBackup, downloadBackup, makeBackup, parseBackup, summarize } from '../../game/backup.ts';

type Tab = 'gameplay' | 'audio' | 'video' | 'controls' | 'data';

const TAB_LABEL: Record<Tab, string> = { gameplay: 'Gameplay', audio: 'Audio', video: 'Display', controls: 'Controls', data: 'Data' };
const TABS = Object.keys(TAB_LABEL) as Tab[];
const FRETS = ['#3cf06a', '#ff3b4a', '#ffd23a', '#3a8bff', '#ff8a1f'];

export class SettingsModal implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly body: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly navCol: HTMLElement;
  private readonly aside: HTMLElement;
  private tab: Tab = 'gameplay';
  private padTimer = 0;
  private stopPreview: (() => void) | null = null;
  private readonly inGame: boolean;

  constructor(app: App, inGame = false) {
    this.app = app;
    this.inGame = inGame;
    this.body = h('div', { class: 'settings-body' });
    this.tabs = h('div', { class: 'nav-tabs', role: 'tablist' });
    this.aside = h('aside', { class: 'settings-preview' });
    this.el = h(
      'div',
      { class: 'settings-page', role: 'dialog', 'aria-label': 'Settings' },
      (this.navCol = h(
        'nav',
        { class: 'settings-nav' },
        h('button', { class: 'settings-back', onclick: () => this.close() }, inGame ? '← Back' : '← Library', h('kbd', null, 'Esc')),
        h('h2', null, 'Settings'),
        this.tabs,
        h('div', { class: 'nav-foot' }, h('div', null, '↑↓ move · ←→ adjust'), h('div', null, '← or red: back to the tabs'), h('div', null, 'Changes save as you go.')),
      )),
      h('main', { class: 'settings-main' }, this.body),
      this.aside,
    );
    this.render();
    // Start on the tab list: up/down pick a tab, right or green goes into it.
    queueMicrotask(() => this.focusTab());
  }

  destroy(): void {
    clearInterval(this.padTimer);
    this.stopPreview?.();
  }

  private close() {
    this.app.popModal(this);
  }

  private render() {
    replace(
      this.tabs,
      ...TABS.map((t) =>
        h('button', { class: `nav-tab ${t === this.tab ? 'on' : ''}`, role: 'tab', 'aria-selected': String(t === this.tab), 'data-tab': t, onclick: () => this.openTab(t) }, TAB_LABEL[t]),
      ),
    );
    clearInterval(this.padTimer);
    this.stopPreview?.();
    this.stopPreview = null;
    const preview = this.tab === 'gameplay';
    this.el.dataset.preview = preview ? 'on' : 'off';
    this.aside.replaceChildren();
    this.body.scrollTop = 0;
    if (this.tab === 'gameplay') this.gameplay();
    else if (this.tab === 'audio') this.audioTab();
    else if (this.tab === 'video') this.video();
    else if (this.tab === 'data') this.data();
    else this.controls();
  }

  private gameplay() {
    const preview = timingPreview();
    this.aside.append(h('div', { class: 'label' }, 'Preview'), preview.caption, preview.canvas);
    this.stopPreview = preview.stop;
    replace(
      this.body,
      h('div', { class: 'sec-label' }, 'Timing'),
      slider('Note speed', 'noteSpeed', 0.5, 2.5, 0.05, (v) => `${v.toFixed(2)}×`, 'How fast notes travel toward you.', preview.redraw),
      slider('Hit window', 'hitWindowMs', 40, 150, 5, (v) => `±${v} ms`, 'How early or late a note still counts. Default ±90 ms.', preview.redraw),
      slider('Strum leniency', 'strumLeniencyMs', 0, 120, 5, (v) => `${v} ms`, 'How long a strum may come before its fret press.'),
      h('div', { class: 'sec-label' }, 'Feedback'),
      toggle('Timing bar', 'timingBar', 'Shows early/late ticks under the strike line.'),
      toggle('Auto Star Power', 'autoStarPower', 'Star Power goes off by itself as soon as it can, just before the next notes. Handy on touch screens.'),
      select('When you miss', 'missFeedback', [
        ['auto', 'Mute my part (or muffle)'],
        ['mute', 'Mute my part'],
        ['muffle', 'Muffle the mix'],
        ['off', 'Nothing'],
      ]),
      toggle('Miss / overstrum sounds', 'missSounds'),
      toggle('Lefty flip', 'lefty'),
    );
  }

  private audioTab() {
    const apply = () => audio().applyVolumes();
    replace(
      this.body,
      h('div', { class: 'sec-label' }, 'Volume'),
      slider('Master', 'volMaster', 0, 1, 0.05, pct, '', apply),
      slider('Your part', 'volInstrument', 0, 1, 0.05, pct, '', apply),
      slider('Band', 'volSong', 0, 1, 0.05, pct, '', apply),
      slider('Crowd', 'volCrowd', 0, 1, 0.05, pct, 'Mixed in when a song loads (saves memory), so changes apply to the next song.'),
      slider('Sound effects', 'volSfx', 0, 1, 0.05, pct, '', apply),
      slider('Song preview', 'volPreview', 0, 1, 0.05, pct),
      h('div', { class: 'sec-label' }, 'Latency'),
      slider('Audio offset', 'audioOffsetMs', -200, 300, 1, (v) => `${v} ms`, 'Raise this if you consistently hit late (Bluetooth headphones need 150+).'),
      this.inGame ? null : h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => this.calibrate('audio') }, 'Calibrate audio offset…')),
    );
  }

  private video() {
    const skinPanel = h('div', { class: 'skin-inline' });
    const showSkin = () => {
      const id = resolveSkin();
      const box = h('div', { class: 'skin-preview' });
      box.innerHTML = skinPreviewSvg(id);
      replace(skinPanel, box, h('div', null, h('div', { class: 'skin-name' }, SKINS[id].name), h('div', { class: 'skin-desc' }, SKINS[id].description)));
    };
    showSkin();
    const off = onSettingsChange(() => (this.el.isConnected ? showSkin() : off()));
    replace(
      this.body,
      h('div', { class: 'sec-label' }, 'Theme'),
      themePicker(),
      h('div', { class: 'sec-label' }, 'Note style'),
      skinPicker(),
      skinPanel,
      h('div', { class: 'sec-label' }, 'Graphics'),
      select('Quality', 'quality', [
        ['high', 'High'],
        ['medium', 'Medium'],
        ['low', 'Low (no glow)'],
      ]),
      slider('Video offset', 'videoOffsetMs', -150, 150, 1, (v) => `${v} ms`, 'Raise this if notes look late compared to what you hear.'),
      this.inGame ? null : h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => this.calibrate('video') }, 'Calibrate video offset…')),
      toggle('Show FPS', 'showFps'),
    );
  }

  private data() {
    const status = h('div', { class: 'data-status' });
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden-input' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const backup = parseBackup(await file.text());
        const sum = summarize(backup);
        const parts = [sum.settings && 'settings', sum.keys && 'keyboard keys', sum.controllers && `${sum.controllers} controller${sum.controllers > 1 ? 's' : ''}`, sum.scores && `${sum.scores} best score${sum.scores > 1 ? 's' : ''}`, sum.plays && `play history for ${sum.plays} song${sum.plays > 1 ? 's' : ''}`, sum.favourites && `${sum.favourites} favourite${sum.favourites > 1 ? 's' : ''}`].filter(Boolean);
        replace(
          status,
          h('p', null, `Backup from ${new Date(sum.exportedAt).toLocaleString()} with ${parts.join(', ') || 'nothing'}.`),
          h('p', { class: 'hint' }, 'Settings and keys will be replaced. Controllers and best scores are merged (the higher score wins).'),
          h(
            'div',
            { class: 'actions' },
            h(
              'button',
              {
                class: 'btn primary',
                onclick: () => {
                  applyBackup(backup);
                  location.reload();
                },
              },
              'Import and reload',
            ),
            h('button', { class: 'btn ghost', onclick: () => status.replaceChildren() }, 'Cancel'),
          ),
        );
      } catch (err) {
        replace(status, h('p', { class: 'error' }, (err as Error).message));
      }
    });
    const scores = Object.keys(makeBackup().data.scores ?? {}).length;
    replace(
      this.body,
      h('div', { class: 'sec-label' }, 'Library'),
      toggle('Built-in songs', 'builtinSongs', 'Original tracks and public-domain classics that come with the game, synthesized in your browser.', () => void this.app.refreshLibrary()),
      h('div', { class: 'sec-label' }, 'Move to another computer'),
      h(
        'p',
        { class: 'hint' },
        `Export saves your settings, keyboard keys, controller mappings, play history, favourites and ${scores} best score${scores === 1 ? '' : 's'} to a file. Import it on the other computer. Your songs are not included: point the game at your charts folder there.`,
      ),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => downloadBackup() }, 'Export…'), h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import…')),
      fileInput,
      status,
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
      const sig = list.map((p) => p.id + JSON.stringify(input().profiles[p.id] ?? null)).join('|');
      if (pads.dataset.sig === sig) return;
      pads.dataset.sig = sig;
      const wizard = (p: Gamepad, only?: Action | 'whammy') =>
        void import('./wizard.ts').then(({ PadWizard }) => this.app.pushModal(new PadWizard(this.app, p.index, () => ((pads.dataset.sig = ''), refreshPads()), only)));
      replace(
        pads,
        ...list.map((p) => {
          const profile = input().profiles[p.id];
          const configured = !!profile;
          const card = h(
            'div',
            { class: 'pad' },
            h(
              'div',
              { class: 'pad-head' },
              h('div', null, h('b', null, shortPadName(p.id)), h('div', { class: 'hint' }, `${p.buttons.length} buttons, ${p.axes.length} axes · ${configured ? 'configured' : p.mapping === 'standard' ? 'standard mapping' : 'not configured'}`)),
              h('button', { class: configured ? 'btn' : 'btn primary', onclick: () => wizard(p) }, configured ? 'Set up everything again' : 'Set up'),
            ),
          );
          if (profile) {
            // One row per input: change just that one without redoing the rest.
            const rows = h('div', { class: 'bind-list' });
            for (const a of [...ACTIONS, 'whammy' as const]) {
              const binds = a === 'whammy' ? null : (profile.digital[a] ?? []);
              const text = a === 'whammy' ? (profile.whammy ? describeAnalog(profile.whammy) : '—') : binds!.length ? binds!.map(describeBinding).join(' / ') : '—';
              const optional = a === 'whammy' || a === 'tilt' || a === 'starPower';
              rows.append(
                h(
                  'div',
                  { class: 'key-row' },
                  h('span', null, a === 'whammy' ? 'Whammy bar' : ACTION_LABEL[a]),
                  h('span', { class: 'bind-val' }, text),
                  h('button', { class: 'btn small', onclick: () => wizard(p, a) }, 'Change'),
                  optional && text !== '—'
                    ? h(
                        'button',
                        {
                          class: 'btn small ghost',
                          title: 'Unbind',
                          onclick: () => {
                            const next = structuredClone(profile);
                            if (a === 'whammy') next.whammy = null;
                            else delete next.digital[a];
                            savePadProfile(p.id, next);
                            input().reloadBindings();
                            pads.dataset.sig = '';
                            refreshPads();
                          },
                        },
                        '✕',
                      )
                    : h('span', { class: 'bind-spacer' }),
                ),
              );
            }
            card.append(rows);
          }
          return card;
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
              (kb[a] ?? []).map(keyLabel).join(' / ') || '—',
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
    replace(
      this.body,
      h('div', { class: 'sec-label' }, 'Controllers'),
      pads,
      h('div', { class: 'sec-label' }, 'Touch screen'),
      select('Touch frets', 'touchControls', [
        ['auto', 'On touch screens'],
        ['on', 'Always'],
        ['off', 'Never'],
      ]),
      h('div', { class: 'sec-label' }, 'Keyboard'),
      toggle('Fret keys strum', 'kbTapMode', 'Pressing a fret key plays the note, so no strum key is needed. Hold keys through sustains.'),
      keys,
    );
  }

  /** Controls the arrow keys and strum move between: every row's control and every button. */
  private stops(): HTMLElement[] {
    return controls(this.body);
  }

  private moveStop(dir: number) {
    const stops = this.stops();
    if (!stops.length) return;
    const active = document.activeElement as HTMLElement | null;
    const i = stops.findIndex((x) => x === active || x.contains(active));
    const next = i < 0 ? (dir > 0 ? 0 : stops.length - 1) : Math.max(0, Math.min(stops.length - 1, i + dir));
    stops[next].focus();
    stops[next].scrollIntoView({ block: 'nearest' });
  }

  /** Whether focus is in the left column (back button and tabs). */
  private inNav(): boolean {
    return this.navCol.contains(document.activeElement);
  }

  private focusTab() {
    this.tabs.querySelector<HTMLElement>(`[data-tab="${this.tab}"]`)?.focus();
  }

  /** Show a tab; the tab keeps focus when it was chosen from the tab list. */
  private openTab(t: Tab) {
    const fromNav = this.inNav();
    this.tab = t;
    this.render();
    if (fromNav) this.focusTab();
  }

  /** Up/down in the left column: the back button, then the tabs, which open as they are reached. */
  private moveInNav(dir: number) {
    const back = this.navCol.querySelector<HTMLElement>('.settings-back')!;
    if (document.activeElement === back) {
      if (dir > 0) this.focusTab();
      return;
    }
    const i = TABS.indexOf(this.tab) + dir;
    if (i < 0) back.focus();
    else if (i < TABS.length) this.openTab(TABS[i]);
  }

  private enterBody() {
    const first = this.stops()[0];
    if (first) {
      first.focus();
      first.scrollIntoView({ block: 'nearest' });
    }
  }

  private stepTab(dir: number) {
    this.openTab(TABS[(TABS.indexOf(this.tab) + dir + TABS.length) % TABS.length]);
  }

  nav(a: NavAction): void {
    if (this.inNav()) {
      const onBack = document.activeElement === this.navCol.querySelector('.settings-back');
      if (a === 'back' || a === 'start') this.close();
      else if (a === 'up' || a === 'down') this.moveInNav(a === 'up' ? -1 : 1);
      else if (a === 'right' || (a === 'confirm' && !onBack)) this.enterBody();
      else if (a === 'confirm') this.close();
      else if (a === 'alt') this.stepTab(1);
      return;
    }
    if (a === 'back') this.focusTab();
    else if (a === 'start') this.close();
    else if (a === 'up') this.moveStop(-1);
    else if (a === 'down') this.moveStop(1);
    else if (a === 'left') {
      // left past the end of a control goes back to the tabs
      if (canAdjust(-1)) adjustFocused(-1);
      else this.focusTab();
    } else if (a === 'right') adjustFocused(1);
    else if (a === 'alt') this.stepTab(1);
    else if (a === 'confirm') (document.activeElement as HTMLElement | null)?.click?.();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.close();
      return true;
    }
    if (this.inNav()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') this.moveInNav(e.key === 'ArrowUp' ? -1 : 1);
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && document.activeElement !== this.navCol.querySelector('.settings-back'))) this.enterBody();
      else if (e.key === 'PageDown' || e.key === 'PageUp') this.stepTab(e.key === 'PageUp' ? -1 : 1);
      else return false;
      return true;
    }
    if (e.target instanceof HTMLElement && (e.target.closest('select') || e.target.closest('.key-row button'))) return false;
    if (e.key === 'ArrowDown') this.moveStop(1);
    else if (e.key === 'ArrowUp') this.moveStop(-1);
    else if (e.key === 'ArrowLeft') {
      if (canAdjust(-1)) adjustFocused(-1);
      else this.focusTab();
    } else if (e.key === 'ArrowRight') return adjustFocused(1);
    else if (e.key === 'PageDown') this.stepTab(1);
    else if (e.key === 'PageUp') this.stepTab(-1);
    else return false;
    return true;
  }
}

const EXTRA_THEMES: ThemeId[] = ['swiss', 'baroque', 'synthwave', 'terminal', 'paper', 'midnight'];

/** A miniature highway in a theme's colours, for the picker. */
function themeThumb(kind: 'classic' | 'ink' | 'system'): string {
  const hwy = (bg: string, board: string, edge: string, ink: string, ring: string, cx = 150) =>
    `<rect width="300" height="132" fill="${bg}"/>` +
    `<polygon points="${cx - 55},0 ${cx + 55},0 ${cx + 105},132 ${cx - 105},132" fill="${board}" stroke="${edge}" stroke-width="${ink === 'none' ? 0 : 3}"/>` +
    `<circle cx="${cx}" cy="32" r="3.5" fill="#3cf06a" stroke="${ring}" stroke-width="1"/>` +
    `<circle cx="${cx - 22}" cy="62" r="7" fill="#ff3b4a" stroke="${ring}" stroke-width="1.6"/>` +
    `<circle cx="${cx + 18}" cy="94" r="10" fill="#3a8bff" stroke="${ring}" stroke-width="2"/>`;
  if (kind === 'classic') return `<svg viewBox="0 0 300 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${hwy('#040302', '#1c1512', '#3a3430', 'none', '#f2efe9')}</svg>`;
  if (kind === 'ink') return `<svg viewBox="0 0 300 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${hwy('#ece6db', '#faf7f1', '#1a1814', '', '#1a1814')}</svg>`;
  return `<svg viewBox="0 0 300 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="150" height="132" fill="#040302"/><rect x="150" width="150" height="132" fill="#ece6db"/><text x="150" y="70" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#8f8a82" stroke="#ece6db" stroke-width="0.1">follows your OS</text></svg>`;
}

/** Theme cards (Classic dark, Daylight ink, Match system) plus chips for the extra themes. */
function themePicker(): HTMLElement {
  const wrap = h('div');
  const render = () => {
    // Picking a theme rebuilds the picker: keep the guitar/keyboard focus on the same group.
    const had = wrap.contains(document.activeElement) ? document.activeElement?.closest('[aria-label]')?.getAttribute('aria-label') : null;
    queueMicrotask(() => had && wrap.querySelector<HTMLElement>(`[aria-label="${had}"]`)?.focus());
    const cards = [
      { id: 'classic' as const, name: THEMES.classic.name, description: 'Textured board, domed gems, wheel frets.', thumb: themeThumb('classic') },
      { id: 'ink' as const, name: THEMES.ink.name, description: 'Paper highway with inked outlines.', thumb: themeThumb('ink') },
      { id: 'system' as const, name: 'Match system', description: 'Classic dark or Daylight ink, following your OS.', thumb: themeThumb('system') },
    ];
    const grid = h(
      'div',
      { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Theme', 'data-stop': '', 'data-items': '.theme-card', tabindex: '0' },
      ...cards.map((c) => {
        const on = settings.theme === c.id;
        const preview = h('div', { class: 'theme-preview' });
        preview.innerHTML = c.thumb;
        return h(
          'button',
          {
            class: `theme-card ${on ? 'on' : ''}`,
            role: 'radio',
            tabindex: '-1',
            'aria-checked': String(on),
            onclick: () => {
              updateSettings({ theme: c.id });
              render();
            },
          },
          preview,
          h('span', { class: 'tc-row' }, h('span', { class: 'tc-name' }, c.name)),
          h('span', { class: 'tc-desc' }, c.description),
        );
      }),
    );
    replace(
      wrap,
      grid,
      h(
        'div',
        { class: 'row stack' },
        h('span', { class: 'lbl' }, 'More themes', h('small', null, 'Colour schemes from earlier versions.')),
        h(
          'div',
          { class: 'chips', role: 'radiogroup', 'aria-label': 'More themes', 'data-stop': '', 'data-items': '.chip', tabindex: '0' },
          ...EXTRA_THEMES.map((id) =>
            h(
              'button',
              {
                class: `chip ${settings.theme === id ? 'on' : ''}`,
                role: 'radio',
                tabindex: '-1',
                'aria-checked': String(settings.theme === id),
                onclick: () => {
                  updateSettings({ theme: id });
                  render();
                },
              },
              THEMES[id].name,
            ),
          ),
        ),
      ),
    );
  };
  render();
  return wrap;
}

/** Note style chips: the style also shows in the preview panel. */
function skinPicker(): HTMLElement {
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Note style', 'data-stop': '', 'data-items': '.chip', tabindex: '0' });
  const render = () => {
    const options = [{ id: 'theme' as const, name: 'Match theme' }, ...SKIN_IDS.map((id) => ({ id, name: SKINS[id].name }))];
    replace(
      chips,
      ...options.map((o) => {
        const on = settings.noteStyle === o.id;
        return h('button', { class: `chip ${on ? 'on' : ''}`, role: 'radio', tabindex: '-1', 'aria-checked': String(on), onclick: () => updateSettings({ noteStyle: o.id }) }, o.name);
      }),
    );
  };
  render();
  const off = onSettingsChange(() => {
    if (chips.isConnected) render();
    else off();
  });
  return chips;
}

/** A flattened highway: falling notes and the hit window as a dashed band, live with the sliders. */
function timingPreview() {
  const canvas = h('canvas', { class: 'preview-canvas' });
  const caption = h('div', { class: 'cap' });
  const NOTES: [number, number][] = [[0, 0.3], [2, 0.75], [1, 1.15], [3, 1.6], [4, 1.95], [2, 2.35], [0, 2.7], [1, 3.05]];
  const LOOP = 3.6;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let stopped = false;
  let colors = { accent: '#fd6a3a', text: '#f2efe9', line: 'rgba(255,255,255,.1)' };
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    colors = { accent: cs.getPropertyValue('--accent').trim() || colors.accent, text: cs.getPropertyValue('--text').trim() || colors.text, line: cs.getPropertyValue('--line-soft').trim() || colors.line };
  };
  const redraw = () => {
    caption.replaceChildren('Hit window ', h('b', null, `±${settings.hitWindowMs} ms`), ` at note speed ${settings.noteSpeed.toFixed(2)}×`);
  };
  const draw = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(draw);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    const laneW = w / 5;
    const strike = hgt * 0.8;
    const pps = hgt * 0.34 * settings.noteSpeed;
    g.strokeStyle = colors.line;
    g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(Math.round(i * laneW) + 0.5, 0);
      g.lineTo(Math.round(i * laneW) + 0.5, hgt);
      g.stroke();
    }
    const half = (settings.hitWindowMs / 1000) * pps;
    g.globalAlpha = 0.16;
    g.fillStyle = colors.accent;
    g.fillRect(0, strike - half, w, half * 2);
    g.globalAlpha = 0.9;
    g.strokeStyle = colors.accent;
    g.setLineDash([3, 3]);
    for (const y of [strike - half, strike + half]) {
      g.beginPath();
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(w, Math.round(y) + 0.5);
      g.stroke();
    }
    g.setLineDash([]);
    g.font = '500 10px ui-monospace, "JetBrains Mono", monospace';
    g.fillStyle = colors.accent;
    g.textAlign = 'right';
    g.fillText(`±${settings.hitWindowMs} ms`, w - 8, strike - half - 6);
    g.globalAlpha = 1;
    g.fillStyle = colors.text;
    g.fillRect(0, Math.round(strike) - 1, w, 2);
    const elapsed = reduced ? 1.1 : (now / 1000) % LOOP;
    for (const [lane, at] of NOTES) {
      const y = strike - (at - elapsed) * pps;
      if (y < -20 || y > hgt + 20) continue;
      g.fillStyle = FRETS[lane];
      g.beginPath();
      g.arc(lane * laneW + laneW / 2, y, 15, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.9)';
      g.lineWidth = 2;
      g.setLineDash([2, 2]);
      g.beginPath();
      g.arc(lane * laneW + laneW / 2, y, 8, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
  };
  readColors();
  redraw();
  raf = requestAnimationFrame(draw);
  return {
    canvas,
    caption,
    redraw,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function slider(label: string, key: NumKey, min: number, max: number, step: number, fmt: (v: number) => string, hint = '', onChange?: () => void) {
  const val = h('span', { class: 'val' }, fmt(settings[key]));
  const inp = h('input', { class: 'slider', type: 'range', min: String(min), max: String(max), step: String(step), value: String(settings[key]), 'data-stop': '' });
  const fill = () => inp.style.setProperty('--pct', `${((Number(inp.value) - min) / (max - min)) * 100}%`);
  fill();
  inp.addEventListener('input', () => {
    const v = Number(inp.value);
    updateSettings({ [key]: v } as Partial<Settings>);
    val.textContent = fmt(v);
    fill();
    onChange?.();
  });
  return h('label', { class: 'row slider-row' }, h('span', { class: 'lbl' }, label, hint ? h('small', null, hint) : null), inp, val);
}

function toggle(label: string, key: BoolKey, hint = '', onChange?: () => void) {
  const inp = h('input', { class: 'switch', type: 'checkbox', checked: settings[key], 'data-stop': '' });
  inp.addEventListener('change', () => {
    updateSettings({ [key]: inp.checked } as Partial<Settings>);
    onChange?.();
  });
  return h('label', { class: 'row toggle-row' }, h('span', { class: 'lbl' }, label, hint ? h('small', null, hint) : null), inp);
}

/** A row of chips (one per option) under the label. */
function select<K extends keyof Settings>(label: string, key: K, options: [Settings[K], string][]) {
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': label, 'data-stop': '', 'data-items': '.chip', tabindex: '0' });
  const render = () =>
    replace(
      chips,
      ...options.map(([v, l]) =>
        h(
          'button',
          {
            class: `chip ${settings[key] === v ? 'on' : ''}`,
            role: 'radio',
            tabindex: '-1',
            'aria-checked': String(settings[key] === v),
            onclick: () => {
              updateSettings({ [key]: v } as Partial<Settings>);
              render();
            },
          },
          l,
        ),
      ),
    );
  render();
  return h('div', { class: 'row stack' }, h('span', { class: 'lbl' }, label), chips);
}
