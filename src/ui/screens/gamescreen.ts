import { audio } from '../../audio/audio.ts';
import type { StemFile } from '../../audio/audio.ts';
import { stretchExcerpt } from '../../audio/stretch.ts';
import type { Chart } from '../../chart/build.ts';
import type { Difficulty, Instrument } from '../../chart/types.ts';
import { INSTRUMENT_LABEL, trackKey } from '../../chart/types.ts';
import { Game } from '../../game/game.ts';
import type { PracticeRange } from '../../game/game.ts';
import type { NavAction } from '../../input/input.ts';
import type { SongEntry } from '../../library/song.ts';
import { settings } from '../../settings.ts';
import { recordPlay } from '../../game/plays.ts';
import type { App, Screen } from '../app.ts';
import { fmtScore, h, setText } from '../dom.ts';
import { formatTime } from '../../util/text.ts';
import { Hud } from '../hud.ts';
import { Menu } from '../menu.ts';
import { canFullscreen, isFullscreen, toggleFullscreen } from '../fullscreen.ts';

export interface GameRequest {
  song: SongEntry;
  chart: Chart;
  instrument: Instrument;
  difficulty: Difficulty;
  bot: boolean;
  practice?: PracticeRange;
}

export class GameScreen implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly req: GameRequest;
  private readonly canvas: HTMLCanvasElement;
  private readonly hud = new Hud();
  private readonly loading: HTMLDivElement;
  private readonly loadStatus: HTMLDivElement;
  private readonly loadBar: HTMLDivElement;
  private game: Game | null = null;
  private pauseMenu: Menu | null = null;
  private pauseEl: HTMLElement | null = null;
  private destroyed = false;
  private videoUrl: string | null = null;

  constructor(app: App, req: GameRequest) {
    this.app = app;
    this.req = req;
    this.canvas = h('canvas', { class: 'game-canvas' });
    this.loadStatus = h('div', { class: 'load-status' }, 'Reading files…');
    this.loadBar = h('div', { class: 'load-bar-fill' });
    const art = h('div', { class: 'load-art' });
    if (req.song.albumArt) void app.library.fileUrl(req.song, req.song.albumArt).then((u) => (art.style.backgroundImage = `url("${u}")`));
    this.loading = h(
      'div',
      { class: 'loading' },
      art,
      h('div', { class: 'load-title' }, req.song.name),
      h('div', { class: 'load-artist' }, req.song.artist),
      h('div', { class: 'load-part' }, `${INSTRUMENT_LABEL[req.instrument]} · ${req.difficulty}${req.bot ? ' · bot' : ''}${req.practice ? ' · practice' : ''}`),
      req.song.loadingPhrase ? h('div', { class: 'load-phrase' }, /^["“]/.test(req.song.loadingPhrase) ? req.song.loadingPhrase : `“${req.song.loadingPhrase}”`) : null,
      h('div', { class: 'load-bar' }, this.loadBar),
      this.loadStatus,
    );
    this.el = h('div', { class: 'screen game-screen' }, this.canvas, this.hud.root, this.loading);
  }

  /** Switching to another tab pauses the song (browsers would otherwise keep playing it unseen). */
  private onVisibility = () => {
    if (document.hidden && this.game && !this.game.isPaused) this.game.pause();
  };

  /** Leaving fullscreen mid-song (e.g. the browser's own Escape handling) pauses rather than playing on. */
  private onFullscreenChange = () => {
    if (!isFullscreen() && this.game && !this.game.isPaused) this.game.pause();
  };

  shown(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    void this.load().catch((err) => {
      console.error(err);
      if (this.destroyed) return;
      this.app.toast(`Could not start song: ${(err as Error).message}`);
      void this.back();
    });
  }

  private async load() {
    const { song, chart, instrument, difficulty, practice } = this.req;
    const lib = this.app.library;
    const track = chart.tracks.get(trackKey(instrument, difficulty));
    if (!track) throw new Error('This part is not charted');
    await audio().resume();

    const stems = Object.entries(song.stems).filter(([k]) => k !== 'preview');
    let read = 0;
    const files: StemFile[] = await Promise.all(
      stems.map(async ([stem, file]) => {
        const bytes = await lib.readFile(song, file);
        this.progress(++read / stems.length * 0.4, `Reading audio (${read}/${stems.length})`);
        return { stem, bytes };
      }),
    );
    if (this.destroyed) return;
    const loaded = await audio().loadSong(files, instrument, (d, t) => this.progress(0.4 + (d / t) * 0.5, `Decoding audio (${d}/${t})`));
    if (this.destroyed) return;
    if (practice && practice.speed !== 1) {
      this.progress(0.92, 'Slowing down the practice section…');
      await new Promise((r) => setTimeout(r, 30));
      const a = audio();
      const b = a.buffers;
      const from = Math.max(0, practice.start - 4);
      const to = practice.end + 3;
      const s = (x: AudioBuffer | null) => (x ? stretchExcerpt(a.ctx, x, from, to, practice.speed) : null);
      a.setBuffers({ player: s(b.player), backing: s(b.backing), origin: from });
    }
    this.progress(0.97, 'Warming up…');
    this.game = new Game({ song, chart, track, instrument, duration: loaded.duration, bot: this.req.bot, practice }, this.canvas, this.hud);
    if (song.video) {
      try {
        const url = await lib.fileUrl(song, song.video);
        const video = h('video', { muted: true, playsInline: true, preload: 'auto', src: url });
        video.muted = true;
        this.videoUrl = url;
        this.game.setVideo(video, song.videoStartMs / 1000);
      } catch {
        // fall back to album art
      }
    }
    if (!song.video && (song.background || song.albumArt)) {
      try {
        const bytes = await lib.readFile(song, song.background ?? song.albumArt!);
        const bmp = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>]));
        this.game.renderer.setBackground(bmp);
      } catch {
        // no background
      }
    }
    if (this.destroyed) return;
    this.game.renderer.warmUp(chart.beats);
    // Give the browser an idle moment to collect loading garbage before the music starts.
    await new Promise<void>((resolve) =>
      'requestIdleCallback' in window ? requestIdleCallback(() => resolve(), { timeout: 300 }) : setTimeout(resolve, 100),
    );
    if (this.destroyed) return;
    this.game.onPause = () => this.showPause();
    this.game.onEnd = (r) => {
      void import('./results.ts').then(({ ResultsScreen }) => this.app.show(new ResultsScreen(this.app, r, this.req)));
    };
    // If the tab was hidden while loading, wait until it is visible again before starting.
    while (document.hidden) {
      await new Promise<void>((r) => document.addEventListener('visibilitychange', () => r(), { once: true }));
      if (this.destroyed) return;
    }
    this.loading.classList.add('gone');
    if (!this.req.bot && !this.req.practice) recordPlay(song.id);
    // Handy for debugging from the console.
    (globalThis as Record<string, unknown>).__game = this.game;
    this.game.start();
  }

  private progress(f: number, text: string) {
    this.loadBar.style.transform = `scaleX(${f})`;
    setText(this.loadStatus, text);
  }

  private showPause() {
    const g = this.game!;
    const st = g.pauseStats;
    const t = g.setup.track;
    const menu = new Menu(`Paused · ${formatTime(st.time)} of ${formatTime(st.total)}`, [
      { label: 'Resume', action: () => this.resume() },
      { label: 'Restart', action: () => this.restart() },
      ...(this.req.practice || this.req.bot ? [] : [{ label: 'Practice this section', action: () => void this.practiceHere() }]),
      ...(canFullscreen() ? [{ label: isFullscreen() ? 'Exit fullscreen' : 'Fullscreen', action: () => void toggleFullscreen().then(() => this.refreshPause()) }] : []),
      { label: 'Settings', action: () => void import('./settings.ts').then(({ SettingsModal }) => this.app.pushModal(new SettingsModal(this.app, true))) },
      { label: 'Quit to song list', action: () => void this.back() },
    ]);
    const art = h('div', { class: 'art none' });
    const song = this.req.song;
    if (song.albumArt) {
      art.classList.remove('none');
      void this.app.library.fileUrl(song, song.albumArt).then((u) => (art.style.backgroundImage = `url("${u}")`));
    }
    const stat = (label: string, value: string) => h('div', null, h('div', { class: 'label' }, label), h('div', { class: 'v' }, value));
    const card = h(
      'div',
      { class: 'pause-card' },
      art,
      h('div', { class: 't' }, song.name),
      h('div', { class: 'p' }, `${song.artist} · ${INSTRUMENT_LABEL[t.instrument]} ${t.difficulty}`),
      h('div', { class: 'pause-stats' }, stat('Score', fmtScore(st.score)), stat('Acc', `${(st.accuracy * 100).toFixed(1)}%`), st.section ? stat('Section', st.section) : null),
    );
    const hints = h(
      'div',
      { class: 'hints pause-hints' },
      h('span', { class: 'hint' }, h('kbd', null, 'strum'), ' move'),
      h('span', { class: 'hint' }, h('i', { class: 'sw g' }), ' select'),
      h('span', { class: 'hint' }, h('i', { class: 'sw r' }), ' / Esc resume'),
    );
    this.pauseMenu = menu;
    this.pauseEl = h('div', { class: 'pause' }, menu.el, card, hints);
    this.el.append(this.pauseEl);
  }

  private refreshPause() {
    if (!this.pauseMenu) return;
    this.hidePause();
    this.showPause();
  }

  private hidePause() {
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.pauseMenu = null;
  }

  private resume() {
    this.hidePause();
    // Settings may have changed from the pause menu.
    this.game?.renderer.setQuality(settings.quality);
    this.hud.showTimingBar(settings.timingBar);
    audio().applyVolumes();
    this.game?.resume();
  }

  private restart() {
    this.hidePause();
    this.game?.restart();
  }

  private async practiceHere() {
    const g = this.game!;
    const secs = this.req.chart.sections;
    let idx = 0;
    const t = g.songPosition;
    for (let i = 0; i < secs.length; i++) if (secs[i].time <= t) idx = i;
    const { PracticeModal } = await import('./practice.ts');
    this.app.pushModal(new PracticeModal(this.app, this.req, idx));
  }

  private async back() {
    const { SongSelect } = await import('./songselect.ts');
    this.app.show(new SongSelect(this.app));
  }

  nav(a: NavAction): void {
    if (this.pauseMenu) {
      if (a === 'start' || a === 'back') this.resume();
      else this.pauseMenu.nav(a);
    }
  }

  key(e: KeyboardEvent): boolean {
    if (!this.pauseMenu) return false;
    if (e.key === 'Escape') {
      this.resume();
      return true;
    }
    return this.pauseMenu.key(e);
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.destroyed = true;
    this.game?.stop();
    audio().unload();
    if (this.videoUrl) this.app.library.release(this.videoUrl);
  }
}
