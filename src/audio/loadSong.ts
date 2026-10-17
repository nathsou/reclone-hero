import type { AudioEngine, LoadedSong, StemFile } from './audio.ts';
import type { Instrument } from '../chart/types.ts';
import type { Library } from '../library/library.ts';
import type { SongEntry } from '../library/song.ts';
import { BuiltinSource } from '../starter/source.ts';
import { stretchAsync } from './stretch.ts';

/** One screen owns the entire load through its AbortSignal. Commit buffers only while it is alive. */
export async function loadSongAudio(a: AudioEngine, library: Library, song: SongEntry, instrument: Instrument, signal: AbortSignal, progress: (fraction: number, text: string) => void, range?: { start: number; end: number; rate: number }): Promise<LoadedSong> {
  await a.resume();
  signal.throwIfAborted();
  a.unload();
  const loaded = await readAudio(a, library, song, instrument, signal, progress);
  signal.throwIfAborted();
  if (range && range.rate !== 1) {
    const b = a.buffers;
    const to = Math.min(range.end, loaded.duration);
    // One worker/input copy at a time, rather than queuing copies of both full stems.
    const stretch = (buf: AudioBuffer | null, offset: number) => buf ? stretchAsync(a.ctx, buf, range.start, to, range.rate,
      p => progress(0.85 + 0.12 * (offset + p) / 2, 'Adjusting playback speed…'), signal) : Promise.resolve(null);
    const player = await stretch(b.player, 0);
    signal.throwIfAborted();
    const backing = await stretch(b.backing, 1);
    signal.throwIfAborted();
    a.setBuffers({ player, backing, origin: range.start });
  }
  return loaded;
}

async function readAudio(a: AudioEngine, library: Library, song: SongEntry, instrument: Instrument, signal: AbortSignal, progress: (fraction: number, text: string) => void): Promise<LoadedSong> {
  if (BuiltinSource.isBuiltin(song.path)) {
    const pcm = await library.builtin.renderAudio(song.path, a.ctx.sampleRate, signal, p => progress(p * 0.85, `Synthesizing the band… ${Math.round(p * 100)}%`));
    signal.throwIfAborted();
    return a.loadPcm([{ stem: 'guitar', channels: pcm.guitar }, { stem: 'song', channels: pcm.song }], pcm.sampleRate, instrument);
  }
  const stems = Object.entries(song.stems).filter(([stem]) => stem !== 'preview');
  async function* files(): AsyncGenerator<StemFile> {
    for (const [stem, file] of stems) {
      signal.throwIfAborted();
      const bytes = await library.readFile(song, file);
      signal.throwIfAborted();
      yield { stem, bytes };
    }
  }
  return a.loadSong(files(), instrument, (d, n) => progress(d / Math.max(1, n) * 0.85, `Loading audio (${d}/${n})`), signal, stems.length);
}
