import { PreviewPlayer } from '../../audio/preview.ts';
import type { Chart } from '../../chart/build.ts';
import type { Difficulty, Instrument } from '../../chart/types.ts';
import { DIFFICULTIES, INSTRUMENTS, INSTRUMENT_LABEL, trackKey } from '../../chart/types.ts';
import { chartFor } from '../../game/charts.ts';
import { getBest, scoreKey } from '../../game/scores.ts';
import type { NavAction } from '../../input/input.ts';
import type { SongEntry } from '../../library/song.ts';
import { settings, updateSettings } from '../../settings.ts';
import type { Settings } from '../../settings.ts';
import { formatTime } from '../../util/text.ts';
import type { App, Screen } from '../app.ts';
import { h, replace, setText } from '../dom.ts';
import { canFullscreen, toggleFullscreen } from '../fullscreen.ts';
import { logo } from '../logo.ts';
import { SORTS, SORT_DIRECTION, SORT_LABEL, sortAndGroup } from '../songlist.ts';
import { GenrePanel, describeGenreFilter } from '../genrePanel.ts';
import { icon } from '../icons.ts';
import { passesGenreFilter } from '../../library/genres.ts';
import { getPlays } from '../../game/plays.ts';
import type { Group } from '../songlist.ts';

const ROW_H = 60;
const HEADER_H = 38;
/** Short enough to feel instant, long enough not to start a preview for every song while scrolling. */
const PREVIEW_DELAY_MS = 160;
const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

