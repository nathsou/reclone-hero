import { measureDisplayInterval } from '../../game/frameTiming.ts';
import { audio } from '../../audio/audio.ts';
import { loadSongAudio } from '../../audio/loadSong.ts';
import type { Chart } from '../../chart/build.ts';
import type { Difficulty, Instrument } from '../../chart/types.ts';
import { DIFFICULTIES, INSTRUMENT_LABEL, trackKey } from '../../chart/types.ts';
import { Game, effectiveQuality } from '../../game/game.ts';
import { applyModifiers } from '../../game/modifiers.ts';
import type { Mic } from '../../audio/mic.ts';
import type { SetlistRun } from '../setlistRun.ts';
import type { PracticeRange } from '../../game/game.ts';
import type { NavAction } from '../../input/input.ts';
import type { SongEntry } from '../../library/song.ts';
import { settings, updateSettings } from '../../settings.ts';
import { recordPlay } from '../../game/plays.ts';
import type { App, Screen } from '../app.ts';
import { fmtScore, h, setText } from '../dom.ts';
import { formatTime } from '../../util/text.ts';
import { Hud } from '../hud.ts';
import { Menu } from '../menu.ts';
import type { MenuItem } from '../menu.ts';
import { canFullscreen, isFullscreen, toggleFullscreen } from '../fullscreen.ts';

const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

export interface GameRequest {
  song: SongEntry;
  chart: Chart;
  instrument: Instrument;
  difficulty: Difficulty;
  bot: boolean;
  practice?: PracticeRange;
  /** song speed outside practice (1 or absent: as recorded) */
  speed?: number;
  /** modifier ids (game/modifiers.ts) */
  mods?: string[];
  /** the setlist this song is part of */
  setlist?: SetlistRun;
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
  private readonly loadAbort = new AbortController();
  private artwork: Promise<string> | null = null;
  private videoUrl: string | null = null;
  private mic: Mic | null = null;

