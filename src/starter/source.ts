import type { LibrarySource } from '../library/sources.ts';
import type { RawSongFolder } from '../library/song.ts';
import { coverArt } from './art.ts';
import { estimateDifficulty, generateChart } from './chartgen.ts';
import type { GeneratedChart } from './chartgen.ts';
import { renderPreview, renderStems } from './client.ts';
import { songSeconds } from './render.ts';
import type { SongDef } from './score.ts';
import { STARTER_SONGS } from './songs/index.ts';

/** Folder the built-in songs appear under (also the prefix of their song ids). */
export const BUILTIN_DIR = 'Built-in Songs';
const FILES = ['notes.chart', 'song.ini', 'guitar.wav', 'song.wav', 'preview.wav', 'album.png'];
const MIME: Record<string, string> = { wav: 'audio/wav', png: 'image/png', chart: 'text/plain', ini: 'text/plain' };

/**
 * Songs that ship with the game: scores in code, synthesized on demand (see synth.ts), so they need
 * no downloads and carry no licensing strings. Presents them as ordinary song folders.
 */
export class BuiltinSource implements LibrarySource {
  readonly kind = 'builtin';
  readonly label = BUILTIN_DIR;
  private readonly charts = new Map<string, GeneratedChart>();
  private readonly art = new Map<string, Promise<Blob>>();
  /** stem progress while a song loads (0..1), for the loading screen */
  onRenderProgress: ((p: number) => void) | null = null;

  static isBuiltin(path: string): boolean {
    return path.startsWith(BUILTIN_DIR + '/');
  }

  private chart(def: SongDef): GeneratedChart {
    let c = this.charts.get(def.id);
    if (!c) this.charts.set(def.id, (c = generateChart(def)));
    return c;
  }

  async scan(): Promise<RawSongFolder[]> {
    const enc = new TextEncoder();
    return STARTER_SONGS.map((def) => ({ path: `${BUILTIN_DIR}/${def.name}`, files: FILES, ini: enc.encode(this.ini(def)), chartHead: null }));
  }

  private ini(def: SongDef): string {
    const lines = [
      '[song]',
      `name = ${def.name}`,
      `artist = ${def.artist}`,
      `album = ${def.album}`,
      `genre = ${def.genre}`,
      `year = ${def.year}`,
      `charter = reclone hero`,
      `song_length = ${Math.round(songSeconds(def) * 1000)}`,
      `preview_start_time = 0`,
      `diff_guitar = ${estimateDifficulty(this.chart(def), def)}`,
      `loading_phrase = ${def.loadingPhrase}`,
      `delay = 0`,
    ];
    return lines.join('\n');
  }

  private split(path: string): { def: SongDef; file: string } {
    const rest = path.slice(BUILTIN_DIR.length + 1);
    const i = rest.lastIndexOf('/');
    const name = rest.slice(0, i);
    const def = STARTER_SONGS.find((s) => s.name === name);
    if (!def) throw new Error(`Unknown built-in song ${name}`);
    return { def, file: rest.slice(i + 1) };
  }

  async readFile(path: string): Promise<Uint8Array> {
    const { def, file } = this.split(path);
    switch (file) {
      case 'notes.chart':
        return new TextEncoder().encode(this.chart(def).text);
      case 'song.ini':
        return new TextEncoder().encode(this.ini(def));
      case 'guitar.wav':
      case 'song.wav': {
        const stems = await renderStems(def.id, (p) => this.onRenderProgress?.(p));
        // A copy: decoding detaches the buffer it is given, and the render stays cached for replays.
        return (file === 'guitar.wav' ? stems.guitar : stems.song).slice();
      }
      case 'preview.wav':
        return (await renderPreview(def.id)).slice();
      case 'album.png': {
        let p = this.art.get(def.id);
        if (!p) this.art.set(def.id, (p = coverArt(def)));
        return new Uint8Array(await (await p).arrayBuffer());
      }
    }
    throw new Error(`No file ${file}`);
  }

  async fileUrl(path: string): Promise<string> {
    const { file } = this.split(path);
    const bytes = await this.readFile(path);
    return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[file.split('.').pop()!] ?? 'application/octet-stream' }));
  }

  release(url: string): void {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
