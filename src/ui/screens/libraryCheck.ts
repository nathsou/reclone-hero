import { chartIssues, rememberIssues, worstLevel } from '../../chart/issues.ts';
import type { ChartIssue } from '../../chart/issues.ts';
import { loadChart } from '../../chart/load.ts';
import type { NavAction } from '../../input/input.ts';
import { hideSong } from '../../library/hidden.ts';
import type { SongEntry } from '../../library/song.ts';
import { BuiltinSource } from '../../starter/source.ts';
import type { App, Screen } from '../app.ts';
import { h, replace, setText } from '../dom.ts';
import { keyFocus, moveFocus, navFocus } from '../focusNav.ts';
import { findDuplicates } from '../songlist.ts';

interface Finding {
  song: SongEntry;
  issues: ChartIssue[];
  row: HTMLElement | null;
}

/** What the song list offers the check: jump to a song, or show the duplicates. */
interface SongListHooks {
  focusSong?(id: string): void;
  showDuplicates?(): void;
}

/**
 * Reads every chart in the player's library and lists the ones that cannot be played or look broken
 * (no notes, unreadable, broken tempo, stacked gems), with a way to jump to each, hide it or delete it.
 */
export class LibraryCheck implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly status: HTMLParagraphElement;
  private readonly fill: HTMLElement;
  private readonly list: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private findings: Finding[] = [];
  private cancelled = false;

  constructor(app: App) {
    this.app = app;
    this.status = h('p', { class: 'hint' }, 'Reading charts…');
    this.fill = h('i');
    this.list = h('div', { class: 'lc-list' });
    this.actions = h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => this.close() }, 'Stop'));
    this.el = h(
      'div',
      { class: 'modal-backdrop', onclick: (e: Event) => e.target === this.el && this.close() },
      h('div', { class: 'modal library-check', role: 'dialog', 'aria-label': 'Check library' }, h('h2', null, 'Check library'), this.status, h('div', { class: 'lc-bar' }, this.fill), this.list, this.actions),
    );
  }

  shown(): void {
    void this.run();
  }

  destroy(): void {
    this.cancelled = true;
  }

  private close() {
    this.app.popModal(this);
  }

  private get songList(): SongListHooks {
    return (this.app.current ?? {}) as SongListHooks;
  }

  private async run() {
    const lib = this.app.library;
    const songs = lib.songs.filter((s) => !BuiltinSource.isBuiltin(s.path));
    let last = performance.now();
    for (let i = 0; i < songs.length; i++) {
      if (this.cancelled) return;
      const song = songs[i];
      let issues: ChartIssue[];
      try {
        const chart = loadChart(song.chartFile, await lib.readFile(song, song.chartFile), song.chartOptions);
        issues = chartIssues(chart, song, { deep: true });
      } catch (err) {
        issues = [{ level: 'error', code: 'unreadable', text: `The chart could not be read: ${(err as Error).message}` }];
      }
      rememberIssues(song.id, issues);
      const worst = worstLevel(issues);
      if (worst === 'error' || worst === 'warn') this.findings.push({ song, issues: issues.filter((x) => x.level !== 'info'), row: null });
      // Keep the page responsive: hand control back every ~30 ms of parsing.
      if (performance.now() - last > 30) {
        this.progress(i + 1, songs.length);
        await new Promise((r) => setTimeout(r, 0));
        last = performance.now();
      }
    }
    if (this.cancelled) return;
    this.progress(songs.length, songs.length);
    this.showResults(songs.length);
  }

  private progress(done: number, total: number) {
    this.fill.style.transform = `scaleX(${total ? done / total : 1})`;
    setText(this.status, `Reading charts… ${done} of ${total}${this.findings.length ? ` · ${this.findings.length} with problems` : ''}`);
  }

  private showResults(checked: number) {
    const broken = this.findings.filter((f) => worstLevel(f.issues) === 'error');
    const odd = this.findings.length - broken.length;
    const dupes = findDuplicates(this.app.library.songs).size;
    const parts = [broken.length && `${broken.length} cannot be played`, odd && `${odd} look${odd === 1 ? 's' : ''} wrong`].filter(Boolean);
    setText(
      this.status,
      checked === 0
        ? 'There are no songs of your own to check: open your charts folder first.'
        : `Checked ${checked} song${checked === 1 ? '' : 's'}: ${parts.length ? parts.join(', ') : 'no problems found'}.${dupes ? ` ${dupes} songs are in the library more than once.` : ''}`,
    );
    this.el.querySelector('.lc-bar')?.remove();
    replace(this.list, ...this.findings.map((f) => this.row(f)));
    replace(
      this.actions,
      broken.length > 1 ? h('button', { class: 'btn', onclick: () => this.hideAll(broken) }, `Hide all ${broken.length} that cannot be played`) : null,
      dupes ? h('button', { class: 'btn', onclick: () => this.go((s) => s.showDuplicates?.()) }, `Show the ${dupes} duplicates`) : null,
      h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'),
    );
    moveFocus(this.el, 1);
  }

  private row(f: Finding): HTMLElement {
    const lib = this.app.library;
    const song = f.song;
    f.row = h(
      'div',
      { class: 'lc-row' },
      h('div', { class: 'lc-title' }, h('b', null, song.name), ` · ${song.artist}`),
      h('div', { class: 'lc-path' }, song.path),
      h('ul', { class: 'issues' }, ...f.issues.map((i) => h('li', { class: i.level }, i.text))),
      h(
        'div',
        { class: 'lc-actions' },
        h('button', { class: 'btn small', onclick: () => this.go((s) => s.focusSong?.(song.id)) }, 'Show'),
        h('button', { class: 'btn small', onclick: () => this.hide([f]) }, 'Hide'),
        lib.canDelete(song) ? h('button', { class: 'btn small ghost', onclick: () => this.confirmDelete(f) }, 'Delete…') : null,
      ),
    );
    return f.row;
  }

  /** Close the check (and whatever it was opened from) and act on the song list. */
  private go(fn: (s: SongListHooks) => void) {
    this.app.closeModals();
    fn(this.songList);
  }

  private hideAll(list: Finding[]) {
    void import('./choice.ts').then(({ ChoiceModal }) =>
      this.app.pushModal(
        new ChoiceModal(this.app, `Hide ${list.length} songs?`, ['They stay on disk. Settings › Data › Show hidden songs brings them back.'], [
          { label: 'Cancel', action: () => {} },
          { label: `Hide all ${list.length}`, action: () => this.hide(list) },
        ]),
      ),
    );
  }

  private hide(list: Finding[]) {
    for (const f of list) {
      hideSong(f.song.id);
      this.drop(f);
    }
    void this.app.refreshLibrary();
    this.app.toast(list.length === 1 ? `${list[0].song.name} hidden from the song list` : `${list.length} songs hidden from the song list`);
  }

  private confirmDelete(f: Finding) {
    const song = f.song;
    void import('./choice.ts').then(({ ChoiceModal }) =>
      this.app.pushModal(
        new ChoiceModal(this.app, `Delete “${song.name}”?`, [`The folder “${song.path}” and everything in it will be deleted from your disk. This cannot be undone.`], [
          { label: 'Cancel', action: () => {} },
          {
            label: 'Delete permanently',
            action: async () => {
              try {
                await this.app.library.deleteSong(song);
              } catch (err) {
                this.app.toast(`Could not delete ${song.name}: ${(err as Error).message}`);
                return;
              }
              this.drop(f);
              void this.app.refreshLibrary();
              this.app.toast(`${song.name} deleted`);
            },
          },
        ]),
      ),
    );
  }

  private drop(f: Finding) {
    const next = f.row?.nextElementSibling ?? f.row?.previousElementSibling;
    f.row?.remove();
    this.findings = this.findings.filter((x) => x !== f);
    next?.querySelector<HTMLElement>('button')?.focus();
  }

  nav(a: NavAction): void {
    if (a === 'back' || a === 'start') this.close();
    else navFocus(this.el, a);
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.close();
      return true;
    }
    return keyFocus(this.el, e);
  }
}
