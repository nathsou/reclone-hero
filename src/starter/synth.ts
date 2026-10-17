import { renderSong, songSeconds } from './render.ts';
import { Tempo } from './score.ts';
import { STARTER_SONGS } from './songs/index.ts';
import { WavWriter } from './wav.ts';

/** Rate for WAV previews and file compatibility; gameplay PCM uses the device sample rate. */
export const SYNTH_RATE = 44100;
export const PREVIEW_SECONDS = 28;

export interface Stems {
  guitar: Float32Array[];
  song: Float32Array[];
  sampleRate: number;
}

function find(id: string) {
  const def = STARTER_SONGS.find((s) => s.id === id);
  if (!def) throw new Error(`No built-in song "${id}"`);
  return def;
}

/** Render directly into transferable PCM at the playback device's rate. */
export function* stemsJob(id: string, sampleRate = SYNTH_RATE): Generator<number, Stems> {
  const def = find(id);
  const secs = songSeconds(def);
  const frames = Math.ceil(secs * sampleRate);
  const guitar = [new Float32Array(frames), new Float32Array(frames)];
  const song = [new Float32Array(frames), new Float32Array(frames)];
  let pos = 0;
  for (const b of renderSong(def, sampleRate, 0, secs)) {
    guitar[0].set(b.pl.subarray(0, b.n), pos);
    guitar[1].set(b.pr.subarray(0, b.n), pos);
    song[0].set(b.bl.subarray(0, b.n), pos);
    song[1].set(b.br.subarray(0, b.n), pos);
    pos += b.n;
    yield b.progress;
  }
  return { guitar, song, sampleRate };
}

/** A short mixed-down excerpt for the song list, faded in and out. */
export function* previewJob(id: string): Generator<number, Uint8Array> {
  const def = find(id);
  const from = new Tempo(def.tempo).toSec(def.previewBeat);
  const to = Math.min(songSeconds(def), from + PREVIEW_SECONDS);
  const frames = Math.round((to - from) * SYNTH_RATE);
  const wav = new WavWriter(frames, SYNTH_RATE);
  const fade = Math.round(1.5 * SYNTH_RATE);
  let pos = 0;
  const l = new Float32Array(1 << 15);
  const r = new Float32Array(1 << 15);
  for (const b of renderSong(def, SYNTH_RATE, from, to)) {
    for (let i = 0; i < b.n; i++) {
      const k = pos + i;
      const g = Math.min(1, k / (0.3 * SYNTH_RATE), (frames - k) / fade);
      l[i] = (b.pl[i] + b.bl[i]) * g;
      r[i] = (b.pr[i] + b.br[i]) * g;
    }
    wav.write(l, r, b.n);
    pos += b.n;
    yield b.progress;
  }
  return wav.bytes;
}

/** Drive a job to completion synchronously. */
export function runJob<T>(job: Generator<number, T>, onProgress?: (p: number) => void): T {
  for (;;) {
    const r = job.next();
    if (r.done) return r.value;
    onProgress?.(r.value);
  }
}
