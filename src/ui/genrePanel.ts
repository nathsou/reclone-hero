import { FAMILIES, familyOf, genreKey } from '../library/genres.ts';
import type { Family, GenreFilter } from '../library/genres.ts';
import type { SongEntry } from '../library/song.ts';
import { h, replace } from './dom.ts';
import { icon } from './icons.ts';

interface FamilyInfo {
  family: Family;
  count: number;
  /** genre key -> display name and count */
  genres: { key: string; label: string; count: number }[];
}

/** Genre family + exact genre tallies for a library. */
function tally(songs: SongEntry[]): FamilyInfo[] {
  const fams = new Map<Family, FamilyInfo>();
  const genres = new Map<string, { key: string; label: string; count: number }>();
  for (const s of songs) {
    const f = familyOf(s.genre);
    let info = fams.get(f);
    if (!info) fams.set(f, (info = { family: f, count: 0, genres: [] }));
    info.count++;
    const k = genreKey(s.genre);
    if (!k) continue;
    let g = genres.get(k);
    if (!g) {
      genres.set(k, (g = { key: k, label: s.genre.trim(), count: 0 }));
      info.genres.push(g);
    }
    g.count++;
  }
  for (const f of fams.values()) f.genres.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return FAMILIES.map((f) => fams.get(f)).filter((f): f is FamilyInfo => !!f);
}

/**
 * Dropdown for filtering the song list by genre: pick whole families (Metal catches metalcore, djent…)
 * or exact genres, then either show only those or hide them.
 */
export class GenrePanel {
  readonly el: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly modeOnly: HTMLButtonElement;
  private readonly modeHide: HTMLButtonElement;
  private families: FamilyInfo[] = [];
  private expanded = new Set<Family>();
  private filter: GenreFilter;
  private readonly onChange: (f: GenreFilter) => void;
  private readonly onOutside = (e: PointerEvent) => {
    if (!this.el.contains(e.target as Node) && !(e.target as Element).closest?.('.genre-btn')) this.close();
  };

  constructor(filter: GenreFilter, onChange: (f: GenreFilter) => void) {
    this.filter = filter;
    this.onChange = onChange;
    this.modeOnly = h('button', { class: 'seg', onclick: () => this.setMode('only') }, 'Show only');
    this.modeHide = h('button', { class: 'seg', onclick: () => this.setMode('hide') }, 'Hide');
    this.list = h('div', { class: 'genre-list' });
    this.el = h(
      'div',
      { class: 'genre-panel', role: 'dialog', 'aria-label': 'Filter by genre' },
      h(
        'div',
        { class: 'genre-head' },
        h('div', { class: 'segmented' }, this.modeOnly, this.modeHide),
        h('button', { class: 'btn ghost small', onclick: () => this.set({ ...this.filter, items: [] }) }, 'Clear'),
      ),
      h('p', { class: 'hint' }, 'Tick a family to include all of its styles, or open it to pick exact genres.'),
      this.list,
    );
  }

  get isOpen(): boolean {
    return this.el.isConnected;
  }

  open(anchor: HTMLElement, songs: SongEntry[]): void {
    this.families = tally(songs);
    anchor.after(this.el);
    this.render();
    setTimeout(() => document.addEventListener('pointerdown', this.onOutside), 0);
  }

  close(): void {
    document.removeEventListener('pointerdown', this.onOutside);
    this.el.remove();
  }

  private setMode(mode: GenreFilter['mode']) {
    this.set({ ...this.filter, mode });
  }

  private set(f: GenreFilter) {
    this.filter = f;
    this.onChange(f);
    this.render();
  }

  private toggleFamily(info: FamilyInfo) {
    const tok = `f:${info.family}`;
    const own = new Set(info.genres.map((g) => `g:${g.key}`));
    const items = this.filter.items.filter((i) => i !== tok && !own.has(i));
    if (!this.filter.items.includes(tok)) items.push(tok);
    this.set({ ...this.filter, items });
  }

  private toggleGenre(info: FamilyInfo, key: string) {
    const ftok = `f:${info.family}`;
    const gtok = `g:${key}`;
    let items = this.filter.items.slice();
    if (items.includes(ftok)) {
      // Unticking one style of a ticked family: keep the rest of the family ticked individually.
      items = items.filter((i) => i !== ftok);
      for (const g of info.genres) if (g.key !== key) items.push(`g:${g.key}`);
    } else if (items.includes(gtok)) {
      items = items.filter((i) => i !== gtok);
    } else {
      items.push(gtok);
      // Every style ticked: collapse into the family (so new songs of that family are included too).
      if (info.genres.every((g) => items.includes(`g:${g.key}`))) {
        items = items.filter((i) => !info.genres.some((g) => i === `g:${g.key}`));
        items.push(ftok);
      }
    }
    this.set({ ...this.filter, items });
  }

  private render() {
    this.modeOnly.classList.toggle('on', this.filter.mode === 'only');
    this.modeHide.classList.toggle('on', this.filter.mode === 'hide');
    const items = new Set(this.filter.items);
    replace(
      this.list,
      ...this.families.map((info) => {
        const famOn = items.has(`f:${info.family}`);
        const some = !famOn && info.genres.some((g) => items.has(`g:${g.key}`));
        const box = h('input', { type: 'checkbox', checked: famOn });
        box.indeterminate = some;
        box.addEventListener('change', () => this.toggleFamily(info));
        const open = this.expanded.has(info.family);
        const canOpen = info.genres.length > 1 || (info.genres.length === 1 && info.genres[0].label.toLowerCase() !== info.family.toLowerCase());
        const row = h(
          'div',
          { class: `genre-row fam ${famOn || some ? 'sel' : ''}` },
          h('label', null, box, h('span', { class: 'name' }, info.family)),
          h('span', { class: 'n' }, String(info.count)),
          canOpen
            ? h(
                'button',
                {
                  class: `btn ghost icon small expand ${open ? 'open' : ''}`,
                  'aria-label': open ? `Collapse ${info.family}` : `Show ${info.family} styles`,
                  onclick: () => {
                    if (open) this.expanded.delete(info.family);
                    else this.expanded.add(info.family);
                    this.render();
                  },
                },
                icon('chevron'),
              )
            : h('span', { class: 'expand-spacer' }),
        );
        if (!open) return row;
        const sub = h(
          'div',
          { class: 'genre-sub' },
          ...info.genres.map((g) => {
            const cb = h('input', { type: 'checkbox', checked: famOn || items.has(`g:${g.key}`) });
            cb.addEventListener('change', () => this.toggleGenre(info, g.key));
            return h('div', { class: 'genre-row' }, h('label', null, cb, h('span', { class: 'name' }, g.label)), h('span', { class: 'n' }, String(g.count)));
          }),
        );
        return h('div', null, row, sub);
      }),
    );
  }
}

/** Short summary for the filter button, e.g. "Hiding Metal" or "Only Rock, Electronic". */
export function describeGenreFilter(f: GenreFilter): string {
  if (!f.items.length) return 'All genres';
  const names = f.items.map((i) => (i.startsWith('f:') ? i.slice(2) : i.slice(2).replace(/\b\w/g, (c) => c.toUpperCase())));
  const list = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  return f.mode === 'only' ? `Only ${list}` : `Hiding ${list}`;
}
