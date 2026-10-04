import type { NavAction } from '../../input/input.ts';
import type { App, Screen } from '../app.ts';
import { h } from '../dom.ts';
import { keyFocus, moveFocus, navFocus } from '../focusNav.ts';
import type { SetlistRun } from '../setlistRun.ts';
import { starsEl } from './songselect.ts';

/** The end of a setlist: every song's result and the totals, like a Guitar Hero gig. */
export class SetlistSummary implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly run: SetlistRun;

  constructor(app: App, run: SetlistRun) {
    this.app = app;
    this.run = run;
    const played = run.results.filter((r) => r && !r.skipped);
    const total = played.reduce((s, r) => s + r!.score, 0);
    const stars = played.reduce((s, r) => s + Math.floor(r!.stars), 0);
    const acc = played.length ? played.reduce((s, r) => s + r!.accuracy, 0) / played.length : 0;
    const fcs = played.filter((r) => r!.fc).length;
    const stat = (label: string, value: string | HTMLElement) => h('div', { class: 'res-num' }, h('div', { class: 'label' }, label), h('div', { class: 'v' }, value));
    this.el = h(
      'div',
      { class: 'screen results-screen setlist-summary' },
      h('div', { class: 'res-head' }, h('div', { class: 'res-song' }, h('div', { class: 'title' }, run.name), h('div', { class: 'artist' }, `Setlist · ${run.songs.length} song${run.songs.length === 1 ? '' : 's'}`))),
      h(
        'div',
        { class: 'res-nums' },
        stat('Total score', total.toLocaleString('en-US')),
        stat('Stars', `${stars} ★`),
        stat('Average accuracy', `${(acc * 100).toFixed(1)}%`),
        stat('Full combos', `${fcs} / ${played.length}`),
      ),
      h(
        'table',
        { class: 'sl-table' },
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Song'), h('th', null, 'Part'), h('th', null, 'Score'), h('th', null, 'Stars'), h('th', null, 'Accuracy'))),
        h(
          'tbody',
          null,
          ...run.songs.map((song, i) => {
            const r = run.results[i];
            const status = !r ? 'not played' : r.skipped ? (r.skipped === 'skipped' ? 'skipped' : `skipped: ${r.skipped}`) : r.failed ? 'failed' : r.fc ? 'FC' : '';
            return h(
              'tr',
              { class: !r || r.skipped ? 'dim' : r.failed ? 'failed' : '' },
              h('td', null, String(i + 1)),
              h('td', null, h('b', null, song.name), ` · ${song.artist}`, status ? h('span', { class: 'st' }, status) : null),
              h('td', null, r?.part ?? ''),
              h('td', null, r && !r.skipped ? r.score.toLocaleString('en-US') : '—'),
              h('td', null, r && !r.skipped ? starsEl(r.stars) : ''),
              h('td', null, r && !r.skipped ? `${(r.accuracy * 100).toFixed(1)}%` : ''),
            );
          }),
        ),
      ),
      h(
        'div',
        { class: 'res-foot' },
        h('div', { class: 'stats' }),
        h(
          'div',
          { class: 'res-actions' },
          h('button', { class: 'btn', onclick: () => void this.again() }, 'Play the setlist again'),
          h('button', { class: 'btn primary', onclick: () => void this.back() }, 'Song list', h('kbd', null, 'Enter')),
        ),
      ),
    );
  }

  shown(): void {
    moveFocus(this.el, -1);
  }

  private async again() {
    const run = this.run;
    run.index = 0;
    run.results = [];
    const { playSetlistSong } = await import('../setlistRun.ts');
    await playSetlistSong(this.app, run);
  }

  private async back() {
    const { SongSelect } = await import('./songselect.ts');
    this.app.show(new SongSelect(this.app));
  }

  nav(a: NavAction): void {
    if (a === 'back') void this.back();
    else navFocus(this.el, a);
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') void this.back();
    else return keyFocus(this.el, e);
    return true;
  }
}
