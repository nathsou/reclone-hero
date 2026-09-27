import { Library } from '../../library/library.ts';
import { FsSource } from '../../library/sources.ts';
import type { App, Screen } from '../app.ts';
import { h, setText } from '../dom.ts';
import { logo } from '../logo.ts';

/** First-run / reconnect screen for choosing where charts come from. */
export class LibraryScreen implements Screen {
  readonly el: HTMLElement;
  private status: HTMLDivElement;
  private buttons: HTMLDivElement;

  constructor(app: App, reconnect: FileSystemDirectoryHandle | null, scanning = false) {
    this.status = h('div', { class: 'lib-status' });
    this.buttons = h('div', { class: 'lib-buttons' });
    this.el = h(
      'div',
      { class: 'screen lib-screen' },
      logo('big'),
      h('p', { class: 'tagline' }, 'Five frets, one browser tab.'),
      this.buttons,
      this.status,
    );
    if (scanning) {
      setText(this.status, 'Scanning library…');
      return;
    }
    if (reconnect) {
      this.buttons.append(
        h(
          'button',
          {
            class: 'btn primary',
            onclick: async () => {
              const perm = await reconnect.requestPermission({ mode: 'read' });
              if (perm === 'granted') await app.openLibrary(new FsSource(reconnect));
            },
          },
          `Reconnect to “${reconnect.name}”`,
        ),
      );
    }
    if (Library.canPickFolder) {
      this.buttons.append(
        h(
          'button',
          {
            class: reconnect ? 'btn' : 'btn primary',
            onclick: async () => {
              const src = await Library.pickFolder();
              if (src) await app.openLibrary(src, true);
            },
          },
          'Open charts folder…',
        ),
      );
    } else {
      // Firefox/Safari: a directory <input>. Works everywhere, but must be re-picked each visit.
      this.buttons.append(
        h(
          'button',
          {
            class: 'btn primary',
            onclick: async () => {
              const src = await Library.pickFolderFallback();
              if (src) await app.openLibrary(src, true);
            },
          },
          'Choose charts folder…',
        ),
      );
      this.status.append(h('p', { class: 'hint' }, 'This browser cannot remember folders, so you will choose it again next time. Chrome and Edge remember it.'));
    }
    void Library.useDevServer().then((src) => {
      if (!src) return;
      this.buttons.append(h('button', { class: 'btn', onclick: () => app.openLibrary(src) }, 'Use dev server library'));
    });
    this.status.append(
      h(
        'p',
        { class: 'hint' },
        'Pick the folder that contains your Clone Hero songs (each song folder has notes.chart or notes.mid plus audio). Nothing is uploaded: files are read straight from disk.',
      ),
    );
  }

  progress(n: number): void {
    setText(this.status, `Scanning library… ${n} songs`);
  }
}
