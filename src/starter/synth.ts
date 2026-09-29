import { renderSong, songSeconds } from './render.ts';
import { Tempo } from './score.ts';
import { STARTER_SONGS } from './songs/index.ts';
import { WavWriter } from './wav.ts';

/** Render rate for the built-in songs; the browser resamples on decode if its own rate differs. */
export const SYNTH_RATE = 44100;
export const PREVIEW_SECONDS = 28;

export interface Stems {
  guitar: Uint8Array;
  song: Uint8Array;
}

function find(id: string) {
  const def = STARTER_SONGS.find((s) => s.id === id);
  if (!def) throw new Error(`No built-in song "${id}"`);
  return def;
}

/**
 * Render both stems as WAV files. A generator that yields progress (0..1) between blocks, so the
 * caller decides how to share the thread; the final value is the stems.
 */
export function* stemsJob(id: string): Generator<number, Stems> {
  const def = find(id);
  const secs = songSeconds(def);
  const frames = Math.ceil(secs * SYNTH_RATE);
  const guitar = new WavWriter(frames, SYNTH_RATE);
  const song = new WavWriter(frames, SYNTH_RATE);
  for (const b of renderSong(def, SYNTH_RATE, 0, secs)) {
    guitar.write(b.pl, b.pr, b.n);
    song.write(b.bl, b.br, b.n);
    yield b.progress;
  }
  return { guitar: guitar.bytes, song: song.bytes };
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
