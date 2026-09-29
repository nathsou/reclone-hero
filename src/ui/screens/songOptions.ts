import type { NavAction } from '../../input/input.ts';
import type { App, Screen } from '../app.ts';
import { h } from '../dom.ts';
import { Menu } from '../menu.ts';
import type { MenuItem } from '../menu.ts';

/**
 * Everything the song list offers, as one menu that works from the guitar (select button) and the
 * keyboard (Space): play modes, favourite, instrument and difficulty, sorting and filters, view,
 * folder, settings. Items that cycle a setting take left/right (blue/orange) as well as confirm.
 */
export class SongOptions implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly title: string;
  private readonly items: () => MenuItem[];
  private menu: Menu;

  constructor(app: App, title: string, items: () => MenuItem[]) {
    this.app = app;
    this.title = title;
    this.items = items;
    this.menu = new Menu(title, this.wrap(items()), { compact: true });
    this.el = h('div', { class: 'song-options', onclick: (e: Event) => e.target === this.el && this.close() }, this.menu.el, this.hints());
  }

  /** Close after one-shot actions; settings that cycle stay open and redraw. */
  private wrap(list: MenuItem[]): MenuItem[] {
    return [
      ...list.map((it) => ({
        label: it.label,
        action: () => {
          if (it.adjust) {
            it.adjust(1);
            this.redraw();
          } else {
            this.close();
            it.action();
          }
        },
        adjust: it.adjust
          ? (d: number) => {
              it.adjust!(d);
              this.redraw();
            }
          : undefined,
      })),
      { label: 'Close', action: () => this.close() },
    ];
  }

  private hints(): HTMLElement {
    const hint = (k: string, label: string) => h('span', { class: 'hint' }, h('kbd', null, k), ` ${label}`);
    return h('div', { class: 'hints options-hints' }, hint('↑↓ / strum', 'move'), hint('Enter / green', 'choose'), hint('←→ / blue·orange', 'change'), hint('Esc / red', 'close'));
  }

  private redraw() {
    const next = new Menu(this.title, this.wrap(this.items()), { compact: true, selected: this.menu.selected });
    this.menu.el.replaceWith(next.el);
    this.menu = next;
  }

  private close() {
    this.app.popModal(this);
  }

  nav(a: NavAction): void {
    if (a === 'back' || a === 'menu' || a === 'start') this.close();
    else this.menu.nav(a);
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.close();
      return true;
    }
    return this.menu.key(e);
  }
}
