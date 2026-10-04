import { PreviewPlayer } from '../../audio/preview.ts';
import type { Chart } from '../../chart/build.ts';
import type { Difficulty, Instrument } from '../../chart/types.ts';
import { DIFFICULTIES, INSTRUMENTS, INSTRUMENT_LABEL, trackKey } from '../../chart/types.ts';
import { chartFor } from '../../game/charts.ts';
import { getBest, PLAYED_WITH_LABEL, scoreKey } from '../../game/scores.ts';
import { getHistory, variantLabel } from '../../game/history.ts';
import { TouchFrets } from '../touchFrets.ts';
import type { NavAction } from '../../input/input.ts';
import type { SongEntry } from '../../library/song.ts';
import { settings, updateSettings } from '../../settings.ts';
import type { Settings, SongView } from '../../settings.ts';
import { formatTime } from '../../util/text.ts';
import type { App, Screen } from '../app.ts';
import { append, h, replace, setText } from '../dom.ts';
import { canFullscreen, toggleFullscreen } from '../fullscreen.ts';
import { logo } from '../logo.ts';
import { SORTS, SORT_DIRECTION, SORT_LABEL, nameKey, sortAndGroup } from '../songlist.ts';
import { GenrePanel, describeGenreFilter } from '../genrePanel.ts';
import { icon } from '../icons.ts';
import { passesGenreFilter } from '../../library/genres.ts';
import { getPlays } from '../../game/plays.ts';
import { isFavourite, toggleFavourite } from '../../game/favourites.ts';
import { moveFocus, navFocus, keyFocus } from '../focusNav.ts';
import type { MenuItem } from '../menu.ts';
import type { Group } from '../songlist.ts';
import { CoverGesture } from '../coverGesture.ts';
import { chartIssues, knownIssues, rememberIssues, worstLevel } from '../../chart/issues.ts';
import type { ChartIssue } from '../../chart/issues.ts';
import { hideSong } from '../../library/hidden.ts';
import { findDuplicates } from '../songlist.ts';
import { BuiltinSource } from '../../starter/source.ts';

const ROW_H = 56;
const HEADER_H = 44;
/** covers kept in the DOM either side of the selected one */
const COVER_SPAN = 8;
/** Short enough to feel instant, long enough not to start a preview for every song while scrolling. */
const PREVIEW_DELAY_MS = 160;

