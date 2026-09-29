import { settings } from '../settings.ts';
import { BuiltinSource } from '../starter/source.ts';
import { idbGet, idbSet } from '../util/idb.ts';
import { makeSongEntry } from './song.ts';
import type { RawSongFolder, SongEntry } from './song.ts';
import { FileListSource, FsSource, HttpSource } from './sources.ts';
import type { LibrarySource } from './sources.ts';

const HANDLE_KEY = 'fs-handle';
const SCAN_KEY = 'fs-scan';

export type RestoreResult =
  | { state: 'ready'; source: LibrarySource }
  | { state: 'needs-permission'; handle: FileSystemDirectoryHandle }
  | { state: 'none' };

export class Library {
  /** the player's own charts, if they picked a folder */
  source: LibrarySource | null = null;
  /** songs that ship with the game, listed alongside the player's own */
  readonly builtin = new BuiltinSource();
  songs: SongEntry[] = [];

  /** Reconnect to whatever library was used last time. */
  static async restore(): Promise<RestoreResult> {
    const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
    if (handle) {
      const perm = await handle.queryPermission({ mode: 'read' }).catch(() => 'denied' as PermissionState);
      if (perm === 'granted') return { state: 'ready', source: new FsSource(handle) };
      return { state: 'needs-permission', handle };
    }
    const http = await HttpSource.detect();
    if (http) return { state: 'ready', source: http };
    return { state: 'none' };
  }

  static get canPickFolder(): boolean {
    return typeof window.showDirectoryPicker === 'function';
  }

  static async pickFolder(): Promise<FsSource | null> {
    if (!window.showDirectoryPicker) return null;
    try {
      const handle = await window.showDirectoryPicker({ id: 'charts', mode: 'read' });
      await idbSet(HANDLE_KEY, handle);
      await idbSet(SCAN_KEY, null);
      return new FsSource(handle);
    } catch {
      return null;
    }
  }

  /** Folder picker that works in every browser (no persistence). */
  static pickFolderFallback(): Promise<FileListSource | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      input.addEventListener('change', () => resolve(input.files && input.files.length ? new FileListSource(input.files) : null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }

  /** The best folder picker this browser offers. */
  static async pickAny(): Promise<LibrarySource | null> {
    return Library.canPickFolder ? Library.pickFolder() : Library.pickFolderFallback();
  }

  static async useDevServer(): Promise<HttpSource | null> {
    const http = await HttpSource.detect();
    if (http) await idbSet(HANDLE_KEY, null);
    return http;
  }

  private folders: RawSongFolder[] = [];

  /** Open the player's folder (or none: built-in songs only). */
  async open(source: LibrarySource | null, opts: { rescan?: boolean; onProgress?: (n: number) => void } = {}): Promise<void> {
    this.source = source;
    let folders: RawSongFolder[] = [];
    if (source) {
      const cached = source.kind === 'fs' && !opts.rescan ? await idbGet<{ root: string; folders: RawSongFolder[] }>(SCAN_KEY) : null;
      if (cached && cached.root === source.label) folders = cached.folders;
      else {
        folders = await source.scan(opts.onProgress);
        if (source.kind === 'fs') await idbSet(SCAN_KEY, { root: source.label, folders });
      }
    }
    this.folders = folders;
    await this.index();
  }

  /** Rebuild the song list, e.g. after the built-in songs are shown or hidden. */
  async index(): Promise<void> {
    const folders = settings.builtinSongs ? [...this.folders, ...(await this.builtin.scan())] : this.folders;
    const songs: SongEntry[] = [];
    for (const f of folders) {
      const e = makeSongEntry(f);
      if (e) songs.push(e);
    }
    songs.sort((a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name));
    this.songs = songs;
  }

  private sourceFor(song: SongEntry): LibrarySource {
    if (BuiltinSource.isBuiltin(song.path)) return this.builtin;
    if (!this.source) throw new Error('No charts folder is open');
    return this.source;
  }

  readFile(song: SongEntry, file: string): Promise<Uint8Array> {
    return this.sourceFor(song).readFile(`${song.path}/${file}`);
  }

  fileUrl(song: SongEntry, file: string): Promise<string> {
    return this.sourceFor(song).fileUrl(`${song.path}/${file}`);
  }

  /** Every source only ever hands out blob URLs or plain paths, so any of them can release. */
  release(url: string): void {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
