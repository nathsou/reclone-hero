import { audio } from '../audio/audio.ts';
import { input } from '../input/input.ts';
import type { NavAction } from '../input/input.ts';
import { Library } from '../library/library.ts';
import { settings } from '../settings.ts';
import type { LibrarySource } from '../library/sources.ts';
import { h } from './dom.ts';
import { toggleFullscreen } from './fullscreen.ts';

export interface Screen {
  el: HTMLElement;
  /** Gamepad navigation. */
  nav?(a: NavAction): void;
  /** Keyboard; return true when handled. */
  key?(e: KeyboardEvent): boolean;
  /** Called after the element is attached. */
  shown?(): void;
  destroy?(): void;
}

export class App {
  readonly root: HTMLElement;
  readonly library = new Library();
  private screen: Screen | null = null;
  private modals: Screen[] = [];
  private toastBox: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.toastBox = h('div', { class: 'app-toasts' });
    document.body.append(this.toastBox);
    // Shift+F toggles fullscreen everywhere, mid-song included (F alone is the blue fret).
    // Capture phase so it runs before game input and never reaches it.
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'KeyF' || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
        const t = e.target;
        if (t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'range') return;
        if (t instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        void toggleFullscreen();
      },
      { capture: true },
    );
    window.addEventListener('keydown', (e) => {
      if (input().gameMode) return;
      const target = this.modals[this.modals.length - 1] ?? this.screen;
      if (target?.key?.(e)) e.preventDefault();
    });
    input().onNav = (a) => {
      const target = this.modals[this.modals.length - 1] ?? this.screen;
      target?.nav?.(a);
    };
    input().onPadConnected = (pad, configured) => {
      this.toast(configured ? `Controller connected: ${shortPadName(pad.id)}` : `New controller: ${shortPadName(pad.id)} — set it up in Settings › Controls`);
    };
    // Browsers only allow audio after a user gesture.
    const unlock = () => void audio().resume();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  async boot(): Promise<void> {
    const { LibraryScreen } = await import('./screens/library.ts');
    this.show(new LibraryScreen(this, null, true));
    const res = await Library.restore();
    if (res.state === 'ready') {
      await this.openLibrary(res.source);
      return;
    }
    if (res.state === 'needs-permission') {
      this.show(new LibraryScreen(this, res.handle));
      return;
    }
    // First visit: straight to the built-in songs. The folder button adds the player's own.
    await this.openLibrary(null);
    if (settings.builtinSongs) this.toast('Welcome! Play the built-in songs on the keyboard or a guitar, or add your own songs with the folder button.');
  }

  /** Re-list songs without rescanning (e.g. after showing or hiding the built-in songs). */
  async refreshLibrary(): Promise<void> {
    await this.library.index();
    if (this.screen && 'refresh' in this.screen) (this.screen as { refresh(): void }).refresh();
  }

  async openLibrary(source: LibrarySource | null, rescan = false): Promise<void> {
    const { LibraryScreen } = await import('./screens/library.ts');
    const loading = new LibraryScreen(this, null, true);
    this.show(loading);
    try {
      await this.library.open(source, { rescan, onProgress: (n) => loading.progress(n) });
    } catch (err) {
      this.toast(`Could not read library: ${(err as Error).message}`);
      this.show(new LibraryScreen(this, null));
      return;
    }
    const { SongSelect } = await import('./screens/songselect.ts');
    this.show(new SongSelect(this));
  }

  show(s: Screen): void {
    this.screen?.destroy?.();
    this.root.replaceChildren(s.el);
    this.screen = s;
    s.shown?.();
  }

  get current(): Screen | null {
    return this.screen;
  }

  pushModal(s: Screen): void {
    this.modals.push(s);
    document.body.append(s.el);
    s.shown?.();
  }

  popModal(s?: Screen): void {
    const m = s ?? this.modals[this.modals.length - 1];
    if (!m) return;
    this.modals = this.modals.filter((x) => x !== m);
    m.destroy?.();
    m.el.remove();
  }

  toast(msg: string): void {
    const el = h('div', { class: 'app-toast' }, msg);
    this.toastBox.append(el);
    setTimeout(() => el.classList.add('out'), 3500);
    setTimeout(() => el.remove(), 4000);
  }
}

export function shortPadName(id: string): string {
  return id.replace(/\s*\(.*?Vendor.*?\)\s*/i, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim() || id;
}
