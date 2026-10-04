import { audio } from '../audio/audio.ts';
import type { Chart } from '../chart/build.ts';
import type { Instrument, Track } from '../chart/types.ts';
import { GEM_COUNT, HOPO, INSTRUMENT_LABEL, TAP, TOUCH_LANES } from '../chart/types.ts';
import { applyAction, botActions } from '../engine/bot.ts';
import type { PlayedWith } from './scores.ts';
import { TouchFrets } from '../ui/touchFrets.ts';
import type { Action as BotAction } from '../engine/bot.ts';
import { Engine, HIT, ROCK_LOSS, baseScore, starProgress } from '../engine/engine.ts';
import type { EngineEvent } from '../engine/engine.ts';
import { FRET_ACTIONS, keyLabel } from '../input/bindings.ts';
import { input } from '../input/input.ts';
import type { InputEvent } from '../input/input.ts';
import type { SongEntry } from '../library/song.ts';
import { BASE_SPEED } from '../render/highway.ts';
import { Renderer } from '../render/renderer.ts';
import type { RenderState } from '../render/renderer.ts';
import { settings } from '../settings.ts';
import type { Quality } from '../settings.ts';
import { Hud } from '../ui/hud.ts';
import type { HudState } from '../ui/hud.ts';
import { noteSkin, renderTheme } from '../ui/theme.ts';
import { SKIP_CHORD, canSkip, findGaps, gapAt, skipTarget } from './gaps.ts';
import { PHRASE_RATINGS, VocalJudge } from '../engine/vocals.ts';
import type { Mic } from '../audio/mic.ts';
import { SILENCE_RMS } from '../audio/pitch.ts';
import type { Gap } from './gaps.ts';
import { MODIFIER_LABEL, isModifier, windowScale } from './modifiers.ts';

/** Misses are judged slightly behind real time so late-arriving input events are never pre-empted. */
const JUDGE_LAG = 0.02;
/** In keyboard tap mode, fret keys pressed this close together form one chord, i.e. one strum. */
const TAP_CHORD_WINDOW = 0.04;
const FRET_INDEX: Record<string, number> = { green: 0, red: 1, yellow: 2, blue: 3, orange: 4, strumUp: -1, strumDown: -1, starPower: -1, tilt: -1, start: -1, kick: -1 };
/**
 * Drums: what each action hits. The red, yellow, blue and orange frets (keys S D F G) are the red, yellow,
 * blue and green pads; the kick pedal action and the green fret are the kick (KICK_BIT stands for it while
 * it is held, for the key labels).
 */
const KICK_BIT = 1 << 4;
const DRUM_HIT: Record<string, number> = { red: 1, yellow: 2, blue: 4, orange: 8, green: KICK_BIT, kick: KICK_BIT };
const DRUM_PADS_ALL = 0b1111;

export interface PracticeRange {
  start: number;
  end: number;
  speed: number;
  first: number;
  last: number;
  label: string;
}

export interface GameSetup {
  song: SongEntry;
  chart: Chart;
  track: Track;
  instrument: Instrument;
  duration: number;
  bot: boolean;
  practice?: PracticeRange;
  /** song speed outside practice (1 = as recorded) */
  speed?: number;
  /** modifiers on for this run (the track already has the note ones applied) */
  mods?: string[];
}

export interface SectionResult {
  name: string;
  time: number;
  hits: number;
  total: number;
}

const QUALITY_STEPS: Quality[] = ['high', 'medium', 'low'];
/**
 * Quality lowered this session because frames could not keep up; applies to later songs too. It is
 * forgotten when the player picks another quality or turns automatic lowering off.
 */
let qualityCap: { cap: Quality; chosen: Quality } | null = null;

/** The quality to render at: the chosen one, unless it was lowered automatically this session. */
export function effectiveQuality(): Quality {
  const q = settings.quality;
  if (!qualityCap || !settings.autoQuality || qualityCap.chosen !== q) return q;
  return QUALITY_STEPS.indexOf(qualityCap.cap) > QUALITY_STEPS.indexOf(q) ? qualityCap.cap : q;
}

/** Keep the screen awake while a song plays (released on pause and when the song ends). */
class ScreenAwake {
  private lock: { release(): Promise<void> } | null = null;
  private wanted = false;

  on(): void {
    this.wanted = true;
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!wl || this.lock) return;
    wl.request('screen').then(
      (lock) => {
        if (this.wanted) this.lock = lock;
        else void lock.release();
      },
      () => {},
    );
  }

  off(): void {
    this.wanted = false;
    void this.lock?.release().catch(() => {});
    this.lock = null;
  }
}

export interface GameResult {
  setup: GameSetup;
  /** every note hit and no overstrum before the last one (for practice: the range, with no overstrum at all) */
  fullCombo: boolean;
  /** what the run was mostly played with */
  input: PlayedWith;
  score: number;
  stars: number;
  hits: number;
  total: number;
  misses: number;
  overstrums: number;
  sustainDrops: number;
  maxStreak: number;
  spPhrases: number;
  spPhrasesTotal: number;
  solos: { hits: number; total: number }[];
  sections: SectionResult[];
  /** hit timing deltas in seconds (auto-hits excluded) */
  deltas: number[];
  missByLane: number[];
  missChords: number;
  missOpen: number;
  missByType: { strum: number; hopo: number; tap: number };
  wrongFret: number;
  lateMiss: number;
  /** drums: pad hits with nothing to hit */
  overhits: number;
  /** vocals: the rating (index into PHRASE_RATINGS) of each phrase */
  ratings?: number[];
  /** per-note outcome and timing (seconds, negative = early), parallel to setup.track.notes */
  noteState: Uint8Array;
  hitDelta: Float32Array;
  /** song time the results timeline spans */
  start: number;
  end: number;
  /** the rock meter ran out at this song time (fail mode); the run stops there */
  failedAt?: number;
}

