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

/** Rendered stems for a stretch of a song: interleaved stereo 16-bit PCM, one array per stem. */
export interface Chunk {
  /** first frame of the stretch */
  start: number;
  guitar: Int16Array;
  song: Int16Array;
}

/** Neighbouring chunks overlap by this much and are crossfaded, so no seam can be heard. */
export const CHUNK_OVERLAP = 0.25;

/**
 * How to cut a song into `n` stretches that render in parallel: [from, to) in seconds, each but the
 * last running on by the overlap. About 20 s at least per piece: each one pays for a warm-up.
 */
export function planChunks(id: string, workers: number): [number, number][] {
  const secs = songSeconds(find(id));
  const n = Math.max(1, Math.min(workers, Math.floor(secs / 20)));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (secs * i) / n;
    const b = (secs * (i + 1)) / n;
    out.push([a, i === n - 1 ? secs : b + CHUNK_OVERLAP]);
  }
  return out;
}

const pcm = (x: number) => Math.max(-32767, Math.min(32767, Math.round(x * 32767)));

/** Render [from, to) seconds of both stems as PCM (for one worker's share of the song). */
export function* chunkJob(id: string, from: number, to: number): Generator<number, Chunk> {
  const def = find(id);
  const start = Math.round(from * SYNTH_RATE);
  const frames = Math.round(to * SYNTH_RATE) - start;
  const guitar = new Int16Array(frames * 2);
  const song = new Int16Array(frames * 2);
  let pos = 0;
  for (const b of renderSong(def, SYNTH_RATE, from, to)) {
    for (let i = 0; i < b.n && pos < frames; i++, pos++) {
      guitar[pos * 2] = pcm(b.pl[i]);
      guitar[pos * 2 + 1] = pcm(b.pr[i]);
      song[pos * 2] = pcm(b.bl[i]);
      song[pos * 2 + 1] = pcm(b.br[i]);
    }
    yield b.progress;
  }
  return { start, guitar, song };
}

/** Stitch rendered chunks (in order) into the two WAV stems, crossfading where they overlap. */
export function assembleStems(id: string, chunks: Chunk[]): Stems {
  const frames = Math.ceil(songSeconds(find(id)) * SYNTH_RATE);
  const stem = (pick: (c: Chunk) => Int16Array): Uint8Array => {
    const wav = new WavWriter(frames, SYNTH_RATE);
    const out = new Int16Array(wav.bytes.buffer, 44, frames * 2);
    let filled = 0; // frames written so far
    for (const c of chunks) {
      const data = pick(c);
      const len = data.length / 2;
      const overlap = Math.max(0, Math.min(len, filled - c.start));
      for (let i = 0; i < len && c.start + i < frames; i++) {
        const o = (c.start + i) * 2;
        if (i < overlap) {
          const w = (i + 0.5) / overlap;
          out[o] = Math.round(out[o] * (1 - w) + data[i * 2] * w);
          out[o + 1] = Math.round(out[o + 1] * (1 - w) + data[i * 2 + 1] * w);
        } else {
          out[o] = data[i * 2];
          out[o + 1] = data[i * 2 + 1];
        }
      }
      filled = Math.max(filled, c.start + len);
    }
    return wav.bytes;
  };
  return { guitar: stem((c) => c.guitar), song: stem((c) => c.song) };
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
