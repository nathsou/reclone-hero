import { createSetlist, deleteSetlist, getSetlist, moveInSetlist, removeFromSetlist, renameSetlist, setlists, shuffleSetlist } from '../../game/setlists.ts';
import type { NavAction } from '../../input/input.ts';
import { formatTime } from '../../util/text.ts';
import type { App, Screen } from '../app.ts';
import { h, replace } from '../dom.ts';
import { keyFocus, moveFocus, navFocus } from '../focusNav.ts';

/**
 * Setlists: make named lists of songs, put them in order, and play one back to back. Opens on the list
 * of setlists, or straight on one.
 */
export class SetlistsModal implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly body: HTMLDivElement;
  private open: string | null;

  constructor(app: App, openId: string | null = null) {
    this.app = app;
    this.open = openId;
    this.body = h('div');
    this.el = h('div', { class: 'modal-backdrop', onclick: (e: Event) => e.target === this.el && this.close() }, h('div', { class: 'modal setlists-modal', role: 'dialog', 'aria-label': 'Setlists' }, this.body));
    this.render();
  }

  shown(): void {
    moveFocus(this.el, 1);
  }

  private close() {
    this.app.popModal(this);
  }

  private render(focus?: string) {
    if (this.open && getSetlist(this.open)) this.renderOne(this.open);
    else this.renderAll();
    if (focus) this.body.querySelector<HTMLElement>(focus)?.focus();
  }

  private renderAll() {
    this.open = null;
    const lists = setlists();
    replace(
      this.body,
      h('h2', null, 'Setlists'),
      h('p', { class: 'hint' }, 'Songs played back to back, with a summary at the end. Add songs from the song options (Space) or the + Setlist button.'),
      h(
        'div',
        { class: 'sl-lists' },
        ...lists.map((s) =>
          h(
            'button',
            { class: 'sl-row', onclick: () => ((this.open = s.id), this.render(), moveFocus(this.el, 1)) },
            h('b', null, s.name),
            h('span', { class: 'dim' }, `${s.songs.length} song${s.songs.length === 1 ? '' : 's'}`),
          ),
        ),
        lists.length ? null : h('p', { class: 'dim' }, 'No setlists yet.'),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onclick: () => ((this.open = createSetlist().id), this.render('.sl-name')) }, 'New setlist'),
        h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'),
      ),
    );
  }

  private renderOne(id: string) {
    const list = getSetlist(id)!;
    const byId = new Map(this.app.library.songs.map((s) => [s.id, s]));
    const name = h('input', { class: 'sl-name', type: 'text', value: list.name, 'aria-label': 'Setlist name', spellcheck: false });
    name.addEventListener('change', () => renameSetlist(id, name.value));
    const length = list.songs.reduce((t, sid) => t + (byId.get(sid)?.lengthMs ?? 0), 0);
    replace(
      this.body,
      h('h2', null, name),
      h('p', { class: 'hint' }, `${list.songs.length} song${list.songs.length === 1 ? '' : 's'}${length ? ` · ${formatTime(length / 1000)}` : ''} · played with your current instrument, difficulty, song speed and modifiers.`),
      h(
        'div',
        { class: 'sl-songs' },
        ...list.songs.map((sid, i) => {
          const song = byId.get(sid);
          return h(
            'div',
            { class: `sl-song${song ? '' : ' missing'}` },
            h('span', { class: 'idx' }, String(i + 1).padStart(2, '0')),
            h('span', { class: 'name' }, ...(song ? [h('b', null, song.name), ` · ${song.artist}`] : ['Not in the library'])),
            h('button', { class: 'btn small ghost', title: 'Earlier', 'aria-label': 'Move up', disabled: i === 0, onclick: () => this.move(id, i, -1) }, '↑'),
            h('button', { class: 'btn small ghost', title: 'Later', 'aria-label': 'Move down', disabled: i === list.songs.length - 1, onclick: () => this.move(id, i, 1) }, '↓'),
            h('button', { class: 'btn small ghost', title: 'Remove from the setlist', 'aria-label': 'Remove', onclick: () => (removeFromSetlist(id, i), this.render(), moveFocus(this.el, 1)) }, '✕'),
          );
        }),
        list.songs.length ? null : h('p', { class: 'dim' }, 'Empty: add songs from the song list (Space › Add to setlist, or the + Setlist button).'),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary', disabled: !list.songs.length, onclick: () => void this.play(id) }, 'Play setlist'),
        h('button', { class: 'btn', disabled: list.songs.length < 2, onclick: () => (shuffleSetlist(id), this.render()) }, 'Shuffle'),
        h('button', { class: 'btn ghost', onclick: () => this.confirmDelete(id) }, 'Delete setlist'),
        h('button', { class: 'btn ghost', onclick: () => (this.renderAll(), moveFocus(this.el, 1)) }, '← All setlists'),
      ),
    );
  }

  private move(id: string, i: number, dir: number) {
    const to = moveInSetlist(id, i, dir);
    this.render();
    // keep the focus on the song that moved
    this.body.querySelectorAll<HTMLElement>('.sl-song')[to]?.querySelector<HTMLElement>(`[aria-label="${dir < 0 ? 'Move up' : 'Move down'}"]:not([disabled])`)?.focus();
  }

  private confirmDelete(id: string) {
    const list = getSetlist(id)!;
    void import('./choice.ts').then(({ ChoiceModal }) =>
      this.app.pushModal(
        new ChoiceModal(this.app, `Delete “${list.name}”?`, ['The songs stay in the library.'], [
          { label: 'Cancel', action: () => {} },
          { label: 'Delete the setlist', action: () => (deleteSetlist(id), this.renderAll(), moveFocus(this.el, 1)) },
        ]),
      ),
    );
  }

  private async play(id: string) {
    const { startSetlist } = await import('../setlistRun.ts');
    await startSetlist(this.app, getSetlist(id)!);
  }

  nav(a: NavAction): void {
    if (a === 'back') {
      if (this.open) {
        this.renderAll();
        moveFocus(this.el, 1);
      } else this.close();
    } else if (a === 'start') this.close();
    else navFocus(this.el, a);
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.nav('back');
      return true;
    }
    return keyFocus(this.el, e);
  }
}
