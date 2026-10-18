import type { LibrarySource } from '../library/sources.ts';
import type { RawSongFolder } from '../library/song.ts';
import { chartText, songIni } from './model.ts';
import { listProjects, readProject, deleteProject } from './storage.ts';
import type { StudioProject } from './model.ts';
import type { StudioStems } from './stems.ts';
import { coverFile } from './metadata.ts';
import { lyricsFile } from './lyrics.ts';

export const STUDIO_DIR = 'Chart Studio';
export function studioFolder(p: StudioProject, stems?: StudioStems, cover?: Blob): RawSongFolder {
  return { path: `${STUDIO_DIR}/${p.id}`, files: ['notes.chart', 'song.ini', ...(stems ? ['guitar.ogg', 'song.ogg'] : [p.audioName]), ...[coverFile(cover), lyricsFile(p.lyrics)].filter((file): file is NonNullable<typeof file> => !!file)], ini: new TextEncoder().encode(songIni(p)), chartHead: null };
}

export class StudioSource implements LibrarySource {
  readonly kind = 'studio';
  readonly label = STUDIO_DIR;
  // Avoid hijacking an ordinary imported folder merely named "Chart Studio".
  static isStudio(path: string): boolean { return /^Chart Studio\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path); }
  static id(path: string): string { return path.slice(STUDIO_DIR.length + 1).split('/')[0]; }
  async scan(): Promise<RawSongFolder[]> {
    // Storage may be unavailable in a private window; the rest of the library remains usable.
    try { return (await listProjects()).map((s) => studioFolder(s.project, s.stems, s.cover)); } catch { return []; }
  }
  async readFile(path: string): Promise<Uint8Array> {
    const { project, audio, stems, cover } = await readProject(StudioSource.id(path));
    const file = path.split('/').pop();
    if (file === 'notes.chart') return new TextEncoder().encode(chartText(project, stems ? 'song.ogg' : project.audioName));
    if (file === 'song.ini') return new TextEncoder().encode(songIni(project));
    if (cover && file === coverFile(cover)) return new Uint8Array(await cover.arrayBuffer());
    if (file === lyricsFile(project.lyrics)) return new TextEncoder().encode(project.lyrics);
    if (stems && file === 'guitar.ogg') return new Uint8Array(await stems.guitar.arrayBuffer());
    if (stems && file === 'song.ogg') return new Uint8Array(await stems.backing.arrayBuffer());
    if (!stems && file === project.audioName) return new Uint8Array(await audio.arrayBuffer());
    throw new Error(`No studio file ${file}`);
  }
  async fileUrl(path: string): Promise<string> {
    const saved = await readProject(StudioSource.id(path));
    const file = path.split('/').pop();
    const blob = saved.cover && file === coverFile(saved.cover) ? saved.cover : file === lyricsFile(saved.project.lyrics) ? new Blob([saved.project.lyrics!], { type: 'text/plain' })
      : saved.stems ? file === 'guitar.ogg' ? saved.stems.guitar : file === 'song.ogg' ? saved.stems.backing : null : file === saved.project.audioName ? saved.audio : null;
    if (!blob) throw new Error(`No studio audio ${file}`);
    return URL.createObjectURL(blob);
  }
  release(url: string): void { URL.revokeObjectURL(url); }
  async deleteFolder(path: string): Promise<void> { await deleteProject(StudioSource.id(path)); }
}