export class Game {
  readonly setup: GameSetup;
  readonly renderer: Renderer;
  readonly hud: Hud;
  private engine!: Engine;
  private base = 1;
  private sustainHeld!: Uint8Array;
  private sustainDrop!: Float32Array;
  private readonly laneHit = new Float32Array(5);
  private readonly laneWrong = new Float32Array(5);
  private missPulse = 0;
  private srcMask = { kb: 0, pad: 0, touch: 0 };
  /** fret presses per source during the run, to tell what it was played with */
  private presses = { kb: 0, pad: 0, touch: 0 };
  private raf = 0;
  private lastFrame = 0;
  private paused = false;
  private ended = false;
  private startTime = 0;
  private endTime = 0;
  private resumeAt = -Infinity;
  private sectionIdx = -1;
  private beatIdx = 0;
  private bot: BotAction[] = [];
  private botIdx = 0;
  private spReadyShown = false;
  private soloHits = 0;
  private soloSeen = 0;
  private sustainDrops = 0;
  private wrongFret = 0;
  private lateMiss = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private loops = 0;

  private video: HTMLVideoElement | null = null;
  private videoOffset = 0;

  onEnd: ((r: GameResult) => void) | null = null;
  onPause: (() => void) | null = null;

  constructor(setup: GameSetup, canvas: HTMLCanvasElement, hud: Hud) {
    this.setup = setup;
    this.renderer = new Renderer(canvas);
    this.renderer.setQuality(effectiveQuality());
    // A lost GPU context (phones do this when backgrounded) pauses the song; once it is back the
    // renderer has rebuilt itself, so warm it up again and draw the paused frame.
    this.renderer.onContextChange = (available) => {
      if (!available) {
        this.pause();
        return;
      }
      this.hudCameraKey = '';
      this.renderer.warmUp(this.setup.chart.beats, noteSkin(), renderTheme());
      this.pausedDrawn = false;
    };
    this.hud = hud;
    this.rs = {
      time: 0,
      dt: 0,
      speed: BASE_SPEED,
      length: 1,
      notes: setup.track.notes,
      noteState: new Uint8Array(0),
      spBroken: new Uint8Array(0),
      sustainHeld: new Uint8Array(0),
      sustainDrop: new Float32Array(0),
      sustainMask: 0,
      beats: setup.chart.beats,
      frets: 0,
      laneHit: this.laneHit,
      laneWrong: this.laneWrong,
      spActive: false,
      multiplier: 1,
      missPulse: 0,
      whammy: 0,
      lefty: false,
      solo: false,
      beatPulse: 0,
      theme: renderTheme(),
      skin: noteSkin(),
    };
    hud.setTimingWindow(settings.hitWindowMs);
    hud.showTimingBar(settings.timingBar);
    this.reset();
  }

  private autoIdx = 0;
  /** a vocal part: sung into the microphone, drawn as the vocal lane instead of the highway */
  private get vocals(): boolean {
    return this.setup.track.instrument === 'vocals';
  }

  private mic: Mic | null = null;

  /** The microphone to sing into (vocals; none for the bot). */
  setMic(mic: Mic | null): void {
    this.mic = mic;
  }

  /**
   * How far behind the song clock the judge runs: what the microphone hears now was sung this long ago
   * (vocals), or a little lag so late input events are not pre-empted.
   */
  private get judgeLag(): number {
    return this.vocals && this.mic ? this.mic.latency + JUDGE_LAG : JUDGE_LAG;
  }

  /** a drum part: pads and kick instead of frets and strums */
  private get drums(): boolean {
    return this.setup.track.instrument === 'drums';
  }
  /** intros and long breaks: counted down, and skippable */
  private gaps: Gap[] = [];
  /** how to skip, shown in the countdown (rebuilt when the controls in use change) */
  private skipHint = '';
  /** every note hit with no overstrum, settled when the last note is hit */
  private fullCombo = false;
  private prepared = false;

  /** Auto Star Power: once the bar is half full, set it off just before the next notes arrive. */
  private autoStarPower(t: number) {
    const e = this.engine;
    if (e.spActive || e.spBar < 0.5 || t < e.time - 0.01) return;
    const times = this.setup.track.notes.time;
    while (this.autoIdx < times.length && times[this.autoIdx] < t) this.autoIdx++;
    if (this.autoIdx < times.length && times[this.autoIdx] - t < 0.8) e.activateStarPower(t);
  }

  /** The source with the most fret presses; a guitar when nothing was pressed at all. */
  private playedWith(): PlayedWith {
    const p = this.presses;
    if (p.touch > p.kb && p.touch > p.pad) return 'touch';
    if (p.kb > p.pad) return 'keyboard';
    return 'guitar';
  }

  /**
   * Frames that cannot keep up with the display for ~3 s of play lower the graphics quality one step
   * (for the rest of the session), so a phone running Crystal stays smooth.
   */
  private checkFrameRate() {
    if (!settings.autoQuality) return;
    this.playedFor += 0.5;
    if (this.playedFor < 3 || !Number.isFinite(this.minDt)) return;
    const slow = this.fps < (1 / this.minDt) * 0.72;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    if (this.slowWindows < 6) return;
    this.slowWindows = 0;
    const current = effectiveQuality();
    const next = QUALITY_STEPS[QUALITY_STEPS.indexOf(current) + 1];
    if (!next) return;
    qualityCap = { cap: next, chosen: settings.quality };
    this.renderer.setQuality(next);
    this.hudCameraKey = '';
    this.hud.toast(`Graphics quality lowered to ${next}`, 'info', 'to keep the song smooth · Settings › Display turns this off');
  }

