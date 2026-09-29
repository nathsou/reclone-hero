import type { NavAction } from '../input/input.ts';
import { audio } from '../audio/audio.ts';
import { h } from './dom.ts';

export interface MenuItem {
  label: string;
  action: () => void;
  /** left/right (blue/orange, arrow keys) cycle a setting shown in the label */
  adjust?: (dir: number) => void;
}

/** Big-type numbered menu, navigable by mouse, keyboard and guitar. */
export class Menu {
  readonly el: HTMLDivElement;
  private readonly items: MenuItem[];
  private readonly buttons: HTMLButtonElement[];
  private sel = 0;

  constructor(caption: string, items: MenuItem[], opts: { compact?: boolean; selected?: number } = {}) {
    this.items = items;
    this.buttons = items.map((it, i) =>
      h(
        'button',
        {
          class: 'menu-item',
          onclick: () => it.action(),
          onmouseenter: () => this.select(i),
        },
        h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'l' }, it.label),
      ),
    );
    this.el = h('div', { class: opts.compact ? 'menu compact' : 'menu' }, h('div', { class: 'menu-title' }, caption), ...this.buttons);
    this.select(opts.selected ?? 0);
  }

  get selected(): number {
    return this.sel;
  }

  select(i: number): void {
    this.sel = (i + this.items.length) % this.items.length;
    this.buttons.forEach((b, j) => b.classList.toggle('sel', j === this.sel));
    this.buttons[this.sel].scrollIntoView?.({ block: 'nearest' });
  }

  nav(a: NavAction): void {
    if (a === 'up') {
      this.select(this.sel - 1);
      audio().playSfx('menuMove');
    } else if (a === 'down') {
      this.select(this.sel + 1);
      audio().playSfx('menuMove');
    } else if (a === 'confirm') {
      audio().playSfx('menuSelect');
      this.items[this.sel].action();
    } else if ((a === 'left' || a === 'right') && this.items[this.sel].adjust) {
      audio().playSfx('menuMove');
      this.items[this.sel].adjust!(a === 'left' ? -1 : 1);
    }
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowUp') this.nav('up');
    else if (e.key === 'ArrowDown') this.nav('down');
    else if (e.key === 'ArrowLeft') this.nav('left');
    else if (e.key === 'ArrowRight') this.nav('right');
    else if (e.key === 'Enter' || e.key === ' ') this.nav('confirm');
    else return false;
    return true;
  }
}
