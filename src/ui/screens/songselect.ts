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

const ROW_H = 60;
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
  private sel = 0;
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
      { class: 'sort', title: 'Sort by' },
      ...(['artist', 'name', 'charter', 'length', 'pack'] as const).map((s) => h('option', { value: s, selected: settings.sort === s }, `Sort: ${s}`)),
    );
    sort.addEventListener('change', () => {
      updateSettings({ sort: sort.value as Settings['sort'] });
      this.refilter();
    });
    this.count = h('span', { class: 'count' });
    this.spacer = h('div', { class: 'spacer' });
    this.list = h('div', { class: 'song-list', tabindex: '-1' }, this.spacer);
    this.list.addEventListener('scroll', () => this.renderRows());
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
        sort,
        this.count,
        h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost', title: 'Rescan library', onclick: () => lib.source && app.openLibrary(lib.source, true) }, '↻ Rescan'),
        h(
          'button',
          {
            class: 'btn ghost',
            title: 'Choose a different charts folder',
            onclick: async () => {
              const { Library } = await import('../../library/library.ts');
              const src = await Library.pickAny();
              if (src) await app.openLibrary(src, true);
            },
          },
          '📁 Library',
        ),
        canFullscreen() ? h('button', { class: 'btn ghost icon', title: 'Fullscreen (F)', 'aria-label': 'Fullscreen', onclick: () => void toggleFullscreen() }, '⛶') : null,
        h('button', { class: 'btn ghost', onclick: () => this.openSettings() }, '⚙ Settings'),
      ),
      h('main', null, this.list, this.detail),
      h(
        'footer',
        null,
        hint('↑↓ / strum', 'browse'),
        hint('Enter / green', 'play'),
        hint('P / yellow', 'practice'),
        hint('←→ / blue·orange', 'difficulty'),
        hint('Tab', 'instrument'),
        hint('B', 'watch bot'),
        hint('F', 'fullscreen'),
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
    let songs = this.app.library.songs.filter((s) => {
      if (!terms.length) return true;
      const hay = `${s.name} ${s.artist} ${s.album} ${s.charter} ${s.genre} ${s.pack}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    const by = settings.sort;
    // Ignore leading punctuation and "The " so '"Weird Al"' sorts under W and The Who under W.
    const key = (x: string) => x.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^the\s+/i, '');
    const cmp = (a: string, b: string) => key(a).localeCompare(key(b), undefined, { sensitivity: 'base' });
    songs = songs.sort((a, b) => {
      switch (by) {
        case 'name':
          return cmp(a.name, b.name);
        case 'charter':
          return cmp(a.charter, b.charter) || cmp(a.name, b.name);
        case 'length':
          return a.lengthMs - b.lengthMs;
        case 'pack':
          return cmp(a.path, b.path);
        default:
          return cmp(a.artist, b.artist) || cmp(a.name, b.name);
      }
    });
    this.filtered = songs;
    setText(this.count, `${songs.length} song${songs.length === 1 ? '' : 's'}`);
    this.spacer.style.height = `${songs.length * ROW_H}px`;
    const idx = current ? songs.indexOf(current) : -1;
    this.select(idx >= 0 ? idx : 0, true);
  }

  private renderRows() {
    const top = this.list.scrollTop;
    const h0 = this.list.clientHeight || 800;
    const first = Math.max(0, Math.floor(top / ROW_H) - 4);
    const last = Math.min(this.filtered.length, Math.ceil((top + h0) / ROW_H) + 4);
    const needed = last - first;
    while (this.rows.length < needed) {
      const row = h('div', { class: 'song-row' });
      row.addEventListener('click', () => this.select(Number(row.dataset.i)));
      row.addEventListener('dblclick', () => this.play(false));
      this.rows.push(row);
      this.list.append(row);
    }
    for (let k = 0; k < this.rows.length; k++) {
      const row = this.rows[k];
      const i = first + k;
      if (i >= last) {
        row.style.display = 'none';
        continue;
      }
      row.style.display = '';
      row.style.transform = `translateY(${i * ROW_H}px)`;
      row.classList.toggle('sel', i === this.sel);
      if (row.dataset.i === String(i) && row.dataset.id === this.filtered[i].id) continue;
      row.dataset.i = String(i);
      const s = this.filtered[i];
      row.dataset.id = s.id;
      const art = h('div', { class: 'thumb' });
      if (s.albumArt) {
        void this.art(s).then((u) => {
          if (row.dataset.id === s.id) art.style.backgroundImage = `url("${u}")`;
        });
      }
      const best = getBest(scoreKey(s.id, trackKey(this.instrument, this.difficulty)));
      row.replaceChildren(
        art,
        h('div', { class: 'meta' }, h('div', { class: 'title' }, s.name), h('div', { class: 'artist' }, s.artist)),
        h(
          'div',
          { class: 'side' },
          best ? h('div', { class: 'best' }, starsEl(best.stars), best.fc ? h('span', { class: 'fc' }, 'FC') : null) : null,
          h('div', { class: 'len' }, s.lengthMs ? formatTime(s.lengthMs / 1000) : ''),
        ),
      );
    }
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
    const y = this.sel * ROW_H;
    const l = this.list;
    if (y < l.scrollTop) l.scrollTop = y;
    else if (y + ROW_H > l.scrollTop + l.clientHeight) l.scrollTop = y + ROW_H - l.clientHeight;
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
                this.renderRowsForce();
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
        h('button', { class: 'btn primary big', disabled: !canPlay, onclick: () => this.play(false) }, '▶ Play'),
        h('button', { class: 'btn', disabled: !canPlay, onclick: () => this.practice() }, 'Practice'),
        h('button', { class: 'btn ghost', disabled: !canPlay, onclick: () => this.play(true) }, 'Watch bot'),
      ),
    );
  }

  private renderRowsForce() {
    for (const r of this.rows) delete r.dataset.i;
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
    this.renderRowsForce();
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
        this.select(this.sel - 10);
        return true;
      case 'PageDown':
        this.select(this.sel + 10);
        return true;
      case 'Enter':
        void this.play(false);
        return true;
      case 'Tab':
        this.cycleInstrument();
        return true;
      case 'Escape':
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
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.search.focus();
      return false;
    } else return false;
    return true;
  }
}

function hint(k: string, label: string) {
  return h('span', { class: 'hint' }, h('kbd', null, k), ' ', label);
}

/** Five stars, earned ones lit; six stars (gold) lights all five in gold. */
export function starsEl(stars: number): HTMLSpanElement {
  const full = Math.floor(stars);
  return h('span', { class: `stars-inline ${full >= 6 ? 'gold' : ''}` }, ...Array.from({ length: 5 }, (_, i) => h('span', { class: i < full ? 'on' : '' }, '★')));
}