  private reset() {
    this.prepared = false;
    this.presses = { kb: 0, pad: 0, touch: 0 };
    this.autoIdx = 0;
    this.playedFor = 0;
    this.slowWindows = 0;
    const { track, chart, practice } = this.setup;
    const n = track.notes.length;
    // At another song speed the windows are kept the same length in real time (practice stays lenient).
    const scale = (practice ? 1 : this.rate) * windowScale(this.setup.mods ?? []);
    const cfg = { early: (settings.hitWindowMs / 1000) * scale, late: (settings.hitWindowMs / 1000) * scale, strumLeniency: (settings.strumLeniencyMs / 1000) * scale, rockLoss: ROCK_LOSS[track.difficulty] };
    const range = practice ? { first: practice.first, last: practice.last } : undefined;
    if (track.instrument === 'vocals') {
      const judge = new VocalJudge(track, chart.tempo, cfg, range);
      judge.autoSing = this.setup.bot;
      this.engine = judge;
    } else this.engine = new Engine(track, chart.tempo, cfg, range);
    this.base = baseScore(track, chart.tempo);
    this.sustainHeld = new Uint8Array(n);
    this.sustainDrop = new Float32Array(n).fill(NaN);
    this.missPulse = 0;
    this.lastTapStrum = -Infinity;
    this.laneHit.fill(0);
    this.laneWrong.fill(0);
    this.spReadyShown = false;
    this.sustainDrops = this.wrongFret = this.lateMiss = 0;
    this.soloHits = this.soloSeen = 0;
    this.sectionIdx = -1;
    this.beatIdx = 0;
    this.hud.resetRun();
    this.fullCombo = false;
    if (practice) {
      this.startTime = practice.start - 2 * practice.speed;
      this.endTime = practice.end + 1;
    } else {
      const first = track.notes.length ? track.notes.time[0] : 0;
      this.startTime = Math.min(0, first - 2.5);
      const last = chart.lastNoteTime;
      this.endTime = Math.max(last + 2.5, Math.min(this.setup.duration, last + 6));
    }
    this.gaps = practice ? findGaps(track.notes, this.startTime, practice.first, practice.last) : findGaps(track.notes, this.startTime);
    this.bot = this.setup.bot ? botActions(track, practice ? { from: practice.first, to: practice.last } : {}) : [];
    this.botIdx = 0;
  }

  /** Establish the final canvas layout before shader/target warm-up and before the audio clock runs. */
  prepareStart(): void {
    if (this.prepared) return;
    this.prepared = true;
    const { song, practice } = this.setup;
    const t = this.setup.track;
    const extras = [!practice && this.rate !== 1 ? `${Math.round(this.rate * 100)}%` : '', ...(this.setup.mods ?? []).filter(isModifier).map((m) => MODIFIER_LABEL[m])].filter(Boolean);
    this.hud.setTitle(song.name, song.artist, [`${INSTRUMENT_LABEL[t.instrument]} · ${t.difficulty}`, ...extras].join(' · '));
    this.hud.setSections(this.setup.chart.sections.map((s) => s.time), practice ? practice.start : this.startTime, this.endTime);
    // vocals: the lyrics are under the notes in the vocal lane
    this.hud.setLyrics(this.vocals ? [] : this.setup.chart.lyrics);
    this.hud.vocals.setTrack(this.vocals ? t : null);
    if (practice) this.hud.toast(`PRACTICE · ${practice.label}`, 'info', `${Math.round(practice.speed * 100)}% speed`);
    else if (this.rate !== 1) this.hud.toast(`${Math.round(this.rate * 100)}% SPEED`, 'info', this.rate < 1 ? 'best scores count at 100% and above' : undefined);
    const touch = !this.setup.bot && TouchFrets.wanted();
    // vocals on a touch screen: no pads, only Star Power and pause
    this.hud.touch.setVisible(touch, this.setup.track.instrument === 'touch' ? TOUCH_LANES : this.vocals ? [] : undefined);
    this.hud.onTouchPause = () => this.pause();
    this.hud.onSkip = () => void this.skipBreak();
    this.hud.setDrums(this.drums);
    // sung notes have no early or late
    this.hud.showTimingBar(settings.timingBar && !this.vocals);
    this.setKeyboardActive(!this.setup.bot && !input().hasPads && !touch);
  }

  start(): void {
    this.prepareStart();
    input().gameMode = true;
    input().setPollRate(4);
    input().clear();
    this.srcMask = { kb: 0, pad: input().padFretMask(), touch: 0 };
    audio().play(this.startTime, this.rate);
    this.awake.on();
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  setVideo(video: HTMLVideoElement, offsetSec: number): void {
    this.video = video;
    this.videoOffset = offsetSec;
    this.renderer.setVideo(video);
  }

  /** Keep a background video roughly in step with the song (it is decoration, not timing-critical). */
  private syncVideo(t: number) {
    const v = this.video;
    if (!v) return;
    const want = t + this.videoOffset;
    const rate = this.rate;
    if (this.paused || want < 0 || (v.duration && want > v.duration)) {
      if (!v.paused) v.pause();
      return;
    }
    if (v.playbackRate !== rate) v.playbackRate = rate;
    if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
    if (v.paused) void v.play().catch(() => {});
  }

  /** Song time the judge has reached. */
  get songPosition(): number {
    return Number.isFinite(this.engine.time) ? this.engine.time : this.startTime;
  }

  /** Snapshot for the pause screen. */
  get pauseStats(): { score: number; accuracy: number; section: string; time: number; total: number } {
    const secs = this.setup.chart.sections;
    const t = this.songPosition;
    let name = '';
    for (const s of secs) if (s.time <= t) name = s.name;
    const e = this.engine;
    const judged = e.hits + e.misses;
    return { score: e.score, accuracy: judged ? e.hits / judged : 1, section: name, time: Math.max(0, t), total: this.endTime };
  }

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    if (this.paused || this.ended) return;
    this.paused = true;
    this.awake.off();
    audio().stop();
    input().gameMode = false;
    input().setPollRate(16);
    this.onPause?.();
  }