/** The search and the selected song outlive the screen, so coming back from a song keeps both. */
const kept = { query: '', songId: '', dupesOnly: false };
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
  private readonly sortValue: HTMLSpanElement;
  private readonly sortSelect: HTMLSelectElement;
  private readonly favBtn: HTMLButtonElement;
  private readonly dupBtn: HTMLButtonElement;
  /** songs in the library more than once: id -> every copy */
  private dupes = new Map<string, SongEntry[]>();
  private readonly genreBtn: HTMLButtonElement;
  private readonly viewBtns: Record<SongView, HTMLButtonElement>;
  private readonly footer: HTMLElement;
  private readonly covers: HTMLDivElement;
  private readonly coverLabel: HTMLDivElement;
  private readonly coverStage: HTMLDivElement;
  private readonly coverGesture: CoverGesture;
  private readonly coverInfo: HTMLDivElement;
  private readonly scrubTicks: HTMLDivElement;
  private readonly scrubPos: HTMLDivElement;
  private readonly coverEls = new Map<number, HTMLDivElement>();
  private ticks: { label: string; idx: number }[] = [];
  private view: SongView = settings.songView;
  private readonly genrePanel: GenrePanel;
  private chart: Chart | null = null;
  private chartFor: SongEntry | null = null;
  private instrument: Instrument = initialInstrument();
  private difficulty: Difficulty = settings.difficulty;
  private detailTimer = 0;
  private previewTimer = 0;
  private artUrls = new Map<string, Promise<string>>();

  constructor(app: App) {
    this.app = app;
    this.preview = new PreviewPlayer(app.library);
    this.search = h('input', { class: 'search', type: 'search', placeholder: 'Search songs, artists, charters…', spellcheck: false });
    this.search.value = kept.query;
    this.search.addEventListener('input', () => {
      kept.query = this.search.value;
      this.refilter();
    });
    const sort = h(
      'select',
      { title: 'Sort and group by', 'aria-label': 'Sort by' },
      ...SORTS.map((k) => h('option', { value: k, selected: settings.sort === k }, `By ${SORT_LABEL[k].toLowerCase()}`)),
    );
    sort.addEventListener('change', () => {
      updateSettings({ sort: sort.value as Settings['sort'], sortReverse: false });
      this.updateSortButton();
      this.refilter();
    });
    this.sortSelect = sort;
    this.favBtn = h('button', { class: 'ctl-btn fav-btn', title: 'Show only favourite songs', onclick: () => this.toggleFavouritesOnly() }, '★ Favourites');
    this.favBtn.classList.toggle('on', settings.favouritesOnly);
    this.sortValue = h('span', { class: 'v' });
    this.sortDir = h('button', {
      class: 'ctl-btn',
      onclick: () => {
        updateSettings({ sortReverse: !settings.sortReverse });
        this.updateSortButton();
        this.refilter();
      },
    });
    this.genreBtn = h('button', { class: 'ctl-btn genre-btn', onclick: () => this.toggleGenres() });
    this.genrePanel = new GenrePanel(settings.genreFilter, (f) => {
      updateSettings({ genreFilter: f });
      this.updateGenreButton();
      this.refilter();
    });
    this.updateSortButton();
    this.updateGenreButton();
    this.count = h('span', { class: 'count' });
    this.dupBtn = h('button', { class: 'ctl-btn dup-btn', title: 'Show only songs that are in the library more than once', onclick: () => this.toggleDuplicates() });
    this.dupes = findDuplicates(app.library.songs);
    this.updateDupButton();
    this.spacer = h('div', { class: 'spacer' });
    this.list = h('div', { class: 'song-list', tabindex: '-1' }, this.spacer);
    this.list.addEventListener('scroll', () => this.renderRows());
    this.sticky = h('div', { class: 'group-sticky' });
    this.sticky.addEventListener('click', () => this.jumpGroup(0));
    this.detail = h('div', { class: 'song-detail' });
    this.viewBtns = {
      list: h('button', { class: 'seg', onclick: () => this.setView('list') }, 'List'),
      covers: h('button', { class: 'seg', onclick: () => this.setView('covers') }, 'Covers'),
    };
    this.coverLabel = h('div', { class: 'covers-label' });
    this.coverStage = h('div', { class: 'cover-stage' });
    this.coverGesture = new CoverGesture(this.coverStage, {
      count: () => this.filtered.length,
      selected: () => this.sel,
      change: position => { this.select(Math.round(position), false, true); this.renderCovers(position); },
    });
    this.coverInfo = h('div', { class: 'covers-info' });
    this.scrubTicks = h('div', { class: 'ticks' });
    this.scrubPos = h('div', { class: 'pos' });
    const scrubber = h('div', { class: 'scrubber', title: 'Jump to a letter' }, this.scrubTicks, h('div', { class: 'rail' }), this.scrubPos);
    this.bindScrubber(scrubber);
    this.covers = h('div', { class: 'covers', onwheel: (e: WheelEvent) => this.coverWheel(e) }, this.coverLabel, this.coverStage, this.coverInfo, scrubber);
    this.footer = h('footer', { class: 'hints' });
    const more = h('button', {
      class: 'btn mobile-library-toggle', 'aria-expanded': 'false', 'aria-controls': 'library-options',
      onclick: () => {
        const open = more.getAttribute('aria-expanded') !== 'true';
        more.setAttribute('aria-expanded', String(open));
        this.el.querySelector('.topbar')!.classList.toggle('expanded', open);
      },
    }, icon('settings'), 'Browse');
    const lib = app.library;
    this.el = h(
      'div',
      { class: 'screen select-screen', 'data-view': this.view },
      h(
        'header',
        { class: 'topbar' },
        logo('small'),
        h('div', { class: 'search-box' }, this.search, h('kbd', null, '/')),
        h('div', { class: 'segmented view-toggle', role: 'group', 'aria-label': 'View' }, this.viewBtns.list, this.viewBtns.covers),
        more,
        h('div', { class: 'library-options', id: 'library-options' },
          h(
            'div',
            { class: 'ctl-group' },
            h('span', { class: 'ctl' }, 'Sort', this.sortValue, sort),
            this.sortDir,
            h('span', { class: 'ctl genre-anchor' }, 'Genre', this.genreBtn),
            this.favBtn,
          ),
          this.count,
          this.dupBtn,
          h('div', { class: 'grow' }),
          h(
            'div',
            { class: 'tools' },
            h('button', { class: 'btn ghost icon', title: 'Random song (R)', 'aria-label': 'Random song', onclick: () => this.random() }, icon('shuffle')),
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
          ),
        ),
        h('button', { class: 'btn toolbar-settings', onclick: () => this.openSettings() }, icon('settings'), 'Settings'),
      ),
      h('main', { class: 'select-main' }, h('div', { class: 'list-wrap' }, this.list, this.sticky), this.detail, this.covers),
      this.footer,
    );
    this.applyView();
    this.refilter();
  }

  /** The library changed underneath (e.g. built-in songs shown or hidden, a song hidden or deleted). */
  refresh(): void {
    this.dupes = findDuplicates(this.app.library.songs);
    if (!this.dupes.size) kept.dupesOnly = false;
    this.updateDupButton();
    this.refilter();
  }

  /** Select a song by id (clearing filters that hide it), e.g. from the library check. */
  focusSong(id: string): void {
    let i = this.filtered.findIndex((x) => x.id === id);
    if (i < 0) {
      this.search.value = kept.query = '';
      kept.dupesOnly = false;
      this.updateDupButton();
      if (settings.favouritesOnly) this.toggleFavouritesOnly();
      else this.refilter();
      i = this.filtered.findIndex((x) => x.id === id);
    }
    if (i < 0) {
      this.app.toast('That song is filtered out by the genre filter.');
      return;
    }
    this.select(i);
    if (this.view === 'list') this.list.scrollTop = this.itemTop[this.songItem[this.sel]] - this.list.clientHeight / 2 + ROW_H / 2;
  }

  /** Show only the songs that are in the library more than once. */
  showDuplicates(): void {
    if (!kept.dupesOnly) this.toggleDuplicates();
  }

  private toggleDuplicates() {
    kept.dupesOnly = !kept.dupesOnly && this.dupes.size > 0;
    this.updateDupButton();
    this.refilter();
    if (kept.dupesOnly) this.app.toast('Showing songs that are in the library more than once. Del removes the selected copy.');
  }

  private updateDupButton() {
    const n = this.dupes.size;
    this.dupBtn.hidden = n === 0;
    setText(this.dupBtn, kept.dupesOnly ? `${n} duplicates ✕` : `${n} duplicates`);
    this.dupBtn.classList.toggle('on', kept.dupesOnly);
  }

  /** Stop the preview while the tab is in the background; pick it back up on return. */
  private onVisibility = () => {
    if (document.hidden) { this.preview.cancel(); this.coverGesture.stop(); }
    else {
      this.renderCovers();
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
    this.coverGesture.destroy();
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
    this.coverGesture.stop();
    const q = this.search.value.trim().toLowerCase();
    const current = this.filtered[this.sel] ?? this.app.library.songs.find((x) => x.id === kept.songId);
    const terms = q.split(/\s+/).filter(Boolean);
    const gf = settings.genreFilter;
    const matching = this.app.library.songs.filter((s) => {
      if (!passesGenreFilter(s.genre, gf)) return false;
      if (settings.favouritesOnly && !isFavourite(s.id)) return false;
      if (kept.dupesOnly && !this.dupes.has(s.id)) return false;
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
    this.buildScrubber();
    const idx = current ? songs.indexOf(current) : -1;
    this.select(idx >= 0 ? idx : 0, true);
  }

  private updateSortButton() {
    const [natural, reversed] = SORT_DIRECTION[settings.sort];
    const label = settings.sortReverse ? reversed : natural;
    setText(this.sortValue, SORT_LABEL[settings.sort]);
    setText(this.sortDir, label.replace(/ → /g, '→'));
    this.sortDir.title = `${label} (click to reverse)`;
    this.sortDir.setAttribute('aria-label', `Sort direction: ${label}`);
  }

  private updateGenreButton() {
    const f = settings.genreFilter;
    setText(this.genreBtn, f.items.length ? describeGenreFilter(f) : 'All');
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
    if (this.view === 'covers') return;
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
      const key = it >= 0 ? `s:${this.filtered[it].id}:${isFavourite(this.filtered[it].id) ? 1 : 0}:${problemLevel(this.filtered[it].id) ?? ''}` : `g:${it}:${this.groups[-it - 1].label}`;
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
        h('span', { class: 'idx' }, String(it + 1).padStart(2, '0')),
        art,
        h('div', { class: 'meta' }, h('div', { class: 'title' }, s.name, isFavourite(s.id) ? h('span', { class: 'fav', title: 'Favourite' }, '★') : null, problemBadge(s.id)), h('div', { class: 'artist' }, sub)),
        h('div', { class: 'side' }, best ? starsEl(best.stars) : null, best?.fc ? h('span', { class: 'fc' }, 'FC') : null, rating !== undefined && rating >= 0 && settings.sort !== 'difficulty' ? pips(rating) : null),
        h('div', { class: 'len' }, s.lengthMs ? formatTime(s.lengthMs / 1000) : ''),
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
    if (this.view === 'covers') return;
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

  private select(i: number, force = false, fromGesture = false) {
    const moving = this.coverGesture.position !== undefined;
    if (!fromGesture) this.coverGesture.stop();
    if (!this.filtered.length) {
      this.detail.replaceChildren(h('div', { class: 'empty' }, 'No songs match.'));
      this.coverInfo.replaceChildren(h('div', { class: 'empty' }, 'No songs match.'));
      this.coverLabel.textContent = '';
      this.coverStage.replaceChildren();
      this.coverEls.clear();
      this.renderRows();
      return;
    }
    i = Math.max(0, Math.min(this.filtered.length - 1, i));
    if (i === this.sel && !force) {
      if (moving && !fromGesture) this.renderCovers();
      return;
    }
    this.sel = i;
    kept.songId = this.filtered[i].id;
    this.renderRows();
    this.scrollToSel();
    this.renderCovers();
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
    if (this.view === 'covers') return;
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
      const before = problemLevel(song.id);
      rememberIssues(song.id, chartIssues(chart, song));
      if (problemLevel(song.id) !== before) this.renderRowsForce();
      if (this.filtered[this.sel] !== song) return;
      this.chart = chart;
      this.chartFor = song;
      this.pickAvailable();
      this.renderDetail(song);
    } catch (err) {
      rememberIssues(song.id, [{ level: 'error', code: 'unreadable', text: `The chart could not be read: ${(err as Error).message}` }]);
      this.renderRowsForce();
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
    if (this.view === 'covers') this.renderCoverInfo(song, error);
    else this.renderHero(song, error);
  }

  private renderHero(song: SongEntry, error?: string) {
    const chartReady = this.chartFor === song && this.chart !== null;
    const art = h('div', { class: 'art' });
    if (song.albumArt) void this.art(song).then((u) => (art.style.backgroundImage = `url("${u}")`));
    else art.classList.add('none');
    const fact = (label: string, value: string, dim = false) => (value ? [h('span', { class: 'label' }, label), h('span', { class: `val${dim ? ' dim' : ''}` }, value)] : []);
    const parts = h('div', { class: 'parts' });
    const diffs = h('div', { class: 'diffs' });
    if (chartReady) {
      const avail = this.available();
      for (const { inst, diffs: ds } of avail) {
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
            rating !== undefined && rating >= 0 ? h('span', { class: 'd' }, `D${rating}`) : null,
          ),
        );
      }
      if (avail.length > 1) parts.append(h('span', { class: 'grow' }), h('span', { class: 'tip' }, 'Tab to switch'));
      for (const d of DIFFICULTIES) {
        // Note counts come from the raw chart: browsing never builds a track.
        const count = this.chart!.noteCount(trackKey(this.instrument, d));
        const best = getBest(scoreKey(song.id, trackKey(this.instrument, d)));
        diffs.append(
          h(
            'button',
            {
              class: `diff ${d === this.difficulty ? 'on' : ''}`,
              disabled: !count,
              onclick: () => {
                this.difficulty = d;
                this.renderDetail(song);
                this.renderRowsForce();
              },
            },
            h('span', { class: 'n' }, DIFF_LABEL[d]),
            h('span', { class: 'c' }, count ? `${count.toLocaleString('en-US')} notes` : '—'),
            h('span', { class: 'b' }, ...(best ? [starsEl(best.stars), ` ${best.score.toLocaleString('en-US')}${best.fc ? ' · FC' : ''}${best.input ? ` · ${PLAYED_WITH_LABEL[best.input]}` : ''}`] : [])),
          ),
        );
      }
    }
    const canPlay = chartReady && this.chart!.tracks.has(trackKey(this.instrument, this.difficulty));
    const stemNote = chartReady && !song.stems[this.instrument === 'guitarcoop' || this.instrument === 'touch' ? 'guitar' : this.instrument] ? h('div', { class: 'note' }, 'No separate instrument audio: misses muffle the whole mix instead of muting your part.') : null;
    replace(
      this.detail,
      h(
        'div',
        { class: 'hero-top' },
        art,
        h(
          'div',
          { class: 'facts' },
          ...fact('Album', song.album),
          ...fact('Year', song.year),
          ...fact('Genre', song.genre),
          ...fact('Length', song.lengthMs ? formatTime(song.lengthMs / 1000) : ''),
          ...fact('Charter', song.charter),
          ...fact('Folder', song.pack, true),
        ),
      ),
      h('div', { class: 'title', 'data-len': song.name.length > 32 ? 'l' : song.name.length > 18 ? 'm' : 's' }, song.name),
      h('div', { class: 'artist' }, song.artist),
      error ? h('div', { class: 'error' }, `Could not read chart: ${error}`) : null,
      chartReady ? issueList(knownIssues(song.id) ?? []) : null,
      this.copiesNote(song),
      chartReady ? parts : h('div', { class: 'loading-chart' }, error ? '' : 'Reading chart…'),
      chartReady ? diffs : null,
      chartReady ? historyNote(scoreKey(song.id, trackKey(this.instrument, this.difficulty))) : null,
      stemNote,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary big', disabled: !canPlay, onclick: () => this.play(false) }, icon('play'), 'Play', speedTag()),
        h('button', { class: 'btn', disabled: !canPlay, onclick: () => this.practice() }, 'Practice', h('kbd', null, 'P')),
        h('button', { class: 'btn ghost', disabled: !canPlay, onclick: () => this.play(true) }, 'Watch bot', h('kbd', null, 'B')),
        this.favToggle(song),
        h('button', { class: 'btn ghost icon remove-btn', title: 'Hide or delete this song (Del)', 'aria-label': 'Hide or delete this song', onclick: () => this.removeSong() }, '✕'),
        h('button', { class: 'btn mobile-song-options', onclick: () => this.openOptions() }, 'More'),
      ),
    );
  }

  // ---------------------------------------------------------------- covers

  private setView(v: SongView) {
    this.coverGesture.stop();
    if (v === this.view) return;
    this.view = v;
    updateSettings({ songView: v });
    this.applyView();
    const song = this.filtered[this.sel];
    if (v === 'covers') this.renderCovers();
    else {
      this.renderRowsForce();
      this.scrollToSel();
    }
    if (song) this.renderDetail(song);
    (v === 'list' ? this.list : this.el).focus({ preventScroll: true });
  }

  private applyView() {
    this.el.dataset.view = this.view;
    for (const [k, b] of Object.entries(this.viewBtns)) b.classList.toggle('on', k === this.view);
    const hints =
      this.view === 'list'
        ? [
            hint('↑↓', 'browse'),
            hint('PgUp/PgDn', 'group'),
            hint('Enter', 'play', 'g'),
            hint('P', 'practice', 'y'),
            hint('←→', 'difficulty', 'bo'),
            hint('Tab', 'instrument'),
            hint('R', 'random'),
            hint('V', 'list / covers'),
            hint('*', 'favourite'),
            hint('Del', 'hide / delete'),
            hint('Space', 'options', 'p'),
          ]
        : [
            hint('←→ / wheel', 'browse'),
            hint('PgUp/PgDn', 'group'),
            hint('Enter', 'play', 'g'),
            hint('P', 'practice', 'y'),
            hint('[ ]', 'difficulty', 'bo'),
            hint('V', 'list / covers'),
            hint('Tab', 'instrument'),
            hint('R', 'random'),
            hint('*', 'favourite'),
            hint('Space', 'options', 'p'),
          ];
    replace(this.footer, ...hints, h('span', { class: 'grow' }), hint('Shift+F', 'fullscreen'));
  }

  private wheelAcc = 0;

  /**
   * Mouse wheel and trackpad move through the covers: one cover per wheel notch, one per 40 px of
   * trackpad travel. Either axis works, so a horizontal swipe does too.
   */
  private coverWheel(e: WheelEvent) {
    if (e.ctrlKey) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    let steps: number;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) steps = Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 3));
    else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) steps = Math.sign(d) * COVER_SPAN;
    else if (Math.abs(d) >= 50 && Number.isInteger(d)) {
      // A wheel notch: browsers report ~100 px, more when the wheel spins fast.
      steps = Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 100));
      this.wheelAcc = 0;
    } else {
      this.wheelAcc += d;
      steps = Math.trunc(this.wheelAcc / 40);
      this.wheelAcc -= steps * 40;
    }
    if (steps) this.select(this.sel + steps);
  }

  /** Cover flow: the selected cover faces forward, the ones around it fan out behind. */
  private renderCovers(position = this.coverGesture.position ?? this.sel) {
    if (this.view !== 'covers' || !this.filtered.length) return;
    const lo = Math.max(0, this.sel - COVER_SPAN);
    const hi = Math.min(this.filtered.length - 1, this.sel + COVER_SPAN);
    for (const [i, el] of this.coverEls) {
      if (i < lo || i > hi || el.dataset.songId !== this.filtered[i].id) {
        el.remove();
        this.coverEls.delete(i);
      }
    }
    for (let i = lo; i <= hi; i++) {
      let el = this.coverEls.get(i);
      const song = this.filtered[i];
      if (!el) {
        el = h('div', { class: 'cover' });
        el.dataset.songId = song.id;
        const idx = i;
        el.addEventListener('click', () => (idx === this.sel ? void this.play(false) : this.select(idx)));
        if (song.albumArt) {
          const target = el;
          void this.art(song).then((u) => (target.style.backgroundImage = `url("${u}")`));
        } else {
          el.classList.add('none');
          el.append(h('span', { class: 'cap' }, [song.album, song.name].filter(Boolean).join(' · ')));
        }
        // Newly created covers start where their neighbour is, so they slide in rather than pop.
        this.coverStage.append(el);
        this.coverEls.set(i, el);
      }
      const d = i - position;
      el.style.setProperty('--s', String(Math.sign(d)));
      el.style.setProperty('--a', String(Math.abs(d)));
      el.style.setProperty('--near', String(Math.min(1, Math.abs(d))));
      el.style.setProperty('--beyond', String(Math.max(0, Math.abs(d) - 1)));
      el.style.zIndex = String(20 - Math.round(Math.abs(d)));
      el.classList.toggle('center', i === this.sel);
      el.classList.toggle('far', Math.abs(d) >= 3);
    }
    const g = this.groups[this.groupOfSong(this.sel)];
    setText(this.coverLabel, g ? `${g.label} · ${this.sel - g.start + 1} of ${g.count}` : '');
    this.updateScrubber();
  }

  private renderCoverInfo(song: SongEntry, error?: string) {
    const chartReady = this.chartFor === song && this.chart !== null;
    const meta = [song.artist, song.album, song.year, song.lengthMs ? formatTime(song.lengthMs / 1000) : ''].filter(Boolean).join(' · ');
    const controls = h('div', { class: 'covers-controls' });
    const problem = (knownIssues(song.id) ?? []).find((i) => i.level !== 'info');
    if (error) controls.append(h('span', { class: 'error' }, `Could not read chart: ${error}`));
    else if (!chartReady) controls.append(h('span', { class: 'dim mono' }, 'Reading chart…'));
    else if (problem?.level === 'error') controls.append(h('span', { class: 'error' }, problem.text));
    else {
      const a = this.available().find((x) => x.inst === this.instrument);
      const diffs = a?.diffs ?? [];
      const i = diffs.indexOf(this.difficulty);
      const prev = diffs[i - 1];
      const next = diffs[i + 1];
      const best = getBest(scoreKey(song.id, trackKey(this.instrument, this.difficulty)));
      const go = (d: Difficulty) => {
        this.difficulty = d;
        this.renderDetail(song);
        this.renderRowsForce();
      };
      const canPlay = this.chart!.tracks.has(trackKey(this.instrument, this.difficulty));
      append(
        controls,
        h(
          'span',
          { class: 'diff-pick' },
          prev ? h('button', { onclick: () => go(prev), title: 'Easier (blue)' }, h('i', { class: 'dot', style: 'background:var(--blue)' }), DIFF_LABEL[prev]) : null,
          h('span', { class: 'cur' }, `${INSTRUMENT_LABEL[this.instrument]} · ${DIFF_LABEL[this.difficulty]}`),
          next ? h('button', { onclick: () => go(next), title: 'Harder (orange)' }, h('i', { class: 'dot', style: 'background:var(--orange)' }), DIFF_LABEL[next]) : null,
        ),
        best ? h('span', { class: 'best' }, starsEl(best.stars), best.score.toLocaleString('en-US'), best.fc ? h('span', { class: 'fc' }, 'FC') : null, best.input ? h('span', { class: 'with', title: `Played with ${PLAYED_WITH_LABEL[best.input].toLowerCase()}` }, PLAYED_WITH_LABEL[best.input]) : null) : null,
        h('button', { class: 'btn primary', disabled: !canPlay, onclick: () => this.play(false) }, h('i', { class: 'dot ring' }), 'Play', speedTag()),
        h('button', { class: 'btn', disabled: !canPlay, onclick: () => this.practice() }, h('i', { class: 'dot sq' }), 'Practice'),
      );
    }
    controls.append(this.favToggle(song));
    replace(
      this.coverInfo,
      h('div', { class: 'title' }, song.name, isFavourite(song.id) ? h('span', { class: 'fav' }, '★') : null, problemBadge(song.id)),
      h('div', { class: 'sub' }, meta),
      chartReady && problem?.level === 'warn' ? h('div', { class: 'sub warn' }, problem.text) : null,
      controls,
    );
  }

  /** Tick labels along the bottom: the first letter of each run (A–Z), or the group labels for other sorts. */
  private buildScrubber() {
    const ticks: { label: string; idx: number }[] = [];
    const alpha = ['artist', 'name', 'charter', 'pack', 'genre'].includes(settings.sort);
    if (alpha) {
      const field = (s: SongEntry) => (settings.sort === 'artist' ? s.artist : settings.sort === 'name' ? s.name : settings.sort === 'charter' ? s.charter : settings.sort === 'pack' ? s.pack : s.genre);
      let last = '';
      this.filtered.forEach((s, i) => {
        const c = nameKey(field(s)).charAt(0).toUpperCase();
        const l = /[A-Z]/.test(c) ? c : '#';
        if (l !== last) {
          ticks.push({ label: l, idx: i });
          last = l;
        }
      });
    } else {
      const step = Math.max(1, Math.ceil(this.groups.length / 14));
      this.groups.forEach((g, gi) => {
        if (gi % step === 0) ticks.push({ label: g.label.length > 8 ? `${g.label.slice(0, 7)}…` : g.label, idx: g.start });
      });
    }
    this.ticks = ticks;
    replace(this.scrubTicks, ...ticks.map((t) => h('span', null, t.label)));
  }

  private updateScrubber() {
    const t = this.ticks;
    if (!t.length) return;
    let k = 0;
    while (k + 1 < t.length && t[k + 1].idx <= this.sel) k++;
    const next = t[k + 1];
    const frac = next ? (this.sel - t[k].idx) / Math.max(1, next.idx - t[k].idx) : 0;
    const pos = t.length > 1 ? (k + frac * 0.999) / (t.length - 1) : 0;
    this.scrubPos.style.left = `${Math.min(1, pos) * 100}%`;
    let i = 0;
    for (const el of this.scrubTicks.children) el.classList.toggle('cur', i++ === k);
  }

  private bindScrubber(el: HTMLElement) {
    const jump = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
      const k = Math.round(f * (this.ticks.length - 1));
      const tick = this.ticks[k];
      if (tick) this.select(tick.idx);
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      jump(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (el.hasPointerCapture(e.pointerId)) jump(e);
    });
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
    this.app.show(new GameScreen(this.app, { song: this.filtered[this.sel], chart: this.chart!, instrument: this.instrument, difficulty: this.difficulty, bot, speed: settings.songSpeed }));
  }

  private async practice() {
    if (!this.ready()) return;
    updateSettings({ instrument: this.instrument, difficulty: this.difficulty });
    const { PracticeModal } = await import('./practice.ts');
    this.app.pushModal(new PracticeModal(this.app, { song: this.filtered[this.sel], chart: this.chart!, instrument: this.instrument, difficulty: this.difficulty }));
  }

  /** Song speed in 5% steps, 50% to 150%, like Clone Hero's song speed. */
  private changeSpeed(dir: number) {
    const next = Math.round(Math.min(1.5, Math.max(0.5, settings.songSpeed + dir * 0.05)) * 100) / 100;
    if (next === settings.songSpeed) return;
    updateSettings({ songSpeed: next });
    const song = this.filtered[this.sel];
    if (song) this.renderDetail(song);
    this.app.toast(`Song speed ${Math.round(next * 100)}%${next < 1 ? ': scores below 100% are not kept as bests' : ''}`);
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

  // ---------------------------------------------------------------- hiding and deleting

  /** "Also in": the other copies of this song, when it is in the library more than once. */
  private copiesNote(song: SongEntry): HTMLElement | null {
    const copies = this.dupes.get(song.id);
    if (!copies) return null;
    const others = copies.filter((c) => c !== song).map((c) => [c.path || 'library root', c.charter && `charted by ${c.charter}`].filter(Boolean).join(', '));
    return h('div', { class: 'note dup-note' }, `Also in the library ${others.length === 1 ? 'once more' : `${others.length} more times`}: ${others.join(' · ')}.`);
  }

  /** Hide the selected song from the list, or delete its folder from disk (asks first). */
  private removeSong() {
    const song = this.filtered[this.sel];
    if (!song) return;
    const lib = this.app.library;
    const builtin = BuiltinSource.isBuiltin(song.path);
    const copies = this.dupes.get(song.id)?.length ?? 0;
    const items: MenuItem[] = [
      { label: 'Hide from the song list', action: () => this.hide(song) },
      ...(lib.canDelete(song) ? [{ label: 'Delete its folder from disk…', action: () => this.confirmDelete(song) }] : []),
      { label: 'Cancel', action: () => {} },
    ];
    const lines = [
      builtin ? 'A built-in song. Settings › Data › Built-in songs hides all of them.' : `Folder: ${song.path || lib.source?.label || '(library root)'}`,
      copies ? `This song is in the library ${copies} times.` : null,
      'Hidden songs stay on disk; Settings › Data shows them again.',
    ];
    void import('./choice.ts').then(({ ChoiceModal }) => this.app.pushModal(new ChoiceModal(this.app, `Remove “${song.name}”`, lines, items)));
  }

  private hide(song: SongEntry) {
    hideSong(song.id);
    this.app.toast(`${song.name} hidden. Settings › Data shows hidden songs again.`);
    void this.app.library.index().then(() => this.removed(song));
  }

  private confirmDelete(song: SongEntry) {
    const items: MenuItem[] = [
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
          this.app.toast(`${song.name} deleted from disk`);
          this.removed(song);
        },
      },
    ];
    const lines = [`The folder “${song.path}” and everything in it will be deleted from your disk. This cannot be undone.`];
    void import('./choice.ts').then(({ ChoiceModal }) => this.app.pushModal(new ChoiceModal(this.app, `Delete “${song.name}”?`, lines, items)));
  }

  /** A song left the library: select its neighbour and redraw. */
  private removed(song: SongEntry) {
    const i = this.filtered.indexOf(song);
    if (i >= 0) {
      this.filtered.splice(i, 1);
      this.sel = Math.max(0, Math.min(i, this.filtered.length - 1));
    }
    if (this.chartFor === song) {
      this.chart = null;
      this.chartFor = null;
    }
    this.refresh();
  }

  // ---------------------------------------------------------------- favourites and options

  private toggleFav() {
    const song = this.filtered[this.sel];
    if (!song) return;
    const on = toggleFavourite(song.id);
    this.app.toast(on ? `★ ${song.name} added to favourites` : `${song.name} removed from favourites`);
    if (!on && settings.favouritesOnly) {
      this.refilter();
      return;
    }
    this.renderRowsForce();
    this.renderDetail(song);
  }

  private favToggle(song: SongEntry): HTMLButtonElement {
    const on = isFavourite(song.id);
    return h('button', { class: `btn ghost fav-toggle${on ? ' on' : ''}`, title: on ? 'Remove from favourites (*)' : 'Add to favourites (*)', 'aria-pressed': String(on), onclick: () => this.toggleFav() }, on ? '★' : '☆', ' Favourite');
  }

  private toggleFavouritesOnly() {
    updateSettings({ favouritesOnly: !settings.favouritesOnly });
    this.favBtn.classList.toggle('on', settings.favouritesOnly);
    this.refilter();
  }

  private cycleSort(dir: number) {
    const i = SORTS.indexOf(settings.sort);
    const next = SORTS[(i + dir + SORTS.length) % SORTS.length];
    this.sortSelect.value = next;
    updateSettings({ sort: next, sortReverse: false });
    this.updateSortButton();
    this.refilter();
  }

  private openGenres() {
    this.genrePanel.open(this.genreBtn, this.app.library.songs);
    moveFocus(this.genrePanel.el, 1);
  }

  /** The song options menu: guitar select button or Space. */
  private openOptions() {
    const song = this.filtered[this.sel];
    void import('./songOptions.ts').then(({ SongOptions }) => this.app.pushModal(new SongOptions(this.app, song ? `${song.name} · ${song.artist}` : 'Songs', () => this.optionItems())));
  }

  private optionItems(): MenuItem[] {
    const song = this.filtered[this.sel];
    const ready = this.ready();
    const none = () => {};
    const [natural, reversed] = SORT_DIRECTION[settings.sort];
    const items: MenuItem[] = [];
    if (ready) {
      items.push({ label: 'Play', action: () => void this.play(false) }, { label: 'Practice', action: () => void this.practice() }, { label: 'Watch the bot', action: () => void this.play(true) });
    }
    if (song) items.push({ label: isFavourite(song.id) ? '★ Remove from favourites' : '☆ Add to favourites', action: none, adjust: () => this.toggleFav() });
    if (song) items.push({ label: 'Hide or delete this song…', action: () => this.removeSong() });
    if (this.available().length > 1) items.push({ label: `Instrument: ${INSTRUMENT_LABEL[this.instrument]}`, action: none, adjust: () => this.cycleInstrument() });
    if (ready) items.push({ label: `Difficulty: ${DIFF_LABEL[this.difficulty]}`, action: none, adjust: (d) => this.cycleDifficulty(d) });
    items.push({ label: `Song speed: ${Math.round(settings.songSpeed * 100)}%${settings.songSpeed < 1 ? ' (no best scores)' : ''}`, action: none, adjust: (d) => this.changeSpeed(d) });
    items.push(
      { label: `Sort: ${SORT_LABEL[settings.sort]}`, action: none, adjust: (d) => this.cycleSort(d) },
      { label: `Order: ${settings.sortReverse ? reversed : natural}`, action: none, adjust: () => this.sortDir.click() },
      { label: `Showing: ${settings.favouritesOnly ? 'favourites only' : 'all songs'}`, action: none, adjust: () => this.toggleFavouritesOnly() },
      { label: `Genres: ${describeGenreFilter(settings.genreFilter)}…`, action: () => this.openGenres() },
      ...(this.dupes.size ? [{ label: `Duplicates only: ${kept.dupesOnly ? 'on' : 'off'} (${this.dupes.size} songs)`, action: none, adjust: () => this.toggleDuplicates() }] : []),
      { label: `View: ${this.view === 'list' ? 'list' : 'covers'}`, action: none, adjust: () => this.setView(this.view === 'list' ? 'covers' : 'list') },
      { label: 'Random song', action: () => this.random() },
      { label: 'Search…', action: () => this.search.focus() },
      {
        label: 'Choose charts folder…',
        action: () =>
          void import('../../library/library.ts').then(async ({ Library }) => {
            const src = await Library.pickAny();
            if (src) await this.app.openLibrary(src, true);
          }),
      },
      { label: 'Check library for problems…', action: () => void import('./libraryCheck.ts').then(({ LibraryCheck }) => this.app.pushModal(new LibraryCheck(this.app))) },
      { label: 'Settings', action: () => this.openSettings() },
    );
    return items;
  }

  nav(a: NavAction): void {
    if (this.genrePanel.isOpen) {
      if (a === 'back' || a === 'menu' || a === 'start') this.genrePanel.close();
      else navFocus(this.genrePanel.el, a);
      return;
    }
    if (a === 'menu') this.openOptions();
    else if (a === 'up') this.select(this.sel - 1);
    else if (a === 'down') this.select(this.sel + 1);
    else if (a === 'confirm') void this.play(false);
    else if (a === 'alt') void this.practice();
    else if (a === 'left') this.cycleDifficulty(-1);
    else if (a === 'right') this.cycleDifficulty(1);
    else if (a === 'start') this.openSettings();
  }

  key(e: KeyboardEvent): boolean {
    const inSearch = document.activeElement === this.search;
    const covers = this.view === 'covers';
    if (this.genrePanel.isOpen && e.key !== 'Escape') return keyFocus(this.genrePanel.el, e);
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
          this.search.value = kept.query = '';
          this.refilter();
        }
        this.search.blur();
        this.list.focus({ preventScroll: true });
        return true;
    }
    if (inSearch) return false;
    if (e.key === 'Home') this.select(0);
    else if (e.key === 'End') this.select(this.filtered.length - 1);
    else if (e.key === 'ArrowLeft') covers ? this.select(this.sel - 1) : this.cycleDifficulty(-1);
    else if (e.key === 'ArrowRight') covers ? this.select(this.sel + 1) : this.cycleDifficulty(1);
    else if (e.key === '[') this.cycleDifficulty(-1);
    else if (e.key === ']') this.cycleDifficulty(1);
    else if (e.key === 'v' || e.key === 'V') this.setView(covers ? 'list' : 'covers');
    else if (e.key === 'p' || e.key === 'P') void this.practice();
    else if (e.key === 'b' || e.key === 'B') void this.play(true);
    else if (e.key === 'r' || e.key === 'R') this.random();
    else if (e.key === ' ') this.openOptions();
    else if (e.key === '*') this.toggleFav();
    else if (e.key === 'Delete') this.removeSong();
    else if (e.key === '-' || e.key === '_') this.changeSpeed(-1);
    else if (e.key === '=' || e.key === '+') this.changeSpeed(1);
    else if (e.key === '/') {
      this.search.focus();
      this.search.select();
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.search.focus();
      return false;
    } else return false;
    return true;
  }
}

