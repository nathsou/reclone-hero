import { settings } from '../settings.ts';
import { detectPitch } from './pitch.ts';
import type { PitchReading } from './pitch.ts';

/** Microphone input for singing: the latest pitch and loudness, read once a frame. */
export class Mic {
  readonly reading: PitchReading = { pitch: NaN, level: 0 };
  private readonly ctx: AudioContext;
  private readonly stream: MediaStream;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly buf: Float32Array<ArrayBuffer>;
  /** seconds the browser says the input lags, if it says */
  private readonly inputLatency: number;

  private constructor(ctx: AudioContext, stream: MediaStream) {
    this.ctx = ctx;
    this.stream = stream;
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    const s = stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number };
    this.inputLatency = typeof s?.latency === 'number' ? s.latency : 0.02;
  }

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Ask for the microphone (the browser prompts the first time). Throws a readable error when refused. */
  static async open(ctx: AudioContext, deviceId = settings.micDevice): Promise<Mic> {
    if (!Mic.supported) throw new Error('This browser gives no access to a microphone.');
    try {
      // the raw voice: echo cancelling and noise suppression smear the pitch
      const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) };
      return new Mic(ctx, await navigator.mediaDevices.getUserMedia({ audio }));
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new Error('Singing needs the microphone: allow it in the browser and try again.');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('No microphone was found (Settings › Audio › Microphone picks one).');
      throw err;
    }
  }

  /** Microphones the browser lists (labels appear once access has been given). */
  static async devices(): Promise<{ id: string; label: string }[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  }

  /**
   * How long ago (seconds) what read() hears was sung: half the analysis block, the input's own latency
   * and the player's adjustment (Settings › Audio › Microphone delay).
   */
  get latency(): number {
    return this.buf.length / 2 / this.ctx.sampleRate + this.inputLatency + settings.micLatencyMs / 1000;
  }

  /** The pitch and loudness of the latest block. Allocation-free. */
  read(): PitchReading {
    this.analyser.getFloatTimeDomainData(this.buf);
    return detectPitch(this.buf, this.ctx.sampleRate, this.reading);
  }

  close(): void {
    this.source.disconnect();
    for (const t of this.stream.getTracks()) t.stop();
  }
}