  resume(): void {
    if (!this.paused) return;
    const at = this.engine.time;
    const rate = this.rate;
    // Rewind a little so notes approach again; judged notes stay judged.
    this.resumeAt = Number.isFinite(at) ? at : this.startTime;
    this.unpause(Math.max(this.startTime, this.resumeAt - 2 * rate));
  }

  private unpause(from: number) {
    this.paused = false;
    this.pausedDrawn = false;
    audio().play(from, this.rate);
    this.awake.on();
    // the audio rewinds: let the beat pulse find its place again
    this.beatIdx = 0;
    input().gameMode = true;
    input().setPollRate(4);
    input().clear();
    this.srcMask = { kb: 0, pad: input().padFretMask(), touch: 0 };
    this.lastFrame = performance.now();
  }

  /** Playback speed: the practice speed, or the song speed. */
  get rate(): number {
    return this.setup.practice?.speed ?? this.setup.speed ?? 1;
  }

  /** Song time now: the audio clock while playing, where the judge stopped while paused. */
  private get now(): number {
    return this.paused ? this.songPosition : audio().songTime(performance.now());
  }

  /** The intro or break the song is in, if skipping it would save some waiting; for the pause menu. */
  get skippable(): 'intro' | 'break' | null {
    if (this.ended) return null;
    const t = this.now;
    const g = gapAt(this.gaps, t);
    return g && canSkip(g, t, this.rate) ? (g.intro ? 'intro' : 'break') : null;
  }

  /**
   * Jump to a few seconds before the next note, from inside an intro or a long break (paused or not).
   * Returns false when there is nothing worth skipping.
   */
  skipBreak(): boolean {
    if (this.ended) return false;
    const t = this.now;
    const g = gapAt(this.gaps, t);
    if (!g || !canSkip(g, t, this.rate)) return false;
    const target = skipTarget(g, this.rate);
    this.resumeAt = -Infinity;
    if (this.paused) this.unpause(target);
    else audio().play(target, this.rate);
    return true;
  }

  /** Switch to another difficulty's track and start the song over. */
  changeTrack(track: Track): void {
    this.setup.track = track;
    this.rs.notes = track.notes;
    this.restart();
  }

  restart(): void {
    this.paused = false;
    this.ended = false;
    this.resumeAt = -Infinity;
    this.reset();
    this.start();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.awake.off();
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    audio().stop();
    input().gameMode = false;
    input().setPollRate(16);
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- frame

  private readonly awake = new ScreenAwake();
  /** shortest frame interval seen: the display's own refresh */
  private minDt = Infinity;
  private slowWindows = 0;
  private playedFor = 0;
  private cpuMs = 0;
  private worstAcc = 0;
  private worstFrame = 0;
  private pausedDrawn = false;
  private hudCameraKey = '';
  private readonly p0 = new Float64Array(2);
  private readonly p1 = new Float64Array(2);
  private readonly p2 = new Float64Array(2);
  private readonly p3 = new Float64Array(2);
  private readonly lanePts = Array.from({ length: 5 }, () => new Float64Array(2));
  /** the keyboard played the last fret press: key labels show under the frets */
  private kbActive = false;
  private readonly hs: HudState = { score: 0, multiplier: 1, streak: 0, spBar: 0, spActive: false, stars: 0, accuracy: 1, progress: 0, elapsed: 0, total: 0, spSeconds: 0, fps: 0, cpuMs: 0, worstMs: 0, showFps: false, rock: 0.5, rockOn: false };
  private rs!: RenderState;

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Nothing moves while paused: draw one frame for the menu backdrop, then idle.
    if (this.paused && this.pausedDrawn) return;
    this.pausedDrawn = this.paused;
    const cpuStart = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (dt > this.worstAcc) this.worstAcc = dt;
    if (dt > 0.004) this.minDt = Math.min(this.minDt, dt);
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.worstFrame = this.worstAcc;
      this.fpsAcc = this.fpsFrames = this.worstAcc = 0;
      if (!this.paused) this.checkFrameRate();
    }

    const a = audio();
    a.sync(now);
    const t = a.songTime(now);
    const engine = this.engine;
    this.syncVideo(t);

    if (!this.paused) {
      const inp = input();
      inp.poll();
      const events = inp.drain();
      for (let i = 0; i < events.length; i++) this.handleInput(events[i]);
      if (this.setup.bot) {
        while (this.botIdx < this.bot.length && this.bot[this.botIdx].t <= t) applyAction(engine, this.bot[this.botIdx++]);
      } else if (t >= engine.time) {
        engine.setWhammy(t, inp.whammy(now));
      }
      if (this.vocals) this.listen(t);
      engine.advance(t - this.judgeLag);
      if (settings.autoStarPower && !this.setup.bot) this.autoStarPower(t);
      for (let i = 0; i < engine.pendingEvents; i++) this.handleEvent(engine.event(i));
      engine.clearEvents();
    }

    // countdown after resuming
    this.hud.setCountdown(t < this.resumeAt ? Math.ceil((this.resumeAt - t) / this.rate) : 0);
    this.updateBreak(t);

    // decays
    const hitDecay = Math.exp(-dt * 9);
    const wrongDecay = Math.exp(-dt * 5);
    for (let i = 0; i < 5; i++) {
      this.laneHit[i] *= hitDecay;
      this.laneWrong[i] *= wrongDecay;
    }
    this.missPulse *= Math.exp(-dt * 4.5);