/** Runs of the selected part so far, and its bests at other speeds and modifiers. */
function historyNote(key: string): HTMLElement | null {
  const hist = getHistory(key);
  if (!hist?.runs.length) return null;
  const last = hist.runs[hist.runs.length - 1];
  const others = Object.entries(hist.bests)
    .filter(([v]) => v !== '100')
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([v, r]) => `${variantLabel(v)} ${r.score.toLocaleString('en-US')}`);
  const runs = hist.runs.length >= 25 ? '25+ runs' : `${hist.runs.length} run${hist.runs.length === 1 ? '' : 's'}`;
  return h('div', { class: 'note history-note' }, `${runs} · last ${(last.accuracy * 100).toFixed(1)}%${others.length ? ` · best at ${others.join(' · ')}` : ''}`);
}

/** The song speed on the Play button, when it is not 100%. */
function speedTag(): HTMLElement | null {
  const s = settings.songSpeed;
  return s === 1 ? null : h('span', { class: 'speed-tag', title: 'Song speed (- and + change it)' }, `${Math.round(s * 100)}%`);
}

/** error or warn when something is known to be wrong with a song's chart (info does not count). */
function problemLevel(songId: string): 'error' | 'warn' | null {
  const level = worstLevel(knownIssues(songId) ?? []);
  return level === 'info' ? null : level;
}

