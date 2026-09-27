import { base64ToBytes } from '../util/text.ts';
import type { RawSongFolder } from './song.ts';

export interface LibrarySource {
  readonly kind: 'http' | 'fs' | 'files';
  readonly label: string;
  scan(onProgress?: (found: number) => void): Promise<RawSongFolder[]>;
  readFile(path: string): Promise<Uint8Array>;
  /** A URL usable by <img>/<audio>; caller must call release() when done with blob URLs. */
  fileUrl(path: string): Promise<string>;
  release(url: string): void;
}

const CHART_RE = /\.(chart|mid)$/i;

/** Songs served by the Vite dev server plugin (see vite.config.js). */
export class HttpSource implements LibrarySource {
  readonly kind = 'http';
  label = 'Dev server';

  static async detect(): Promise<HttpSource | null> {
    try {
      const res = await fetch('/__charts/scan', { method: 'HEAD' });
      return res.ok ? new HttpSource() : null;
    } catch {
      return null;
    }
  }

  async scan(): Promise<RawSongFolder[]> {
    const res = await fetch('/__charts/scan');
    if (!res.ok) throw new Error(`Library scan failed: ${res.status}`);
    const json = (await res.json()) as { root: string; songs: { path: string; files: string[]; ini: string | null; chartHead: string | null }[] };
    this.label = json.root;
    return json.songs.map((s) => ({
      path: s.path,
      files: s.files,
      ini: s.ini ? base64ToBytes(s.ini) : null,
      chartHead: s.chartHead ? base64ToBytes(s.chartHead) : null,
    }));
  }

  private url(path: string): string {
    return '/__charts/file/' + path.split('/').map(encodeURIComponent).join('/');
  }

  async readFile(path: string): Promise<Uint8Array> {
    const res = await fetch(this.url(path));
    if (!res.ok) throw new Error(`Could not read ${path}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async fileUrl(path: string): Promise<string> {
    return this.url(path);
  }

  release(): void {}
}

/** A folder picked with the File System Access API (Chromium). */
export class FsSource implements LibrarySource {
  readonly kind = 'fs';
  readonly root: FileSystemDirectoryHandle;
  private readonly dirs = new Map<string, Promise<FileSystemDirectoryHandle>>();

  constructor(root: FileSystemDirectoryHandle) {
    this.root = root;
  }

  get label(): string {
    return this.root.name;
  }

  async scan(onProgress?: (found: number) => void): Promise<RawSongFolder[]> {
    const out: RawSongFolder[] = [];
    const queue: { dir: FileSystemDirectoryHandle; path: string }[] = [{ dir: this.root, path: '' }];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const files: FileSystemFileHandle[] = [];
        for await (const h of item.dir.values()) {
          if (h.name.startsWith('.')) continue;
          if (h.kind === 'file') files.push(h as FileSystemFileHandle);
          else queue.push({ dir: h as FileSystemDirectoryHandle, path: item.path ? `${item.path}/${h.name}` : h.name });
        }
        if (!files.some((f) => CHART_RE.test(f.name))) continue;
        const ini = files.find((f) => f.name.toLowerCase() === 'song.ini');
        const chart = files.find((f) => f.name.toLowerCase() === 'notes.chart');
        out.push({
          path: item.path,
          files: files.map((f) => f.name),
          ini: ini ? new Uint8Array(await (await ini.getFile()).arrayBuffer()) : null,
          chartHead: !ini && chart ? new Uint8Array(await (await chart.getFile()).slice(0, 4096).arrayBuffer()) : null,
        });
        onProgress?.(out.length);
      }
    };
    // Directory reads are I/O bound; a few concurrent walkers keep the disk busy.
    const walkers: Promise<void>[] = [];
    for (let i = 0; i < 6; i++) {
      walkers.push(worker());
      await new Promise((r) => setTimeout(r, 0));
    }
    await Promise.all(walkers);
    // Walkers may exit early while others are still discovering folders.
    while (queue.length) await Promise.all([worker(), worker(), worker()]);
    return out;
  }

  private dir(path: string): Promise<FileSystemDirectoryHandle> {
    if (!path) return Promise.resolve(this.root);
    let p = this.dirs.get(path);
    if (!p) {
      const i = path.lastIndexOf('/');
      const parent = i < 0 ? '' : path.slice(0, i);
      p = this.dir(parent).then((d) => d.getDirectoryHandle(path.slice(i + 1)));
      this.dirs.set(path, p);
    }
    return p;
  }

  private async file(path: string): Promise<File> {
    const i = path.lastIndexOf('/');
    const dir = await this.dir(i < 0 ? '' : path.slice(0, i));
    return (await dir.getFileHandle(path.slice(i + 1))).getFile();
  }

  async readFile(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.file(path)).arrayBuffer());
  }

  async fileUrl(path: string): Promise<string> {
    return URL.createObjectURL(await this.file(path));
  }

  release(url: string): void {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

/**
 * Files chosen with <input type="file" webkitdirectory>: works in every browser and from file://,
 * but the browser cannot remember the choice, so the folder is picked again each session.
 */
export class FileListSource implements LibrarySource {
  readonly kind = 'files';
  readonly label: string;
  private readonly files = new Map<string, File>();

  constructor(list: FileList | File[]) {
    let root = '';
    for (const f of Array.from(list)) {
      const rel = f.webkitRelativePath || f.name;
      const slash = rel.indexOf('/');
      if (!root) root = slash > 0 ? rel.slice(0, slash) : '';
      this.files.set(slash > 0 ? rel.slice(slash + 1) : rel, f);
    }
    this.label = root || 'Charts';
  }

  get size(): number {
    return this.files.size;
  }

  async scan(onProgress?: (found: number) => void): Promise<RawSongFolder[]> {
    const dirs = new Map<string, { name: string; file: File }[]>();
    for (const [path, file] of this.files) {
      const i = path.lastIndexOf('/');
      const dir = i < 0 ? '' : path.slice(0, i);
      const name = path.slice(i + 1);
      if (name.startsWith('.')) continue;
      let list = dirs.get(dir);
      if (!list) dirs.set(dir, (list = []));
      list.push({ name, file });
    }
    const out: RawSongFolder[] = [];
    for (const [dir, list] of dirs) {
      if (!list.some((f) => CHART_RE.test(f.name))) continue;
      const ini = list.find((f) => f.name.toLowerCase() === 'song.ini');
      const chart = list.find((f) => f.name.toLowerCase() === 'notes.chart');
      out.push({
        path: dir,
        files: list.map((f) => f.name),
        ini: ini ? new Uint8Array(await ini.file.arrayBuffer()) : null,
        chartHead: !ini && chart ? new Uint8Array(await chart.file.slice(0, 4096).arrayBuffer()) : null,
      });
      onProgress?.(out.length);
    }
    return out;
  }

  private file(path: string): File {
    const f = this.files.get(path);
    if (!f) throw new Error(`Missing file ${path}`);
    return f;
  }

  async readFile(path: string): Promise<Uint8Array> {
    return new Uint8Array(await this.file(path).arrayBuffer());
  }

  async fileUrl(path: string): Promise<string> {
    return URL.createObjectURL(this.file(path));
  }

  release(url: string): void {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