    const chart = this.setup.chart;
    const beats = chart.beats;
    while (this.beatIdx + 1 < beats.length && beats.time[this.beatIdx + 1] <= t) this.beatIdx++;
    const bt = beats.time[this.beatIdx];
    const beatPulse = beats.length && t >= bt ? Math.exp(-(t - bt) * 7) * (beats.kind[this.beatIdx] === 0 ? 1 : 0.5) : 0;

    const secs = chart.sections;
    let si = this.sectionIdx;
    while (si + 1 < secs.length && secs[si + 1].time <= t) si++;
    if (si !== this.sectionIdx) {
      this.sectionIdx = si;
      if (si >= 0) this.hud.setSection(secs[si].name);
    }
    this.hud.showLyrics(settings.lyrics);
    this.hud.setLyricsTime(t);

    let sustainMask = 0;
    let sustainSp = false;
    this.sustainHeld.fill(0);
    const sus = engine.sustains;
    for (let i = 0; i < sus.length; i++) {
      const s = sus[i];
      this.sustainHeld[s.note] = 1;
      sustainMask |= s.mask;
      if (s.sp >= 0 && !engine.spBroken[s.sp]) sustainSp = true;
    }
    if (!this.paused && !this.vocals) this.renderer.sustainSparks(sustainMask, sustainSp || engine.spActive, dt);
    if (this.vocals) this.hud.vocals.draw(t - this.judgeLag, engine as VocalJudge);

    // The render and HUD state objects are reused every frame (no per-frame garbage).
    const rs = this.rs;
    rs.time = t + settings.videoOffsetMs / 1000;
    rs.dt = this.paused ? 0 : dt;
    rs.speed = BASE_SPEED * settings.noteSpeed;
    rs.length = settings.highwayLength;
    rs.noteState = engine.noteState;
    rs.spBroken = engine.spBroken;
    rs.sustainHeld = this.sustainHeld;
    rs.sustainDrop = this.sustainDrop;
    rs.sustainMask = sustainMask;
    rs.frets = this.drums ? (this.srcMask.kb | this.srcMask.pad | this.srcMask.touch) & DRUM_PADS_ALL : this.setup.bot ? engine.frets : this.srcMask.kb | this.srcMask.pad | this.srcMask.touch;
    rs.drums = this.drums;
    rs.noHighway = this.vocals;
    rs.spActive = engine.spActive;
    rs.multiplier = engine.multiplier > 4 ? 4 : engine.multiplier;
    rs.missPulse = this.missPulse;
    rs.whammy = this.setup.bot ? 0.5 + 0.5 * Math.sin(now / 60) : engine.whammy;
    rs.lefty = settings.lefty;
    rs.laneMask = this.setup.track.instrument === 'touch' ? 0b10101 : this.drums ? DRUM_PADS_ALL : 0b11111;
    rs.solo = engine.activeSolo >= 0;
    rs.beatPulse = beatPulse;
    rs.theme = renderTheme();
    rs.skin = noteSkin();
    const r = this.renderer;
    r.render(rs);
    if (r.cameraKey !== this.hudCameraKey) {
      this.hudCameraKey = r.cameraKey;
      const half = r.highwayHalfWidth;
      this.hud.layout(r.toScreen(-half - 0.25, 0, 0.3, this.p0), r.toScreen(half + 0.25, 0, 0.3, this.p1), r.toScreen(0, 0, 0.9, this.p2), r.toScreen(0, 0, -15, this.p3));
      for (let i = 0; i < 5; i++) {
        // drums: four pad keys, and the kick's centred below them
        if (this.drums && i === 4) r.toScreen(0, 0, 1.1, this.lanePts[i]);
        else r.toScreen(r.laneX(i), 0, 0.55, this.lanePts[i]);
      }
      this.hud.layoutKeys(this.lanePts);
    }
    this.hud.setKeysDown(this.srcMask.kb);
    const practice = this.setup.practice;
    const hs = this.hs;
    hs.score = engine.score;
    hs.multiplier = engine.multiplier;
    hs.streak = engine.streak;
    hs.spBar = engine.spBar;
    hs.spActive = engine.spActive;
    hs.stars = starProgress(engine.score, this.base);
    const spanStart = practice ? practice.start : 0;
    const span = practice ? practice.end - practice.start : Math.max(1, this.endTime);
    hs.progress = (t - spanStart) / span;
    hs.elapsed = t - spanStart;
    hs.total = span;
    const judged = engine.hits + engine.misses;
    hs.accuracy = judged ? engine.hits / judged : 1;
    // Star Power drains one full bar over 32 beats: estimate the seconds left from the current beat length
    const bi = Math.min(this.beatIdx, beats.length - 2);
    hs.spSeconds = bi >= 0 ? engine.spBar * 32 * (beats.time[bi + 1] - beats.time[bi]) : 0;
    hs.fps = this.fps;
    hs.cpuMs = this.cpuMs;
    hs.worstMs = this.worstFrame * 1000;
    hs.showFps = settings.showFps;
    hs.rock = engine.rock;
    hs.rockOn = settings.rockMeter !== 'off' && !this.setup.bot && !practice;
    this.hud.update(hs);