function problemBadge(songId: string): HTMLSpanElement | null {
  const level = problemLevel(songId);
  if (!level) return null;
  const first = knownIssues(songId)!.find((i) => i.level === level)!;
  return h('span', { class: `problem ${level}`, title: first.text }, level === 'error' ? '⊘' : '⚠');
}

function issueList(issues: ChartIssue[]): HTMLElement | null {
  return issues.length ? h('ul', { class: 'issues' }, ...issues.map((i) => h('li', { class: i.level }, i.text))) : null;
}

/** Difficulty rating as six dash pips (Clone Hero's 0-6 scale; higher values fill all six). */
function pips(r: number): HTMLSpanElement {
  const n = Math.max(0, Math.min(6, Math.round(r)));
  return h('span', { class: 'pips', title: `Difficulty ${r}` }, ...Array.from({ length: 6 }, (_, i) => h('i', { class: i < n ? 'on' : '' })));
}

/** Footer hint: bright key, dim label, and coloured squares for the matching guitar buttons. */
function hint(k: string, label: string, sw = '') {
  return h('span', { class: 'hint' }, ...[...sw].map((c) => h('i', { class: `sw ${c}` })), sw ? ' ' : '', h('kbd', null, k), ' ', label);
}

/** Five stars, earned ones lit; six stars (gold) lights all five in gold. */
export function starsEl(stars: number): HTMLSpanElement {
  const full = Math.floor(stars);
  return h('span', { class: `stars-inline ${full >= 6 ? 'gold' : ''}` }, ...Array.from({ length: 5 }, (_, i) => h('span', { class: i < full ? 'on' : '' }, '★')));
}

/**
 * On a phone or tablet the three-fret touch part is the natural one to start on: pick it once, the
 * first time the song list opens on a touch screen. Any later choice is kept as usual.
 */
function initialInstrument(): Instrument {
  const KEY = 'chsq.touchDefault';
  try {
    if (TouchFrets.wanted() && !localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, '1');
      if (settings.instrument === 'guitar') {
        updateSettings({ instrument: 'touch' });
        return 'touch';
      }
    }
  } catch {
    // storage unavailable
  }
  return settings.instrument;
}
