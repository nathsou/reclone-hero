import { parseBlob, selectCover, TimestampFormat } from 'music-metadata';
import { lrcTimestamp, MAX_LYRICS_LENGTH } from './lyrics.ts';

export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export interface SongMetadata { title?: string; artist?: string; album?: string; lyrics?: string; cover?: Blob; warning?: string }

/** Inspect bytes, rather than trusting tag MIME types or user-controlled extensions. */
export function coverBlob(bytes: Uint8Array): Blob {
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) throw new Error('Choose a PNG, JPEG, or WebP cover up to 5 MB.');
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const webp = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  const type = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : '';
  if (!type) throw new Error('Choose a PNG, JPEG, or WebP cover up to 5 MB.');
  return new Blob([bytes.slice()], { type });
}

export function coverFile(cover?: Blob): 'album.png' | 'album.jpg' | 'album.webp' | null {
  return !cover ? null : cover.type === 'image/png' ? 'album.png' : cover.type === 'image/jpeg' ? 'album.jpg' : cover.type === 'image/webp' ? 'album.webp' : null;
}

/** Missing or malformed tags must never prevent an otherwise decodable song from importing. */
export async function readSongMetadata(file: Blob, signal: AbortSignal): Promise<SongMetadata> {
  try {
    const metadata = await parseBlob(file, { duration: false, maxMemoryAllocation: 16 * 1024 * 1024 });
    signal.throwIfAborted();
    const { common, native } = metadata;
    const text = (s?: string) => s?.replace(/\0/g, '').trim().slice(0, 200) || undefined;
    const result: SongMetadata = { title: text(common.title), artist: text(common.artist), album: text(common.album) };
    // Keep original LRC when available: normalized tags can discard repeated stamps and offsets.
    const lyricTexts = Object.values(native).flat().filter(tag => /^(USLT|ULT|SYLT|©lyr|(?:TXXX:)?(?:LYRICS|UNSYNCEDLYRICS))$/i.test(tag.id))
      .map(tag => typeof tag.value === 'string' ? tag.value : tag.value && typeof tag.value === 'object' && 'text' in tag.value ? tag.value.text : undefined)
      .filter((value): value is string => typeof value === 'string');
    const raw = lyricTexts.find(value => /\[\d{1,3}:[0-5]\d/.test(value));
    const synced = common.lyrics?.find(tag => tag.timeStampFormat === TimestampFormat.milliseconds && tag.syncText?.length);
    result.lyrics = (raw ?? (synced ? synced.syncText.filter(row => Number.isFinite(row.timestamp)).map(row => `${lrcTimestamp(row.timestamp! / 1000)}${row.text}`).join('\n')
      : common.lyrics?.find(tag => tag.text?.trim())?.text ?? lyricTexts.find(value => value.trim())
        ?? common.lyrics?.find(tag => tag.syncText?.length)?.syncText.map(row => row.text).join('\n')))?.replace(/\0/g, '').slice(0, MAX_LYRICS_LENGTH);
    const picture = selectCover(common.picture);
    if (picture) {
      try { result.cover = coverBlob(picture.data); }
      catch { result.warning = 'The embedded cover is unsupported or larger than 5 MB. You can replace it in Song.'; }
    }
    return result;
  } catch {
    signal.throwIfAborted();
    return { warning: 'Embedded song details could not be read. You can add a cover and lyrics in Song.' };
  }
}