    // Fail mode: the rock meter ran out (not in practice, nor for the bot).
    if (!this.ended && this.canFail && engine.rockOutAt === engine.rockOutAt) this.fail(engine.rockOutAt);
    if (!this.paused && !this.ended && t > this.endTime) {
      if (practice) this.loopPractice();
      else this.finish();
    }
    this.cpuMs += (performance.now() - cpuStart - this.cpuMs) * 0.05;
  };

  /** The countdown through an intro or long break, hidden for its last second (the notes are in sight). */
  private updateBreak(t: number) {
    const g = settings.breakCountdown && !this.ended && t >= this.resumeAt ? gapAt(this.gaps, t) : null;
    const rate = this.rate;
    if (!g || (g.to - t) / rate < 1) {
      this.hud.setBreak(0, 0, 0, null);
      return;
    }
    this.hud.setBreak(g.intro ? 1 : 2, (g.to - t) / rate, (t - g.from) / (g.to - g.from), canSkip(g, t, rate) ? this.skipHint : null);
  }

  /** Vocals: hand the judge what the microphone hears (the bot sings the notes themselves, for show). */
  private listen(t: number) {
    const judge = this.engine as VocalJudge;
    const at = t - this.judgeLag;
    if (this.mic) {
      const r = this.mic.read();
      judge.sing(at, r.pitch, r.level > SILENCE_RMS * 2);
      this.hud.vocals.push(at, r.pitch);
    } else if (this.setup.bot) {
      const N = this.setup.track.notes;
      let p = NaN;
      for (let i = judge.nextNote; i < N.length && N.time[i] <= at; i++) if (at < N.endTime[i] && N.type[i] === 0) p = N.mask[i];
      this.hud.vocals.push(at, p);
    }
  }

  /** Vocals: no frets to play; they only make the skip chord. Pause and Star Power work as ever. */
  private vocalInput(ev: InputEvent, t: number) {
    const fret = FRET_INDEX[ev.action];
    if (fret >= 0) {
      if (ev.down) this.srcMask[ev.source] |= 1 << fret;
      else this.srcMask[ev.source] &= ~(1 << fret);
      if (ev.down && ((this.srcMask.kb | this.srcMask.pad | this.srcMask.touch) & SKIP_CHORD) === SKIP_CHORD) this.skipBreak();
      return;
    }
    if (!ev.down) return;
    if (ev.action === 'start') this.pause();
    else if ((ev.action === 'starPower' || ev.action === 'tilt') && !this.setup.bot && t >= this.engine.time - 0.01) this.engine.activateStarPower(t);
  }

  /** Drums: pads and the kick are hits (no strum); held keys only light the pads. */
  private drumInput(ev: InputEvent, t: number) {
    const e = this.engine;
    const bit = DRUM_HIT[ev.action];
    if (bit === undefined) {
      if (!ev.down) return;
      if (ev.action === 'start') this.pause();
      // Space is the kick on drums, not Star Power (Shift or select still is)
      else if ((ev.action === 'starPower' || ev.action === 'tilt') && !(ev.source === 'kb' && input().keys.kick.includes(ev.code)) && !this.setup.bot && t >= e.time - 0.01) e.activateStarPower(t);
      return;
    }
    if (ev.down) this.srcMask[ev.source] |= bit;
    else this.srcMask[ev.source] &= ~bit;
    if (!ev.down) return;
    if (!this.setup.bot && (ev.source === 'kb') !== this.kbActive) this.setKeyboardActive(ev.source === 'kb');
    const held = this.srcMask.kb | this.srcMask.pad | this.srcMask.touch;
    if ((held & DRUM_PADS_ALL) === DRUM_PADS_ALL) this.skipBreak();
    if (this.setup.bot || t < e.time - 0.01) return;
    this.presses[ev.source]++;
    // in a long silence, reaching for the skip chord hits nothing
    if (canSkip(gapAt(this.gaps, t), t, this.rate)) return;
    e.pad(t, bit === KICK_BIT ? 0 : bit);
  }

  private handleInput(ev: InputEvent) {
    const a = audio();
    const e = this.engine;
    const t = a.songTime(ev.time);
    if (this.drums) {
      this.drumInput(ev, t);
      return;
    }
    if (this.vocals) {
      this.vocalInput(ev, t);
      return;
    }
    const fret = FRET_INDEX[ev.action];
    if (fret >= 0) {
      if (ev.down && !this.setup.bot && (ev.source === 'kb') !== this.kbActive) this.setKeyboardActive(ev.source === 'kb');
      const bit = 1 << fret;
      if (ev.down) this.srcMask[ev.source] |= bit;
      else this.srcMask[ev.source] &= ~bit;
      // Red + yellow + blue + orange held together skips an intro or long break.
      if (ev.down && ((this.srcMask.kb | this.srcMask.pad | this.srcMask.touch) & SKIP_CHORD) === SKIP_CHORD) this.skipBreak();
      if (this.setup.bot) return;
      if (ev.down && t >= e.time - 0.01) this.presses[ev.source]++;
      e.setFrets(Math.max(t, e.time), this.srcMask.kb | this.srcMask.pad | this.srcMask.touch);
      // Tap mode: the press is the strum (always on touch screens, optional on the keyboard). The
      // engine's strum leniency waits for the rest of a chord, so only the first fret of a chord strums.
      const taps = ev.source === 'touch' || (ev.source === 'kb' && settings.kbTapMode);
      // Fret presses in a long silence are not strums: reaching for the skip chord costs nothing.
      const quiet = canSkip(gapAt(this.gaps, t), t, this.rate);
      if (ev.down && taps && !quiet && t >= e.time - 0.01 && !(Math.abs(t - this.lastTapStrum) <= TAP_CHORD_WINDOW)) {
        this.lastTapStrum = t;
        e.strum(t);
      }
      return;
    }
    if (!ev.down) return;
    if (ev.action === 'start') {
      this.pause();
      return;
    }
    if (this.setup.bot || t < e.time - 0.01) return; // replaying the rewind after a pause
    if (ev.action === 'strumUp' || ev.action === 'strumDown') e.strum(t);
    else if (ev.action === 'starPower' || ev.action === 'tilt') e.activateStarPower(t);
  }

  private lastTapStrum = -Infinity;
  private lastMuffle = -1;

  private setKeyboardActive(on: boolean) {
    this.kbActive = on;
    const keys = input().keys;
    const label = (a: keyof typeof keys) => (keys[a]?.[0] ? keyLabel(keys[a][0]) : '');
    if (this.vocals) {
      this.hud.setKeyLabels(null);
      this.skipHint = on ? FRET_ACTIONS.slice(1).map(label).join(' ') : 'red + yellow + blue + orange';
      return;
    }
    if (this.drums) {
      // four pads, and the kick under them
      const pads = (['red', 'yellow', 'blue', 'orange'] as const).map(label);
      this.hud.setKeyLabels(on ? [...pads, `${label('kick')} kick`] : null);
      this.skipHint = on ? pads.join(' ') : 'red + yellow + blue + green pads';
      return;
    }
    const labels = FRET_ACTIONS.map((a) => (keys[a]?.[0] ? keyLabel(keys[a][0]) : ''));
    this.hud.setKeyLabels(on ? labels : null);
    // The touch part has no red or blue pad: the skip button is the way there.
    const touchOnly = this.setup.track.instrument === 'touch' && TouchFrets.wanted() && !on;
    this.skipHint = touchOnly ? '' : on ? labels.slice(1).join(' ') : 'red + yellow + blue + orange';
  }
  private lastClank = -1;

  private missAudio(t: number) {
    const a = audio();
    const mode = settings.missFeedback;
    if (mode === 'off') return;
    if ((mode === 'auto' || mode === 'mute') && a.hasPlayerStem) a.setPlayerAudible(false);
    else if (Math.abs(t - this.lastMuffle) > 0.12) {
      this.lastMuffle = t;
      a.muffleHit();
    }
  }

  /** A burst of misses should not machine-gun clanks (each one is also a new audio node). */
  private clank(t: number, gain: number, spread: number) {
    if (!settings.missSounds || Math.abs(t - this.lastClank) < 0.07) return;
    this.lastClank = t;
    audio().playSfx('clank', gain, (Math.random() - 0.5) * spread);
  }

  private handleEvent(ev: EngineEvent) {
    const a = audio();
    const notes = this.setup.track.notes;
    const engine = this.engine;
    switch (ev.type) {
      case 'hit': {
        const mask = notes.mask[ev.note];
        const sp = notes.sp[ev.note];
        a.setPlayerAudible(true);
        if (!this.vocals) {
          for (let i = 0; i < 5; i++) if (mask & (1 << i) || mask === 0) this.laneHit[i] = 1;
          this.renderer.hitBurst(mask, engine.spActive || (sp >= 0 && !engine.spBroken[sp]));
        }
        if (!ev.auto) this.hud.timingTick(ev.delta);
        // The final note of a flawless run: that settles the full combo (a stray strum once the notes
        // are over does not take it back), and it is celebrated straight away.
        if (engine.hits === notes.length && engine.overstrums === 0 && !this.setup.practice) {
          this.fullCombo = true;
          if (!this.setup.bot) {
            a.playSfx('fullCombo', 0.9);
            this.hud.fullCombo();
          }
        }
        if (engine.activeSolo >= 0 && notes.solo[ev.note] === engine.activeSolo) {
          this.soloHits++;
          this.soloSeen++;
          this.updateSolo();
        }
        break;
      }
      case 'miss': {
        const mask = notes.mask[ev.note];
        // the guide vocals keep playing over a missed note
        if (!this.vocals) this.missAudio(ev.t);
        if (ev.reason === 'wrong') this.wrongFret++;
        else this.lateMiss++;
        if (ev.reason === 'wrong') {
          this.clank(ev.t, 0.9, 200);
          this.missPulse = 1;
          // Show which frets were wrong (red) and which were wanted (bright hint).
          for (let i = 0; i < 5; i++) {
            const bit = 1 << i;
            if (ev.frets & bit && !(mask & bit)) this.laneWrong[i] = 1;
            if (mask & bit && !(ev.frets & bit)) this.laneHit[i] = Math.max(this.laneHit[i], 0.45);
          }
          if (ev.frets === 0 && mask !== 0) for (let i = 0; i < 5; i++) if (mask & (1 << i)) this.laneWrong[i] = 0.6;
        } else {
          this.missPulse = Math.max(this.missPulse, 0.4);
        }
        this.hud.missTick();
        if (engine.activeSolo >= 0 && notes.solo[ev.note] === engine.activeSolo) {
          this.soloSeen++;
          this.updateSolo();
        }
        break;
      }
      case 'overstrum': {
        this.missAudio(ev.t);
        this.clank(ev.t, 0.8, 300);
        this.missPulse = 1;
        let any = false;
        for (let i = 0; i < 5; i++) {
          if (ev.frets & (1 << i)) {
            this.laneWrong[i] = 1;
            any = true;
          }
        }
        if (!any) this.laneWrong.fill(0.5);
        this.hud.missTick();
        break;
      }
      case 'streakBreak':
        if (ev.streak >= 25) {
          if (settings.missSounds) a.playSfx('streakBreak', 0.7);
          this.hud.streakLost(ev.streak);
          this.hud.toast('STREAK LOST', 'bad', `${ev.streak} notes`);
        }
        break;
      case 'sustainDrop':
        this.sustainDrop[ev.note] = ev.t;
        this.sustainDrops++;
        this.missAudio(ev.t);
        break;
      case 'spPhrase':
        if (ev.complete) {
          a.playSfx('spPhrase', 0.8);
          if (engine.spBar >= 0.5 && !engine.spActive && !this.spReadyShown) {
            this.spReadyShown = true;
            a.playSfx('spReady', 0.7);
            this.hud.toast('STAR POWER READY', 'sp', 'tilt or press select');
          }
        }
        break;
      case 'spActivate':
        a.playSfx('spActivate', 0.9);
        this.renderer.starPowerBurst();
        this.hud.toast('STAR POWER!', 'sp');
        this.spReadyShown = false;
        break;
      case 'spEnd':
        a.playSfx('spEnd', 0.6);
        break;
      case 'vocalPhrase': {
        const rating = PHRASE_RATINGS[ev.value];
        this.hud.toast(rating.toUpperCase(), ev.value >= 4 ? 'streak' : ev.value <= 1 ? 'bad' : 'info', `${ev.hits} / ${ev.total} notes`);
        break;
      }
      case 'soloStart':
        this.soloHits = this.soloSeen = 0;
        this.updateSolo();
        break;
      case 'soloEnd': {
        if (ev.hits === ev.total) a.playSfx('soloEnd', 0.8);
        this.hud.soloResult(ev.hits, ev.total, ev.bonus);
        break;
      }
      default:
        break;
    }
  }

  private updateSolo() {
    const s = this.setup.track.solos[this.engine.activeSolo];
    if (!s) return;
    this.hud.setSolo(true, this.soloHits, s.last - s.first + 1, this.soloSeen);
  }

  private loopPractice() {
    const p = this.setup.practice!;
    const e = this.engine;
    const total = p.last - p.first + 1;
    let hits = 0;
    for (let i = p.first; i <= p.last; i++) if (e.noteState[i] === HIT) hits++;
    this.loops++;
    this.hud.toast(`${Math.round((hits / Math.max(1, total)) * 100)}%`, hits === total ? 'solo' : 'info', `loop ${this.loops}: ${hits}/${total}`);
    this.reset();
    audio().play(this.startTime, p.speed);
  }

  private get canFail(): boolean {
    return settings.rockMeter === 'fail' && !this.setup.bot && !this.setup.practice;
  }

  /** The rock meter ran out: the band winds down, SONG FAILED, then the results of what was played. */
  private fail(at: number) {
    this.ended = true;
    const a = audio();
    a.failOut();
    a.playSfx('streakBreak', 0.9);
    this.hud.songFailed();
    this.missPulse = 1;
    setTimeout(() => {
      a.stop();
      this.finish(at);
    }, 2400);
  }

  private finish(failedAt?: number) {
    this.ended = true;
    const e = this.engine;
    const { track, chart } = this.setup;
    // A failed run only counts the notes reached before the fail.
    const all = track.notes;
    const notes = failedAt === undefined ? all : { ...all, length: e.nextNote };
    const missByLane = [0, 0, 0, 0, 0];
    const missByType = { strum: 0, hopo: 0, tap: 0 };
    let missChords = 0;
    let missOpen = 0;
    const deltas: number[] = [];
    const sung = this.vocals;
    for (let i = 0; i < notes.length; i++) {
      if (e.noteState[i] === HIT) {
        // vocal notes have no timing to show
        if (!sung) deltas.push(e.hitDelta[i]);
        continue;
      }
      if (sung) {
        if (notes.type[i] === TAP) missByType.tap++;
        else missByType.strum++;
        continue;
      }
      const mask = notes.mask[i];
      for (let l = 0; l < 5; l++) if (mask & (1 << l)) missByLane[l]++;
      if (GEM_COUNT[mask] > 1) missChords++;
      if (mask === 0) missOpen++;
      if (notes.type[i] === HOPO) missByType.hopo++;
      else if (notes.type[i] === TAP) missByType.tap++;
      else missByType.strum++;
    }
    const secs = chart.sections;
    const sections: SectionResult[] = [];
    let ni = 0;
    for (let s = 0; s < Math.max(1, secs.length); s++) {
      const start = secs.length ? secs[s].time : -Infinity;
      const end = s + 1 < secs.length ? secs[s + 1].time : Infinity;
      let hits = 0;
      let total = 0;
      while (ni < notes.length && notes.time[ni] < start) ni++;
      for (; ni < notes.length && notes.time[ni] < end; ni++) {
        total++;
        if (e.noteState[ni] === HIT) hits++;
      }
      if (total) sections.push({ name: secs.length ? secs[s].name : 'Song', time: secs.length ? start : 0, hits, total });
    }
    const solos = track.solos.map((s) => {
      let hits = 0;
      for (let i = s.first; i <= s.last; i++) if (e.noteState[i] === HIT) hits++;
      return { hits, total: s.last - s.first + 1 };
    });
    const result: GameResult = {
      setup: this.setup,
      score: Math.floor(e.score),
      stars: starProgress(e.score, this.base),
      hits: e.hits,
      total: notes.length,
      misses: e.misses,
      overstrums: e.overstrums,
      sustainDrops: this.sustainDrops,
      maxStreak: e.maxStreak,
      spPhrases: e.spPhrasesHit,
      spPhrasesTotal: track.starPower.length,
      solos,
      sections,
      deltas,
      missByLane,
      missChords,
      missOpen,
      missByType,
      wrongFret: this.wrongFret,
      lateMiss: this.lateMiss,
      overhits: e.overhits,
      ratings: e instanceof VocalJudge ? [...e.ratings] : undefined,
      input: this.playedWith(),
      fullCombo: this.setup.practice ? e.misses === 0 && e.overstrums === 0 && notes.length > 0 : this.fullCombo,
      noteState: e.noteState.slice(),
      hitDelta: e.hitDelta.slice(),
      start: Math.min(0, notes.length ? notes.time[0] : 0),
      end: failedAt === undefined ? Math.max(this.endTime, notes.length ? notes.time[notes.length - 1] + 1 : 1) : failedAt + 1,
      failedAt,
    };
    setTimeout(() => this.onEnd?.(result), failedAt === undefined ? 600 : 0);
  }
}