export class SongSelect implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly list: HTMLDivElement;
  private readonly spacer: HTMLDivElement;
  private readonly rows: HTMLDivElement[] = [];
  private readonly search: HTMLInputElement;
  private readonly count: HTMLSpanElement;
  private readonly detail: HTMLDivElement;
  private readonly preview: PreviewPlayer;
  private filtered: SongEntry[] = [];
  private groups: Group[] = [];
  /** virtual list items: song index, or -(group index + 1) for a group header */
  private items: Int32Array = new Int32Array(0);
  private itemTop: Float64Array = new Float64Array(1);
  /** item index of each song */
  private songItem: Int32Array = new Int32Array(0);
  private readonly sticky: HTMLDivElement;
  private sel = 0;
  private readonly sortDir: HTMLButtonElement;
  private readonly genreBtn: HTMLButtonElement;
  private readonly genrePanel: GenrePanel;
  private chart: Chart | null = null;
  private chartFor: SongEntry | null = null;
  private instrument: Instrument = settings.instrument;
  private difficulty: Difficulty = settings.difficulty;
  private detailTimer = 0;
  private previewTimer = 0;
  private artUrls = new Map<string, Promise<string>>();

  constructor(app: App) {
    this.app = app;
    this.preview = new PreviewPlayer(app.library);
    this.search = h('input', { class: 'search', type: 'search', placeholder: 'Search songs, artists, charters…', spellcheck: false });
    this.search.addEventListener('input', () => this.refilter());
    const sort = h(
      'select',
      { class: 'sort', title: 'Sort and group by' },
      ...SORTS.map((s) => h('option', { value: s, selected: settings.sort === s }, `By ${SORT_LABEL[s].toLowerCase()}`)),
    );
    sort.addEventListener('change', () => {
      updateSettings({ sort: sort.value as Settings['sort'], sortReverse: false });
      this.updateSortButton();
      this.refilter();
    });
    this.sortDir = h('button', {
      class: 'btn ghost icon',
      onclick: () => {
        updateSettings({ sortReverse: !settings.sortReverse });
        this.updateSortButton();
        this.refilter();
      },
    });
    this.updateSortButton();
    this.genreBtn = h('button', { class: 'btn genre-btn', onclick: () => this.toggleGenres() });
    this.genrePanel = new GenrePanel(settings.genreFilter, (f) => {
      updateSettings({ genreFilter: f });
      this.updateGenreButton();
      this.refilter();
    });
    this.updateGenreButton();
    this.count = h('span', { class: 'count' });
    this.spacer = h('div', { class: 'spacer' });
    this.list = h('div', { class: 'song-list', tabindex: '-1' }, this.spacer);
    this.list.addEventListener('scroll', () => this.renderRows());
    this.sticky = h('div', { class: 'group-sticky' });
    this.sticky.addEventListener('click', () => this.jumpGroup(0));
    this.detail = h('div', { class: 'song-detail' });
    const lib = app.library;
    this.el = h(
      'div',
      { class: 'screen select-screen' },
      h(
        'header',
        null,
        logo('small'),
        this.search,
        h('div', { class: 'sort-group' }, sort, this.sortDir),
        h('div', { class: 'genre-anchor' }, this.genreBtn),
        this.count,
        h('button', { class: 'btn ghost icon', title: 'Random song (R)', 'aria-label': 'Random song', onclick: () => this.random() }, icon('shuffle')),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost icon', title: 'Rescan library', 'aria-label': 'Rescan library', onclick: () => lib.source && app.openLibrary(lib.source, true) }, icon('refresh')),
        h(
          'button',
          {
            class: 'btn ghost icon',
            title: 'Choose a different charts folder',
            'aria-label': 'Choose charts folder',
            onclick: async () => {
              const { Library } = await import('../../library/library.ts');
              const src = await Library.pickAny();
              if (src) await app.openLibrary(src, true);
            },
          },
          icon('folder'),
        ),
        canFullscreen() ? h('button', { class: 'btn ghost icon', title: 'Fullscreen (Shift+F)', 'aria-label': 'Fullscreen', onclick: () => void toggleFullscreen() }, icon('maximize')) : null,
        h('button', { class: 'btn', onclick: () => this.openSettings() }, icon('settings'), 'Settings'),
      ),
      h('main', null, h('div', { class: 'list-wrap' }, this.list, this.sticky), this.detail),
      h(
        'footer',
        null,
        hint('↑↓ / strum', 'browse'),
        hint('PgUp/PgDn', 'jump group'),
        hint('R', 'random'),
        hint('Enter / green', 'play'),
        hint('P / yellow', 'practice'),
        hint('←→ / blue·orange', 'difficulty'),
        hint('Tab', 'instrument'),
        hint('B', 'watch bot'),
        hint('Shift+F', 'fullscreen'),
      ),
    );
    this.refilter();
  }

  /** Stop the preview while the tab is in the background; pick it back up on return. */
  private onVisibility = () => {
    if (document.hidden) this.preview.cancel();
    else {
      const song = this.filtered[this.sel];
      if (song) this.schedulePreview(song);
    }
  };

  shown(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderRows();
    this.scrollToSel();
    this.list.focus({ preventScroll: true });
  }

  destroy(): void {
    this.genrePanel.close();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.preview.cancel();
    clearTimeout(this.detailTimer);
    clearTimeout(this.previewTimer);
    for (const p of this.artUrls.values()) void p.then((u) => this.app.library.release(u));
  }

  private openSettings() {
    void import('./settings.ts').then(({ SettingsModal }) => this.app.pushModal(new SettingsModal(this.app)));
  }

  // ---------------------------------------------------------------- list

  private refilter() {
    const q = this.search.value.trim().toLowerCase();
    const current = this.filtered[this.sel];
    const terms = q.split(/\s+/).filter(Boolean);
    const gf = settings.genreFilter;
    const matching = this.app.library.songs.filter((s) => {
      if (!passesGenreFilter(s.genre, gf)) return false;
      if (!terms.length) return true;
      const hay = `${s.name} ${s.artist} ${s.album} ${s.charter} ${s.genre} ${s.pack} ${s.year}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const { songs, groups } = sortAndGroup(matching, settings.sort, { instrument: settings.instrument, reverse: settings.sortReverse, plays: getPlays });
    this.filtered = songs;
    this.groups = groups;
    // Lay out the virtual list: a header before each group, then its songs.
    const n = songs.length + groups.length;
    this.items = new Int32Array(n);
    this.itemTop = new Float64Array(n + 1);
    this.songItem = new Int32Array(songs.length);
    let k = 0;
    let y = 0;
    groups.forEach((g, gi) => {
      this.items[k] = -(gi + 1);
      this.itemTop[k++] = y;
      y += HEADER_H;
      for (let i = g.start; i < g.start + g.count; i++) {
        this.songItem[i] = k;
        this.items[k] = i;
        this.itemTop[k++] = y;
        y += ROW_H;
      }
    });
    this.itemTop[n] = y;
    const label = SORT_LABEL[settings.sort].toLowerCase();
    const total = this.app.library.songs.length;
    setText(this.count, songs.length === total ? `${total} songs` : `${songs.length} of ${total}`);
    this.count.title = `${groups.length} groups by ${label}`;
    this.spacer.style.height = `${y}px`;
    for (const r of this.rows) delete r.dataset.key;
    const idx = current ? songs.indexOf(current) : -1;
    this.select(idx >= 0 ? idx : 0, true);
  }

  private updateSortButton() {
    const [natural, reversed] = SORT_DIRECTION[settings.sort];
    const label = settings.sortReverse ? reversed : natural;
    this.sortDir.replaceChildren(icon(settings.sortReverse ? 'sortDesc' : 'sortAsc'));
    this.sortDir.title = `${label} (click to reverse)`;
    this.sortDir.setAttribute('aria-label', `Sort direction: ${label}`);
  }

  private updateGenreButton() {
    const f = settings.genreFilter;
    this.genreBtn.replaceChildren(icon('filter'), describeGenreFilter(f));
    this.genreBtn.classList.toggle('on', f.items.length > 0);
    this.genreBtn.title = 'Filter by genre';
  }

  private toggleGenres() {
    if (this.genrePanel.isOpen) this.genrePanel.close();
    else this.genrePanel.open(this.genreBtn, this.app.library.songs);
  }

  /** Index of the first item whose bottom edge is below y. */
  private itemAt(y: number): number {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.itemTop[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private groupOfSong(i: number): number {
    let lo = 0;
    let hi = this.groups.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.groups[mid].start <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  private renderRows() {
    const top = this.list.scrollTop;
    const h0 = this.list.clientHeight || 800;
    const first = Math.max(0, this.itemAt(top) - 3);
    const last = Math.min(this.items.length, this.itemAt(top + h0) + 4);
    const needed = last - first;
    while (this.rows.length < needed) {
      const row = h('div', { class: 'song-row' });
      row.addEventListener('click', () => {
        const v = Number(row.dataset.item);
        const it = this.items[v];
        if (it >= 0) this.select(it);
      });
      row.addEventListener('dblclick', () => {
        if (this.items[Number(row.dataset.item)] >= 0) void this.play(false);
      });
      this.rows.push(row);
      this.list.append(row);
    }
    for (let k = 0; k < this.rows.length; k++) {
      const row = this.rows[k];
      const v = first + k;
      if (v >= last) {
        row.style.display = 'none';
        continue;
      }
      row.style.display = '';
      row.style.transform = `translateY(${this.itemTop[v]}px)`;
      row.dataset.item = String(v);
      const it = this.items[v];
      row.classList.toggle('sel', it === this.sel);
      const key = it >= 0 ? `s:${this.filtered[it].id}` : `g:${it}:${this.groups[-it - 1].label}`;
      if (row.dataset.key === key) continue;
      row.dataset.key = key;
      if (it < 0) {
        const g = this.groups[-it - 1];
        row.className = 'song-row group-row';
        replace(
          row,
          h('span', { class: 'group-label' }, g.label),
          g.rating !== undefined ? pips(g.rating) : null,
          h('span', { class: 'group-count' }, String(g.count)),
        );
        continue;
      }
      row.className = `song-row${it === this.sel ? ' sel' : ''}`;
      const s = this.filtered[it];
      const art = h('div', { class: 'thumb' });
      if (s.albumArt) {
        void this.art(s).then((u) => {
          if (row.dataset.key === key) art.style.backgroundImage = `url("${u}")`;
        });
      }
      const best = getBest(scoreKey(s.id, trackKey(this.instrument, this.difficulty)));
      // Under an artist header the artist is redundant: show the album instead, as Clone Hero does.
      const sub = settings.sort === 'artist' ? [s.album, s.year].filter(Boolean).join(' · ') || s.charter : s.artist;
      const rating = s.diffs[settings.instrument];
      replace(
        row,
        art,
        h('div', { class: 'meta' }, h('div', { class: 'title' }, s.name), h('div', { class: 'artist' }, sub)),
        h(
          'div',
          { class: 'side' },
          best ? h('div', { class: 'best' }, starsEl(best.stars), best.fc ? h('span', { class: 'fc' }, 'FC') : null) : null,
          h('div', { class: 'len' }, rating !== undefined && rating >= 0 && settings.sort !== 'difficulty' ? pips(rating) : null, s.lengthMs ? formatTime(s.lengthMs / 1000) : ''),
        ),
      );
    }
    // Sticky label for the group at the top of the viewport.
    const topItem = this.itemAt(top + 1);
    const it = this.items[topItem];
    const gi = it === undefined ? -1 : it < 0 ? -it - 1 : this.groupOfSong(it);
    const g = this.groups[gi];
    const stickyKey = g ? `${gi}` : '';
    if (this.sticky.dataset.key !== stickyKey) {
      this.sticky.dataset.key = stickyKey;
      replace(this.sticky, g ? h('span', { class: 'group-label' }, g.label) : null, g && g.rating !== undefined ? pips(g.rating) : null, g ? h('span', { class: 'group-count' }, String(g.count)) : null);
    }
    this.sticky.classList.toggle('on', !!g && top > 1);
  }

  /** Jump to the first song of the next (dir 1) or previous (dir -1) group; 0 = start of the current group. */
  private jumpGroup(dir: number) {
    if (!this.groups.length) return;
    const gi = this.groupOfSong(this.sel);
    const g = this.groups[gi];
    let target = gi + dir;
    // "Previous" from inside a group goes to that group's start first.
    if (dir < 0 && this.sel > g.start) target = gi;
    target = Math.max(0, Math.min(this.groups.length - 1, target));
    this.select(this.groups[target].start);
    // Put the group's header at the top of the list.
    this.list.scrollTop = this.itemTop[this.songItem[this.sel] - 1] ?? 0;
  }

  private random() {
    if (!this.filtered.length) return;
    this.select(Math.floor(Math.random() * this.filtered.length));
    const y = this.itemTop[this.songItem[this.sel]];
    this.list.scrollTop = y - this.list.clientHeight / 2 + ROW_H / 2;
  }

  private art(s: SongEntry): Promise<string> {
    let p = this.artUrls.get(s.id);
    if (!p) {
      p = this.app.library.fileUrl(s, s.albumArt!);
      this.artUrls.set(s.id, p);
      if (this.artUrls.size > 400) {
        const [k, old] = this.artUrls.entries().next().value!;
        this.artUrls.delete(k);
        void old.then((u) => this.app.library.release(u));
      }
    }
    return p;
  }

  private select(i: number, force = false) {
    if (!this.filtered.length) {
      this.detail.replaceChildren(h('div', { class: 'empty' }, 'No songs match.'));
      this.renderRows();
      return;
    }
    i = Math.max(0, Math.min(this.filtered.length - 1, i));
    if (i === this.sel && !force) return;
    this.sel = i;
    this.renderRows();
    this.scrollToSel();
    const song = this.filtered[i];
    // While scrolling quickly only the list moves; details, chart and preview follow once it settles.
    clearTimeout(this.detailTimer);
    this.detailTimer = window.setTimeout(
      () => {
        this.renderDetail(song);
        void this.loadChart(song);
      },
      force ? 0 : 70,
    );
    this.schedulePreview(song);
  }

  private schedulePreview(song: SongEntry) {
    clearTimeout(this.previewTimer);
    this.preview.cancel();
    if (document.hidden) return;
    this.previewTimer = window.setTimeout(() => void this.preview.play(song), PREVIEW_DELAY_MS);
  }

  private scrollToSel() {
    const item = this.songItem[this.sel];
    if (item === undefined) return;
    // Keep the group header visible above the first song of a group.
    const isFirst = this.groups.length && this.groups[this.groupOfSong(this.sel)].start === this.sel;
    const y = this.itemTop[item] - (isFirst ? HEADER_H : 0);
    const bottom = this.itemTop[item] + ROW_H;
    const l = this.list;
    // The sticky header covers the top of the list.
    if (y < l.scrollTop + HEADER_H) l.scrollTop = Math.max(0, y - (isFirst ? 0 : HEADER_H));
    else if (bottom > l.scrollTop + l.clientHeight) l.scrollTop = bottom - l.clientHeight;
  }

  // ---------------------------------------------------------------- detail

  private async loadChart(song: SongEntry) {
    try {
      const chart = await chartFor(this.app.library, song);
      if (this.filtered[this.sel] !== song) return;
      this.chart = chart;
      this.chartFor = song;
      this.pickAvailable();
      this.renderDetail(song);
    } catch (err) {
      if (this.filtered[this.sel] !== song) return;
      this.chart = null;
      this.chartFor = song;
      this.renderDetail(song, (err as Error).message);
    }
  }

  private available(): { inst: Instrument; diffs: Difficulty[] }[] {
    if (!this.chart) return [];
    const out: { inst: Instrument; diffs: Difficulty[] }[] = [];
    for (const inst of INSTRUMENTS) {
      const diffs = DIFFICULTIES.filter((d) => this.chart!.tracks.has(trackKey(inst, d)));
      if (diffs.length) out.push({ inst, diffs });
    }
    return out;
  }

  private pickAvailable() {
    const avail = this.available();
    if (!avail.length) return;
    let a = avail.find((x) => x.inst === this.instrument);
    if (!a) a = avail.find((x) => x.inst === settings.instrument) ?? avail[0];
    this.instrument = a.inst;
    if (!a.diffs.includes(this.difficulty)) {
      this.difficulty = a.diffs.includes(settings.difficulty) ? settings.difficulty : a.diffs[a.diffs.length - 1];
    }
  }

  private renderDetail(song: SongEntry, error?: string) {
    const chartReady = this.chartFor === song && this.chart !== null;
    const art = h('div', { class: 'art' });
    if (song.albumArt) void this.art(song).then((u) => (art.style.backgroundImage = `url("${u}")`));
    else art.classList.add('none');
    const meta = [song.album, song.year, song.genre].filter(Boolean).join(' · ');
    const parts = h('div', { class: 'parts' });
    const diffs = h('div', { class: 'diffs' });
    if (chartReady) {
      for (const { inst, diffs: ds } of this.available()) {
        const rating = song.diffs[inst];
        parts.append(
          h(
            'button',
            {
              class: `part ${inst === this.instrument ? 'on' : ''}`,
              onclick: () => {
                this.instrument = inst;
                if (!ds.includes(this.difficulty)) this.difficulty = ds[ds.length - 1];
                this.renderDetail(song);
                this.instrumentChanged();
              },
            },
            INSTRUMENT_LABEL[inst],
            rating !== undefined && rating >= 0 ? h('span', { class: 'dots' }, '●'.repeat(Math.min(6, rating)) + '○'.repeat(Math.max(0, 6 - rating))) : null,
          ),
        );
      }
      for (const d of DIFFICULTIES) {
        const track = this.chart!.tracks.get(trackKey(this.instrument, d));
        const best = getBest(scoreKey(song.id, trackKey(this.instrument, d)));
        diffs.append(
          h(
            'button',
            {
              class: `diff ${d === this.difficulty ? 'on' : ''}`,
              disabled: !track,
              onclick: () => {
                this.difficulty = d;
                this.renderDetail(song);
                this.renderRowsForce();
              },
            },
            h('span', { class: 'n' }, DIFF_LABEL[d]),
            h('span', { class: 'c' }, track ? `${track.notes.length} notes` : '—'),
            best ? h('span', { class: 'b' }, starsEl(best.stars), ` ${best.score.toLocaleString('en-US')}${best.fc ? ' · FC' : ''}`) : null,
          ),
        );
      }
    }
    const canPlay = chartReady && this.chart!.tracks.has(trackKey(this.instrument, this.difficulty));
    const stemNote = chartReady && !song.stems[this.instrument === 'guitarcoop' ? 'guitar' : this.instrument] ? h('div', { class: 'note' }, 'No separate instrument audio: misses muffle the whole mix instead of muting your part.') : null;
    replace(
      this.detail,
      art,
      h('div', { class: 'title' }, song.name),
      h('div', { class: 'artist' }, song.artist),
      meta ? h('div', { class: 'meta' }, meta) : null,
      h(
        'div',
        { class: 'facts' },
        song.charter ? h('span', null, `Charter: ${song.charter}`) : null,
        song.lengthMs ? h('span', null, formatTime(song.lengthMs / 1000)) : null,
        song.pack ? h('span', { class: 'pack' }, song.pack) : null,
      ),
      error ? h('div', { class: 'error' }, `Could not read chart: ${error}`) : null,
      chartReady ? parts : h('div', { class: 'loading-chart' }, error ? '' : 'Reading chart…'),
      chartReady ? diffs : null,
      stemNote,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary big', disabled: !canPlay, onclick: () => this.play(false) }, icon('play'), 'Play'),
        h('button', { class: 'btn', disabled: !canPlay, onclick: () => this.practice() }, icon('practice'), 'Practice'),
        h('button', { class: 'btn ghost', disabled: !canPlay, onclick: () => this.play(true) }, icon('bot'), 'Watch bot'),
      ),
    );
  }

  /** The player picked another instrument: difficulty pips and difficulty grouping follow it. */
  private instrumentChanged() {
    if (settings.instrument !== this.instrument) updateSettings({ instrument: this.instrument });
    if (settings.sort === 'difficulty') this.refilter();
    else this.renderRowsForce();
  }

  private renderRowsForce() {
    for (const r of this.rows) delete r.dataset.key;
    this.renderRows();
  }

  // ---------------------------------------------------------------- actions

  private ready(): boolean {
    const song = this.filtered[this.sel];
    return !!song && this.chartFor === song && !!this.chart?.tracks.has(trackKey(this.instrument, this.difficulty));
  }

  private async play(bot: boolean) {
    if (!this.ready()) return;
    updateSettings({ instrument: this.instrument, difficulty: this.difficulty });
    this.preview.cancel();
    const { GameScreen } = await import('./gamescreen.ts');
    this.app.show(new GameScreen(this.app, { song: this.filtered[this.sel], chart: this.chart!, instrument: this.instrument, difficulty: this.difficulty, bot }));
  }

  private async practice() {
    if (!this.ready()) return;
    updateSettings({ instrument: this.instrument, difficulty: this.difficulty });
    const { PracticeModal } = await import('./practice.ts');
    this.app.pushModal(new PracticeModal(this.app, { song: this.filtered[this.sel], chart: this.chart!, instrument: this.instrument, difficulty: this.difficulty }));
  }

  private cycleDifficulty(dir: number) {
    const a = this.available().find((x) => x.inst === this.instrument);
    if (!a) return;
    const i = a.diffs.indexOf(this.difficulty);
    this.difficulty = a.diffs[Math.max(0, Math.min(a.diffs.length - 1, i + dir))];
    this.renderDetail(this.filtered[this.sel]);
    this.renderRowsForce();
  }

  private cycleInstrument() {
    const avail = this.available();
    if (avail.length < 2) return;
    const i = avail.findIndex((x) => x.inst === this.instrument);
    const next = avail[(i + 1) % avail.length];
    this.instrument = next.inst;
    if (!next.diffs.includes(this.difficulty)) this.difficulty = next.diffs[next.diffs.length - 1];
    this.renderDetail(this.filtered[this.sel]);
    this.instrumentChanged();
  }

  nav(a: NavAction): void {
    if (a === 'up') this.select(this.sel - 1);
    else if (a === 'down') this.select(this.sel + 1);
    else if (a === 'confirm') void this.play(false);
    else if (a === 'alt') void this.practice();
    else if (a === 'left') this.cycleDifficulty(-1);
    else if (a === 'right') this.cycleDifficulty(1);
    else if (a === 'start') this.openSettings();
  }

  key(e: KeyboardEvent): boolean {
    const inSearch = document.activeElement === this.search;
    switch (e.key) {
      case 'ArrowUp':
        this.select(this.sel - 1);
        return true;
      case 'ArrowDown':
        this.select(this.sel + 1);
        return true;
      case 'PageUp':
        this.jumpGroup(-1);
        return true;
      case 'PageDown':
        this.jumpGroup(1);
        return true;
      case 'Enter':
        void this.play(false);
        return true;
      case 'Tab':
        this.cycleInstrument();
        return true;
      case 'Escape':
        if (this.genrePanel.isOpen) {
          this.genrePanel.close();
          return true;
        }
        if (this.search.value) {
          this.search.value = '';
          this.refilter();
        }
        this.search.blur();
        this.list.focus({ preventScroll: true });
        return true;
    }
    if (inSearch) return false;
    if (e.key === 'Home') this.select(0);
    else if (e.key === 'End') this.select(this.filtered.length - 1);
    else if (e.key === 'ArrowLeft') this.cycleDifficulty(-1);
    else if (e.key === 'ArrowRight') this.cycleDifficulty(1);
    else if (e.key === 'p' || e.key === 'P') void this.practice();
    else if (e.key === 'b' || e.key === 'B') void this.play(true);
    else if (e.key === 'r' || e.key === 'R') this.random();
    else if (e.key === '/') {
      this.search.focus();
      this.search.select();
    }
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.search.focus();
      return false;
    } else return false;
    return true;
  }
}

/** Difficulty rating as six pips (Clone Hero's 0-6 scale; higher values fill all six). */
function pips(r: number): HTMLSpanElement {
  const n = Math.max(0, Math.min(6, Math.round(r)));
  return h('span', { class: 'pips', title: `Difficulty ${r}` }, '●'.repeat(n) + '○'.repeat(6 - n));
}

function hint(k: string, label: string) {
  return h('span', { class: 'hint' }, h('kbd', null, k), ' ', label);
}

/** Five stars, earned ones lit; six stars (gold) lights all five in gold. */
export function starsEl(stars: number): HTMLSpanElement {
  const full = Math.floor(stars);
  return h('span', { class: `stars-inline ${full >= 6 ? 'gold' : ''}` }, ...Array.from({ length: 5 }, (_, i) => h('span', { class: i < full ? 'on' : '' }, '★')));
}
