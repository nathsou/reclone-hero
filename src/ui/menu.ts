import type { NavAction } from '../input/input.ts';
import { audio } from '../audio/audio.ts';
import { h } from './dom.ts';

export interface MenuItem {
  label: string;
  action: () => void;
}

/** Big-type numbered menu, navigable by mouse, keyboard and guitar. */
export class Menu {
  readonly el: HTMLDivElement;
  private readonly items: MenuItem[];
  private readonly buttons: HTMLButtonElement[];
  private sel = 0;

  constructor(caption: string, items: MenuItem[]) {
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
    this.el = h('div', { class: 'menu' }, h('div', { class: 'menu-title' }, caption), ...this.buttons);
    this.select(0);
  }

  select(i: number): void {
    this.sel = (i + this.items.length) % this.items.length;
    this.buttons.forEach((b, j) => b.classList.toggle('sel', j === this.sel));
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
    }
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowUp') this.nav('up');
    else if (e.key === 'ArrowDown') this.nav('down');
    else if (e.key === 'Enter' || e.key === ' ') this.nav('confirm');
    else return false;
    return true;
  }
}
