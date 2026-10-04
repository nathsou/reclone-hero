import type { NavAction } from '../../input/input.ts';
import type { App, Screen } from '../app.ts';
import { h } from '../dom.ts';
import { Menu } from '../menu.ts';
import type { MenuItem } from '../menu.ts';

/**
 * A question with a few answers, as a menu that works from the guitar (strum, green, red) and the
 * keyboard. Choosing an answer closes it first; red or Esc closes it without choosing.
 */
export class ChoiceModal implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly menu: Menu;

  constructor(app: App, title: string, lines: (string | null)[], items: MenuItem[]) {
    this.app = app;
    this.menu = new Menu(
      title,
      items.map((it) => ({
        label: it.label,
        action: () => {
          this.close();
          it.action();
        },
      })),
      { compact: true },
    );
    const text = lines.filter((l): l is string => !!l).map((l) => h('p', null, l));
    if (text.length) this.menu.el.querySelector('.menu-title')!.after(h('div', { class: 'choice-text' }, ...text));
    this.el = h('div', { class: 'song-options choice', role: 'dialog', 'aria-label': title, onclick: (e: Event) => e.target === this.el && this.close() }, this.menu.el);
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
