import { chartText, songIni } from './model.ts';
import type { StudioProject } from './model.ts';
import type { StudioStems } from './stems.ts';
import { DIFFICULTIES } from '../chart/types.ts';
import { coverBlob, coverFile, MAX_COVER_BYTES } from './metadata.ts';
import { lyricsFile, MAX_LYRICS_LENGTH } from './lyrics.ts';

const CRC = Uint32Array.from({ length: 256 }, (_, byte) => {
  let crc = byte;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC[(crc ^ byte) & 255];
  return (crc ^ -1) >>> 0;
}

/** Standard, uncompressed ZIP: portable song folders, without a runtime dependency or server. */
export function zipFiles(files: { name: string; bytes: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const entries = files.map((f) => ({ ...f, nameBytes: encoder.encode(f.name), crc: crc32(f.bytes), offset: 0 }));
  const localSize = entries.reduce((s, f) => s + 30 + f.nameBytes.length + f.bytes.length, 0);
  const centralSize = entries.reduce((s, f) => s + 46 + f.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22), view = new DataView(out.buffer);
  let pos = 0;
  for (const f of entries) {
    f.offset = pos;
    view.setUint32(pos, 0x04034b50, true); view.setUint16(pos + 4, 20, true); view.setUint16(pos + 6, 0x800, true);
    view.setUint32(pos + 14, f.crc, true); view.setUint32(pos + 18, f.bytes.length, true); view.setUint32(pos + 22, f.bytes.length, true);
    view.setUint16(pos + 26, f.nameBytes.length, true);
    out.set(f.nameBytes, pos + 30); out.set(f.bytes, pos + 30 + f.nameBytes.length);
    pos += 30 + f.nameBytes.length + f.bytes.length;
  }
  for (const f of entries) {
    view.setUint32(pos, 0x02014b50, true); view.setUint16(pos + 4, 20, true); view.setUint16(pos + 6, 20, true); view.setUint16(pos + 8, 0x800, true);
    view.setUint32(pos + 16, f.crc, true); view.setUint32(pos + 20, f.bytes.length, true); view.setUint32(pos + 24, f.bytes.length, true);
    view.setUint16(pos + 28, f.nameBytes.length, true); view.setUint32(pos + 42, f.offset, true);
    out.set(f.nameBytes, pos + 46); pos += 46 + f.nameBytes.length;
  }
  view.setUint32(pos, 0x06054b50, true); view.setUint16(pos + 8, entries.length, true); view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, centralSize, true); view.setUint32(pos + 16, localSize, true);
  return out;
}

export async function exportProject(p: StudioProject, audio: Blob, stems?: StudioStems, cover?: Blob): Promise<Blob> {
  const enc = new TextEncoder(), folder = p.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'Studio song';
  const files = [
    { name: `${folder}/notes.chart`, bytes: enc.encode(chartText(p, stems ? 'song.ogg' : p.audioName)) },
    { name: `${folder}/song.ini`, bytes: enc.encode(songIni(p)) },
    { name: `${folder}/studio.json`, bytes: enc.encode(JSON.stringify({ ...p, analysis: { ...p.analysis, waveform: Array.from(p.analysis.waveform) }, coverFile: coverFile(cover) ?? undefined, separatedAudio: stems ? { model: stems.model, gain: stems.gain } : undefined })) },
    { name: `${folder}/${stems ? p.audioName.replace('song.', 'original.') : p.audioName}`, bytes: new Uint8Array(await audio.arrayBuffer()) },
  ];
  if (stems) files.push(
    { name: `${folder}/guitar.ogg`, bytes: new Uint8Array(await stems.guitar.arrayBuffer()) },
    { name: `${folder}/song.ogg`, bytes: new Uint8Array(await stems.backing.arrayBuffer()) });
  if (cover && coverFile(cover)) files.push({ name: `${folder}/${coverFile(cover)}`, bytes: new Uint8Array(await cover.arrayBuffer()) });
  const lyricName = lyricsFile(p.lyrics);
  if (lyricName) files.push({ name: `${folder}/${lyricName}`, bytes: enc.encode(p.lyrics) });
  return new Blob([zipFiles(files)], { type: 'application/zip' });
}

/** Read the stored ZIPs produced above. No extraction to disk, path traversal, or decompression. */
export async function importProjectZip(file: Blob, id: string): Promise<{ project: StudioProject; audio: Blob; stems?: StudioStems; cover?: Blob }> {
  if (file.size > 328 * 1024 * 1024) throw new Error('Studio ZIP files must be smaller than 328 MB.');
  const data = new Uint8Array(await file.arrayBuffer()), view = new DataView(data.buffer), decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let pos = 0;
  while (pos + 30 <= data.length && view.getUint32(pos, true) === 0x04034b50) {
    if (entries.size >= 8 || view.getUint16(pos + 8, true) !== 0 || (view.getUint16(pos + 6, true) & 9)) throw new Error('Choose an unchanged ZIP exported by Chart Studio.');
    const size = view.getUint32(pos + 18, true), nameLength = view.getUint16(pos + 26, true), extra = view.getUint16(pos + 28, true);
    const start = pos + 30 + nameLength + extra, end = start + size;
    if (end > data.length || size !== view.getUint32(pos + 22, true)) throw new Error('The ZIP is truncated or damaged.');
    const name = decoder.decode(data.subarray(pos + 30, pos + 30 + nameLength));
    const bytes = data.subarray(start, end);
    if (crc32(bytes) !== view.getUint32(pos + 14, true) || entries.has(name)) throw new Error('The ZIP failed its integrity check.');
    entries.set(name, bytes); pos = end;
  }
  const metadata = [...entries].find(([name]) => name.endsWith('/studio.json'));
  if (!metadata || metadata[1].length > 20 * 1024 * 1024) throw new Error('This ZIP does not contain a Chart Studio project.');
  const value = JSON.parse(decoder.decode(metadata[1]));
  const p = validateProject(value, id), separated = value.separatedAudio;
  const prefix = metadata[0].slice(0, -'studio.json'.length);
  const audio = entries.get(prefix + (separated ? p.audioName.replace('song.', 'original.') : p.audioName));
  if (!audio?.length || audio.length > 100 * 1024 * 1024) throw new Error('The ZIP is missing its song audio.');
  let cover: Blob | undefined;
  if (value.coverFile !== undefined) {
    if (!['album.png', 'album.jpg', 'album.webp'].includes(value.coverFile)) throw new Error('The ZIP has invalid cover metadata.');
    const bytes = entries.get(prefix + value.coverFile);
    if (!bytes?.length || bytes.length > MAX_COVER_BYTES) throw new Error('The ZIP is missing its album cover or it exceeds 5 MB.');
    cover = coverBlob(bytes);
    if (coverFile(cover) !== value.coverFile) throw new Error('The ZIP has invalid cover metadata.');
  }
  let stems: StudioStems | undefined;
  if (separated !== undefined) {
    const guitar = entries.get(prefix + 'guitar.ogg'), backing = entries.get(prefix + 'song.ogg');
    if (!separated || separated.model !== 'htdemucs_6s' || !Number.isFinite(separated.gain) || separated.gain <= 0 || separated.gain > 1 || !guitar?.length || !backing?.length || Math.max(guitar.length, backing.length) > 100 * 1024 * 1024) throw new Error('The ZIP has incomplete or invalid separated audio.');
    stems = { guitar: new Blob([guitar.slice()], { type: 'audio/ogg' }), backing: new Blob([backing.slice()], { type: 'audio/ogg' }), model: separated.model, gain: separated.gain };
  }
  return { project: p, audio: new Blob([audio.slice()]), stems, cover };
}

/** Validate portable, untrusted project metadata before it can reach canvas, audio, or storage. */
export function validateProject(value: unknown, id: string): StudioProject {
  const fail = () => { throw new Error('This Chart Studio project has invalid or unsupported data.'); };
  if (!value || typeof value !== 'object') return fail();
  const p = value as StudioProject;
  const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (p.version !== 1 || typeof p.name !== 'string' || p.name.length > 200 || typeof p.artist !== 'string' || p.artist.length > 200 || !/^song\.(mp3|wav|ogg|opus|m4a)$/.test(p.audioName)) return fail();
  if (p.album !== undefined && (typeof p.album !== 'string' || p.album.length > 200)) return fail();
  if (p.lyrics !== undefined && (typeof p.lyrics !== 'string' || p.lyrics.length > MAX_LYRICS_LENGTH)) return fail();
  const a = p.analysis;
  if (!a || !finite(a.duration, 0.5, 1200) || !finite(a.bpm, 30, 300) || !finite(a.beatOffset, 0, 4) || !finite(a.confidence, 0, 1)) return fail();
  if (!Array.isArray(a.waveform) || a.waveform.length > 120001 || !a.waveform.every((n) => finite(n, 0, 100))) return fail();
  if (!Array.isArray(a.onsets) || a.onsets.length > 20000 || !a.onsets.every((o, i) => o && finite(o.time, 0, a.duration) && finite(o.strength, 0, 10) && finite(o.tone, 0, 20) && (!i || o.time > a.onsets[i - 1].time))) return fail();
  if (!Array.isArray(p.timing) || !p.timing.length || p.timing.length > 512 || p.timing[0].time !== 0 || !p.timing.every((t, i) => t && finite(t.time, 0, a.duration) && finite(t.bpm, 30, 300) && (!i || t.time > p.timing[i - 1].time)) || !finite(p.beatOffset, 0, 4)) return fail();
  let nextId = 1;
  const ids = new Set<number>();
  for (const diff of DIFFICULTIES) {
    const notes = p.notes?.[diff], locks = p.locks?.[diff];
    if (!Array.isArray(notes) || notes.length > 50000 || !Array.isArray(locks) || locks.length > 1000) return fail();
    for (const n of notes) {
      if (!n || !Number.isInteger(n.id) || !finite(n.id, 1, 1e9) || ids.has(n.id) || !finite(n.time, 0, a.duration - 0.00001) || !finite(n.length, 0, a.duration - n.time + 0.0001) || !Number.isInteger(n.lane) || n.lane < 0 || n.lane > 4 || !['auto', 'tap'].includes(n.kind)) return fail();
      ids.add(n.id); nextId = Math.max(nextId, n.id + 1);
    }
    if (!locks.every((r) => r && finite(r.start, 0, a.duration) && finite(r.end, r.start, a.duration) && r.end > r.start)) return fail();
  }
  return { version: 1, id, name: p.name, artist: p.artist, album: p.album, lyrics: p.lyrics, audioName: p.audioName,
    analysis: { duration: a.duration, bpm: a.bpm, beatOffset: a.beatOffset, confidence: a.confidence, onsets: a.onsets, waveform: Float32Array.from(a.waveform) },
    timing: p.timing, beatOffset: p.beatOffset, notes: p.notes, locks: p.locks, nextId };
}
