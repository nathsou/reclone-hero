import { SongClock } from './songClock.ts';
import type { Instrument } from '../chart/types.ts';
import { settings } from '../settings.ts';
import { synthesizeSfx } from './sfx.ts';
import type { SfxName } from './sfx.ts';

const PLAYER_STEMS: Record<Instrument, string[]> = {
  guitar: ['guitar'],
  guitarcoop: ['guitar'],
  bass: ['bass'],
  rhythm: ['rhythm'],
  keys: ['keys'],
  drums: ['drums', 'drums_1', 'drums_2', 'drums_3', 'drums_4'],
  // the guide vocals stay in the band's mix: a missed note is not silenced
  vocals: [],
  touch: ['guitar'],
};

export interface StemFile {
  stem: string;
  bytes: Uint8Array;
}

export interface LoadedSong {
  duration: number;
  hasPlayerStem: boolean;
}

/**
 * Owns the AudioContext: song playback, the master song clock, miss feedback and sound effects.
 *
 * Graph: player stem -> playerVol -> missGain ┐
 *        backing ---------------> backingVol ─┼-> musicBus -> muffle (lowpass) -> master -> out
   (crowd is pre-mixed into backing at load)
 *        sfx ---------------------------------------------------------------> sfxVol -> master
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly musicBus: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly playerVol: GainNode;
  private readonly missGain: GainNode;
  private readonly backingVol: GainNode;
  private readonly sfxVol: GainNode;
  private readonly sfx: Record<SfxName, AudioBuffer[]>;
  /**
   * Reused per-sound gain nodes, so a sound effect only creates its (one-shot) source node. A node is
   * reused only once its last sound has finished, so a long one (the full-combo fanfare) keeps its level.
   */
  private readonly sfxGains: { node: GainNode; busyUntil: number }[] = [];

  private player: AudioBuffer | null = null;
  private backing: AudioBuffer | null = null;
  private sources: AudioBufferSourceNode[] = [];
  /** song time at which the buffers begin (non-zero for practice excerpts) */
  private origin = 0;

  private playing = false;
  private startCtx = 0;
  private startSong = 0;
  private rate = 1;
  private pausedAt = 0;
  private readonly clock = new SongClock();
  private loadGeneration = 0;
  private playerAudible = true;

  constructor() {
    // iPhones mute Web Audio with the ring/silent switch unless the page says it plays media.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    this.musicBus = c.createGain();
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.9;
    this.playerVol = c.createGain();
    this.missGain = c.createGain();
    this.backingVol = c.createGain();
    this.sfxVol = c.createGain();
    this.playerVol.connect(this.missGain).connect(this.musicBus);
    this.backingVol.connect(this.musicBus);
    this.musicBus.connect(this.muffle).connect(this.master);
    this.sfxVol.connect(this.master);
    this.master.connect(c.destination);
    this.applyVolumes();
    for (let i = 0; i < 12; i++) this.addSfxGain();

    const raw = synthesizeSfx(c.sampleRate);
    this.sfx = {} as Record<SfxName, AudioBuffer[]>;
    for (const [name, list] of Object.entries(raw) as [SfxName, Float32Array[]][]) {
      this.sfx[name] = list.map((data) => {
        const b = c.createBuffer(1, data.length, c.sampleRate);
        b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
        return b;
      });
    }
  }

  applyVolumes(): void {
    this.master.gain.value = settings.volMaster;
    this.playerVol.gain.value = settings.volInstrument;
    this.backingVol.gain.value = settings.volSong;
    this.sfxVol.gain.value = settings.volSfx;
  }

  /** Must be called from a user gesture at least once. */
  resume(): Promise<void> {
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  // ---------------------------------------------------------------- loading

  async loadSong(files: AsyncIterable<StemFile> | Iterable<StemFile>, instrument: Instrument, onProgress?: (done: number, total: number) => void, signal?: AbortSignal, total = Array.isArray(files) ? files.length : 0): Promise<LoadedSong> {
    this.unload();
    const generation = this.loadGeneration;
    const check = () => {
      signal?.throwIfAborted();
      if (generation !== this.loadGeneration) throw new DOMException('Song load superseded', 'AbortError');
    };
    const playerStems = PLAYER_STEMS[instrument];
    let backing: AudioBuffer | null = null;
    let player: AudioBuffer | null = null;
    let done = 0;
    for await (const f of files) {
      check();
      if (f.stem === 'preview') continue;
      let buf: AudioBuffer;
      try {
        const ab = f.bytes.byteOffset === 0 && f.bytes.byteLength === f.bytes.buffer.byteLength ? (f.bytes.buffer as ArrayBuffer) : (f.bytes.slice().buffer as ArrayBuffer);
        buf = await this.ctx.decodeAudioData(ab);
      } catch (err) {
        check();
        console.warn(`Could not decode ${f.stem}`, err);
        onProgress?.(++done, total);
        continue;
      }
      check();
      if (playerStems.includes(f.stem)) player = this.accumulate(player, buf);
      else backing = this.accumulate(backing, buf, f.stem === 'crowd' ? settings.volCrowd : 1);
      onProgress?.(++done, total);
    }
    check();
    this.player = player;
    this.backing = backing;
    return { duration: Math.max(player?.duration ?? 0, backing?.duration ?? 0), hasPlayerStem: player !== null };
  }

  /** Built-ins already have device-rate PCM: no WAV round trip or decoder resampling. */
  loadPcm(files: { stem: string; channels: Float32Array[] }[], sampleRate: number, instrument: Instrument): LoadedSong {
    this.unload();
    let player: AudioBuffer | null = null;
    let backing: AudioBuffer | null = null;
    for (const file of files) {
      const buf = this.ctx.createBuffer(file.channels.length, file.channels[0].length, sampleRate);
      file.channels.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
      if (PLAYER_STEMS[instrument].includes(file.stem)) player = this.accumulate(player, buf);
      else backing = this.accumulate(backing, buf);
    }
    this.player = player;
    this.backing = backing;
    return { duration: Math.max(player?.duration ?? 0, backing?.duration ?? 0), hasPlayerStem: player !== null };
  }

  /** Fold each decoded stem immediately; never retain an array of full decoded drum parts. */
  private accumulate(out: AudioBuffer | null, buf: AudioBuffer, gain = 1): AudioBuffer {
    if (!out && gain === 1) return buf;
    const channels = Math.max(out?.numberOfChannels ?? 0, buf.numberOfChannels);
    const length = Math.max(out?.length ?? 0, buf.length);
    if (!out || out.length < length || out.numberOfChannels < channels) {
      const grown = this.ctx.createBuffer(channels, length, this.ctx.sampleRate);
      if (out) for (let ch = 0; ch < channels; ch++) grown.copyToChannel(out.getChannelData(Math.min(ch, out.numberOfChannels - 1)), ch);
      out = grown;
    }
    for (let ch = 0; ch < channels; ch++) {
      const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
      const dst = out.getChannelData(ch);
      for (let i = 0; i < src.length; i++) dst[i] += src[i] * gain;
    }
    return out;
  }

  /** Let the output clock become available before scheduling the first notes. Bounded for devices
   * that never expose output timestamps; their normal latency estimate remains the fallback. */
  async prepareClock(signal: AbortSignal): Promise<void> {
    const until = performance.now() + 300;
    let previous = 0;
    do {
      signal.throwIfAborted();
      const ts = this.ctx.getOutputTimestamp();
      if (previous > 0 && (ts.contextTime ?? 0) > previous && (ts.performanceTime ?? 0) > 0) return;
      previous = ts.contextTime ?? 0;
      await new Promise<void>(resolve => setTimeout(resolve, 16));
    } while (performance.now() < until);
    signal.throwIfAborted();
  }

  /** Replace playback buffers, e.g. with time-stretched practice audio. */
  setBuffers(b: { player: AudioBuffer | null; backing: AudioBuffer | null; origin: number }): void {
    this.stop();
    this.player = b.player;
    this.backing = b.backing;
    this.origin = b.origin;
  }

  get buffers() {
    return { player: this.player, backing: this.backing, origin: this.origin };
  }

  unload(): void {
    this.loadGeneration++;
    this.stop();
    this.player = this.backing = null;
    this.pausedAt = 0;
    this.origin = 0;
  }

  // ---------------------------------------------------------------- transport

  /**
   * Start playback so that (calibrated) song time `from` is heard shortly. `from` may be negative
   * for a lead-in. With rate != 1 the buffers are expected to be time-stretched by that rate.
   */
  play(from: number, rate = 1): void {
    this.stop();
    const when = this.ctx.currentTime + 0.06;
    const rawFrom = from + settings.audioOffsetMs / 1000;
    this.rate = rate;
    this.startCtx = when;
    this.startSong = rawFrom;
    const bufOffset = (rawFrom - this.origin) / rate;
    for (const [buf, dest] of [
      [this.player, this.playerVol],
      [this.backing, this.backingVol],
    ] as const) {
      if (!buf) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      if (bufOffset >= 0) {
        if (bufOffset < buf.duration) src.start(when, bufOffset);
      } else src.start(when - bufOffset, 0);
      this.sources.push(src);
    }
    this.playing = true;
    this.clock.reset();
    this.sync(performance.now());
    this.setPlayerAudible(true, true);
    // a failed song faded the band out
    this.musicBus.gain.cancelScheduledValues(0);
    this.musicBus.gain.value = 1;
  }

  stop(): void {
    if (this.playing) this.pausedAt = this.songTime(performance.now());
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
      s.disconnect();
    }
    this.sources = [];
    this.playing = false;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Raw estimate of the song position currently leaving the speakers. */
  private rawSongTime(perf: number): number {
    const ts = this.ctx.getOutputTimestamp();
    let ctxTime: number;
    if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0 && ts.contextTime > 0) {
      ctxTime = ts.contextTime + (perf - ts.performanceTime) / 1000;
    } else {
      ctxTime = this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    }
    return this.startSong + (ctxTime - this.startCtx) * this.rate;
  }

  /**
   * Call once per frame. The audio clock ticks in coarse render quanta, so we keep a smooth
   * performance.now()-based estimate and slew it towards the audio clock.
   */
  sync(perf: number): void {
    if (!this.playing) return;
    this.clock.sync(this.rawSongTime(perf), perf, this.rate);
  }

  /** Song time (seconds, calibrated) at a performance.now() timestamp. */
  songTime(perf: number): number {
    if (!this.playing) return this.pausedAt;
    return this.clock.time(perf, this.rate) - settings.audioOffsetMs / 1000;
  }

  /** AudioContext time at which a (calibrated) song time will be played. */
  ctxTimeForSong(t: number): number {
    return this.startCtx + (t + settings.audioOffsetMs / 1000 - this.startSong) / this.rate;
  }

  get playbackRate(): number {
    return this.rate;
  }

  // ---------------------------------------------------------------- feedback

  get hasPlayerStem(): boolean {
    return this.player !== null;
  }

  /** Mute the instrument after a miss; bring it back on the next hit. */
  setPlayerAudible(on: boolean, immediate = false): void {
    if (on === this.playerAudible && !immediate) return;
    this.playerAudible = on;
    const g = this.missGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    if (immediate) g.setValueAtTime(on ? 1 : 0, now);
    else g.setTargetAtTime(on ? 1 : 0, now, on ? 0.004 : 0.012);
  }

  /** The song failed: the band winds down (slows and fades out) over about a second and a half. */
  failOut(): void {
    const now = this.ctx.currentTime;
    for (const s of this.sources) {
      const r = s.playbackRate;
      r.cancelScheduledValues(now);
      r.setValueAtTime(r.value, now);
      r.linearRampToValueAtTime(0.25, now + 1.5);
    }
    const g = this.musicBus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 1.5);
  }

  /** Briefly muffle the whole mix: miss feedback for songs without a separate instrument stem. */
  muffleHit(): void {
    const f = this.muffle.frequency;
    const g = this.musicBus.gain;
    const now = this.ctx.currentTime;
    f.cancelScheduledValues(now);
    f.setValueAtTime(Math.max(400, f.value), now);
    f.exponentialRampToValueAtTime(550, now + 0.025);
    f.setValueAtTime(550, now + 0.12);
    f.exponentialRampToValueAtTime(20000, now + 0.55);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.7, now + 0.02);
    g.linearRampToValueAtTime(1, now + 0.5);
  }

  playSfx(name: SfxName, gain = 1, detuneCents = 0): void {
    if (this.ctx.state !== 'running') return;
    const list = this.sfx[name];
    const buf = list[Math.floor(Math.random() * list.length)];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.detune.value = detuneCents;
    const now = this.ctx.currentTime;
    const slot = this.sfxGains.find((s) => s.busyUntil <= now) ?? this.addSfxGain();
    slot.busyUntil = now + buf.duration / 2 ** (Math.min(0, detuneCents) / 1200) + 0.05;
    slot.node.gain.value = gain;
    src.connect(slot.node);
    src.start();
  }

  private addSfxGain(): { node: GainNode; busyUntil: number } {
    const node = this.ctx.createGain();
    node.connect(this.sfxVol);
    const slot = { node, busyUntil: 0 };
    this.sfxGains.push(slot);
    return slot;
  }

  /** Schedule a sound at an absolute AudioContext time (metronome). */
  scheduleSfx(name: SfxName, when: number, gain = 1): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.sfx[name][0];
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxVol);
    src.start(when);
  }
}

let shared: AudioEngine | null = null;
export function audio(): AudioEngine {
  shared ??= new AudioEngine();
  return shared;
}