  constructor(app: App, req: GameRequest) {
    this.app = app;
    this.req = req;
    this.canvas = h('canvas', { class: 'game-canvas' });
    this.loadStatus = h('div', { class: 'load-status' }, 'Reading files…');
    this.loadBar = h('div', { class: 'load-bar-fill' });
    const art = h('div', { class: 'load-art' });
    if (req.song.albumArt) {
      this.artwork = app.library.fileUrl(req.song, req.song.albumArt);
      void this.artwork.then(u => {
        if (this.destroyed) return; // destroy also releases late arrivals
        art.style.backgroundImage = `url("${u}")`;
      }).catch(() => {});
    }
    this.loading = h(
      'div',
      { class: 'loading' },
      art,
      h('div', { class: 'load-title' }, req.song.name),
      h('div', { class: 'load-artist' }, req.song.artist),
      h('div', { class: 'load-part' }, `${INSTRUMENT_LABEL[req.instrument]} · ${req.difficulty}${req.bot ? ' · bot' : ''}${req.practice ? ' · practice' : ''}`),
      req.speed && req.speed !== 1 && !req.practice ? h('div', { class: 'load-part' }, `${Math.round(req.speed * 100)}% speed`) : null,
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
      if (this.destroyed) return;
      console.error(err);
      this.app.toast(`Could not start song: ${(err as Error).message}`);
      void this.back();
    });
  }

  private async load() {
    const { song, chart, instrument, difficulty, practice } = this.req;
    const speed = practice ? 1 : (this.req.speed ?? 1);
    const lib = this.app.library;
    const charted = chart.tracks.get(trackKey(instrument, difficulty));
    if (!charted) throw new Error('This part is not charted');
    const mods = this.req.mods ?? [];
    const track = applyModifiers(charted, mods);
    const signal = this.loadAbort.signal;
    const displayInterval = measureDisplayInterval(signal);
    const rate = practice?.speed ?? speed;
    const range = rate !== 1 ? { start: practice ? Math.max(0, practice.start - 4) : 0, end: practice ? practice.end + 3 : Infinity, rate } : undefined;
    const loaded = await loadSongAudio(audio(), lib, song, instrument, signal, (p, text) => this.progress(p, text), range);
    signal.throwIfAborted();
    this.progress(0.97, 'Warming up…');
    const interval = await displayInterval;
    signal.throwIfAborted();
    this.game = new Game({ song, chart, track, instrument, duration: loaded.duration, bot: this.req.bot, practice, speed, mods }, this.canvas, this.hud);
    this.game.setDisplayInterval(interval);
    if (instrument === 'vocals' && !this.req.bot) {
      this.progress(0.98, 'Opening the microphone…');
      const { Mic } = await import('../../audio/mic.ts');
      const mic = await Mic.open(audio().ctx);
      if (this.destroyed) {
        mic.close();
        return;
      }
      this.mic = mic;
      this.game.setMic(mic);
    }
    if (song.video) {
      try {
        const url = await lib.fileUrl(song, song.video);
        if (this.destroyed) { lib.release(url); return; }
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
        if (this.destroyed) { bmp.close(); return; }
        this.game.renderer.setBackground(bmp);
      } catch {
        // no background
      }
    }
    if (this.destroyed) return;
    this.game.prepareStart();
    // Touch pads change the canvas height. Let layout and ResizeObserver settle before warming
    // the GPU targets; otherwise the first gameplay frame deletes the targets we just warmed.
    await nextFrame(signal);
    await nextFrame(signal);
    if (this.destroyed) return;
    this.game.warmUp();
    await audio().prepareClock(signal);
    // Give the browser an idle moment to collect loading garbage before the music starts.
    await new Promise<void>((resolve) =>
      'requestIdleCallback' in window ? requestIdleCallback(() => resolve(), { timeout: 300 }) : setTimeout(resolve, 100),
    );
    if (this.destroyed) return;
    this.game.onPause = () => this.showPause();
    this.game.onEnd = (r) => {
      void import('./results.ts').then(({ ResultsScreen }) => {
        if (!this.destroyed) this.app.show(new ResultsScreen(this.app, r, this.req));
      });
    };
    // If the tab was hidden while loading, wait until it is visible again before starting.
    while (document.hidden) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { document.removeEventListener('visibilitychange', visible); signal.removeEventListener('abort', abort); };
        const visible = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(signal.reason); };
        document.addEventListener('visibilitychange', visible, { once: true });
        signal.addEventListener('abort', abort, { once: true });
      });
      if (this.destroyed) return;
    }
    this.loading.classList.add('gone');
    if (!this.req.bot && !this.req.practice) recordPlay(song.id);
    // Handy for debugging from the console.
    (globalThis as Record<string, unknown>).__game = this.game;
    (globalThis as Record<string, unknown>).__audio = audio();
    this.game.start();
  }

  private progress(f: number, text: string) {
    this.loadBar.style.transform = `scaleX(${f})`;
    setText(this.loadStatus, text);
  }

  private showPause(view: 'main' | 'difficulty' = 'main') {
    const g = this.game!;
    const st = g.pauseStats;
    const t = g.setup.track;
    const { chart, instrument, difficulty } = this.req;
    const available = DIFFICULTIES.filter((d) => chart.tracks.has(trackKey(instrument, d)));
    const difficulties: MenuItem[] = [
      ...available.map((d) => ({ label: `${DIFF_LABEL[d]}${d === difficulty ? ' ✓' : ''}`, action: () => this.changeDifficulty(d) })),
      { label: 'Back', action: () => this.refreshPause() },
    ];
    const skip = g.skippable;
    const main: MenuItem[] = [
      { label: 'Resume', action: () => this.resume() },
      ...(skip ? [{ label: skip === 'intro' ? 'Skip intro' : 'Skip break', action: () => this.skipBreak() }] : []),
      { label: 'Restart', action: () => this.restart() },
      ...(this.req.practice || available.length < 2 ? [] : [{ label: `Difficulty: ${DIFF_LABEL[difficulty]}`, action: () => this.showDifficulties() }]),
      ...(this.req.practice || this.req.bot ? [] : [{ label: 'Practice this section', action: () => void this.practiceHere() }]),
      ...(canFullscreen() ? [{ label: isFullscreen() ? 'Exit fullscreen' : 'Fullscreen', action: () => void toggleFullscreen().then(() => this.refreshPause()) }] : []),
      { label: 'Settings', action: () => void import('./settings.ts').then(({ SettingsModal }) => this.app.pushModal(new SettingsModal(this.app, true))) },
      ...(this.req.setlist && !this.req.practice ? [{ label: 'Skip to the next song', action: () => void this.skipSong() }] : []),
      { label: this.req.setlist && !this.req.practice ? 'Quit the setlist' : 'Quit to song list', action: () => void this.back() },
    ];
    const menu = view === 'difficulty' ? new Menu('Difficulty · the song starts over', difficulties) : new Menu(`Paused · ${formatTime(st.time)} of ${formatTime(st.total)}`, main);
    const art = h('div', { class: 'art none' });
    const song = this.req.song;
    if (song.albumArt) {
      art.classList.remove('none');
      void this.artwork?.then(u => { if (!this.destroyed) art.style.backgroundImage = `url("${u}")`; }).catch(() => {});
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
    this.el.classList.add('paused');
  }

  private showDifficulties() {
    this.hidePause();
    this.showPause('difficulty');
  }

  private changeDifficulty(d: Difficulty) {
    const charted = this.req.chart.tracks.get(trackKey(this.req.instrument, d));
    if (!charted || !this.game) return;
    const track = applyModifiers(charted, this.req.mods ?? []);
    if (d === this.req.difficulty) {
      this.refreshPause();
      return;
    }
    this.req.difficulty = d;
    updateSettings({ difficulty: d });
    this.hidePause();
    this.game.changeTrack(track);
  }

  private refreshPause() {
    if (!this.pauseMenu) return;
    this.hidePause();
    this.showPause();
  }

  private hidePause() {
    this.pauseEl?.remove();
    this.pauseEl = null;
    this.el.classList.remove('paused');
    this.pauseMenu = null;
  }

  private resume() {
    this.hidePause();
    // Settings may have changed from the pause menu.
    this.game?.renderer.setQuality(effectiveQuality());
    this.hud.showTimingBar(settings.timingBar && this.req.instrument !== 'vocals');
    audio().applyVolumes();
    this.game?.resume();
  }

  /** Resume a few seconds before the next note. */
  private skipBreak() {
    this.hidePause();
    this.game?.renderer.setQuality(effectiveQuality());
    this.hud.showTimingBar(settings.timingBar && this.req.instrument !== 'vocals');
    audio().applyVolumes();
    this.game?.skipBreak();
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

  /** Setlists: leave this song out and go on with the next. */
  private async skipSong() {
    const run = this.req.setlist!;
    run.results[run.index] = { score: 0, stars: 0, accuracy: 0, fc: false, failed: false, part: '', skipped: 'skipped' };
    const { nextInSetlist } = await import('../setlistRun.ts');
    await nextInSetlist(this.app, run);
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
    this.loadAbort.abort();
    if (this.artwork) void this.artwork.then(u => this.app.library.release(u)).catch(() => {});
    const debug = globalThis as Record<string, unknown>;
    if (debug.__game === this.game) delete debug.__game;
    this.game?.stop();
    this.mic?.close();
    this.hud.vocals.destroy();
    audio().unload();
    if (this.videoUrl) this.app.library.release(this.videoUrl);
  }
}

/** Unlike a bare rAF promise, a destroyed screen also settles while its tab is hidden. */
function nextFrame(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { cancelAnimationFrame(id); reject(signal.reason); };
    const id = requestAnimationFrame(() => { signal.removeEventListener('abort', abort); resolve(); });
    signal.addEventListener('abort', abort, { once: true });
  });
}
