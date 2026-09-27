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
  source: LibrarySource | null = null;
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

  async open(source: LibrarySource, opts: { rescan?: boolean; onProgress?: (n: number) => void } = {}): Promise<void> {
    this.source = source;
    let folders: RawSongFolder[] | undefined;
    if (source.kind === 'fs' && !opts.rescan) {
      const cached = await idbGet<{ root: string; folders: RawSongFolder[] }>(SCAN_KEY);
      if (cached && cached.root === source.label) folders = cached.folders;
    }
    if (!folders) {
      folders = await source.scan(opts.onProgress);
      if (source.kind === 'fs') await idbSet(SCAN_KEY, { root: source.label, folders });
    }
    const songs: SongEntry[] = [];
    for (const f of folders) {
      const e = makeSongEntry(f);
      if (e) songs.push(e);
    }
    songs.sort((a, b) => a.artist.localeCompare(b.artist) || a.name.localeCompare(b.name));
    this.songs = songs;
  }

  readFile(song: SongEntry, file: string): Promise<Uint8Array> {
    return this.source!.readFile(`${song.path}/${file}`);
  }

  fileUrl(song: SongEntry, file: string): Promise<string> {
    return this.source!.fileUrl(`${song.path}/${file}`);
  }

  release(url: string): void {
    this.source?.release(url);
  }
}
