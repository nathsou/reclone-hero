import type { Library } from '../library/library.ts';
import type { SongEntry } from '../library/song.ts';
import { settings } from '../settings.ts';

/** Plays a song preview in the song list using <audio> elements (no full decode needed). */
export class PreviewPlayer {
  private els: HTMLAudioElement[] = [];
  private urls: string[] = [];
  private token = 0;
  private fade = 0;
  private readonly library: Library;

  constructor(library: Library) {
    this.library = library;
  }

  async play(song: SongEntry): Promise<void> {
    const token = ++this.token;
    this.stop();
    const stems = song.stems;
    const files = stems.preview ? [stems.preview] : Object.entries(stems).filter(([k]) => k !== 'crowd' && k !== 'preview').map(([, f]) => f);
    if (!files.length) return;
    const loaded = await Promise.allSettled(files.map((f) => this.library.fileUrl(song, f)));
    const urls = loaded.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    // Fast browsing supersedes queued built-in previews. They are optional: a canceled or
    // unreadable preview must neither produce an unhandled rejection nor leak other stem URLs.
    if (token !== this.token || loaded.some(r => r.status === 'rejected')) {
      urls.forEach((u) => this.library.release(u));
      return;
    }
    this.urls = urls;
    const len = song.lengthMs / 1000;
    let start = stems.preview ? 0 : song.previewStartMs / 1000 || Math.min(30, len * 0.35 || 30);
    if (len && start > len - 5) start = len * 0.35;
    // Set the start position before metadata arrives (it becomes the default start position),
    // so playback begins as soon as the first bytes are decoded.
    this.els = urls.map((u) => {
      const a = new Audio();
      a.preload = 'auto';
      a.volume = 0;
      a.src = u;
      a.currentTime = start;
      return a;
    });
    for (const a of this.els) void a.play().catch(() => {});
    const target = settings.volPreview * settings.volMaster;
    let v = 0;
    clearInterval(this.fade);
    this.fade = window.setInterval(() => {
      v = Math.min(target, v + target / 8);
      for (const a of this.els) a.volume = v;
      if (v >= target) clearInterval(this.fade);
    }, 30);
  }

  stop(): void {
    clearInterval(this.fade);
    for (const a of this.els) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    this.els = [];
    this.urls.forEach((u) => this.library.release(u));
    this.urls = [];
  }

  cancel(): void {
    this.token++;
    this.stop();
  }
}
