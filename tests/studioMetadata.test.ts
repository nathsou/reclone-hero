import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverBlob, coverFile, MAX_COVER_BYTES, readSongMetadata } from '../src/studio/metadata.ts';
import { lrcTimestamp, lyricsFile, MAX_LYRICS_LENGTH, timedLyrics } from '../src/studio/lyrics.ts';
import { chartText, createProject, songIni, timingMap } from '../src/studio/model.ts';
import { exportProject, importProjectZip, validateProject, zipFiles } from '../src/studio/export.ts';
import { studioFolder } from '../src/studio/source.ts';
import { makeSongEntry } from '../src/library/song.ts';
import { loadChart } from '../src/chart/load.ts';
import { lineText } from '../src/chart/lyrics.ts';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const enc = new TextEncoder();
const project = () => createProject('metadata', 'recording.m4a', {
  duration: 65, bpm: 120, beatOffset: 0.21, confidence: 1, waveform: new Float32Array(6500), onsets: [],
});

test('LRC preserves repeated timestamps, offsets, clear lines, and millisecond timing', () => {
  const lines = timedLyrics('[ar:Artist]\n[offset:100]\n[00:01.25][00:05.250]Repeated\n[00:03.000]\n[00:08]Last\n[99:00.000]Outside', 10);
  assert.deepEqual(lines.map(line => [line.time, line.text, line.end]), [[1.15, 'Repeated', 2.9], [2.9, '', 5.15], [5.15, 'Repeated', 7.9], [7.9, 'Last', 10]]);
  assert.equal(lrcTimestamp(59.9999), '[01:00.000]');
  assert.equal(lyricsFile('Plain\ntext'), 'lyrics.txt');
  assert.equal(lyricsFile('[00:01.000]Timed'), 'lyrics.lrc');
  assert.equal(lyricsFile(''), null);
  const repeated = Array.from({ length: 1000 }, (_, i) => lrcTimestamp(i)).join('') + 'x'.repeat(2000);
  assert.ok(timedLyrics(repeated, 1200).reduce((sum, line) => sum + line.text.length, 0) <= MAX_LYRICS_LENGTH, 'repeated timestamps cannot amplify text beyond the budget');
});

test('chart lyrics retain recording times after tempo changes and do not invent timing for plain text', () => {
  const p = project();
  p.lyrics = '[00:00.000]Opening\n[00:12.300]Next line\n[00:15.000]\n[00:20.500]Last line';
  p.timing.push({ time: 10, bpm: 153.25 }, { time: 30, bpm: 87.5 });
  const chart = loadChart('notes.chart', enc.encode(chartText(p)), { delayMs: timingMap(p).offset * 1000 });
  assert.deepEqual(chart.lyrics.map(lineText), ['Opening', 'Next line', 'Last line']);
  for (const [i, time] of [0, 12.3, 20.5].entries()) assert.ok(Math.abs(chart.lyrics[i].startTime - time) < 0.003);
  assert.ok(Math.abs(chart.lyrics[1].endTime - 15) < 0.003);
  p.lyrics = 'Plain lyrics have no guessed timestamps';
  assert.equal(loadChart('notes.chart', enc.encode(chartText(p))).lyrics.length, 0);
});

test('cover types use signatures and reject unsupported content and oversized images', () => {
  assert.equal(coverFile(coverBlob(png)), 'album.png');
  assert.equal(coverFile(coverBlob(new Uint8Array([255, 216, 255, 0]))), 'album.jpg');
  assert.equal(coverFile(coverBlob(enc.encode('RIFF0000WEBPdata'))), 'album.webp');
  assert.throws(() => coverBlob(enc.encode('<svg onload="alert(1)"/>')));
  assert.throws(() => coverBlob(new Uint8Array(MAX_COVER_BYTES + 1)));
});

test('cover, album and lyrics round-trip with the maximum eight-file separated project', async () => {
  const p = project(), cover = coverBlob(png), audio = new Blob(['recording']);
  p.album = 'An album'; p.lyrics = '[00:01.000]Sing together\n[00:03.000]Next line';
  const stems = { guitar: new Blob(['guitar']), backing: new Blob(['backing']), model: 'htdemucs_6s' as const, gain: 1 };
  for (const tracks of [undefined, stems]) {
    const restored = await importProjectZip(await exportProject(p, audio, tracks, cover), 'new-project');
    assert.equal(restored.project.album, p.album); assert.equal(restored.project.lyrics, p.lyrics);
    assert.deepEqual(new Uint8Array(await restored.cover!.arrayBuffer()), png);
    assert.equal(restored.cover!.type, 'image/png');
    assert.equal(await restored.audio.text(), 'recording');
    const folder = studioFolder(restored.project, restored.stems, restored.cover), song = makeSongEntry(folder)!;
    assert.equal(song.albumArt, 'album.png'); assert.equal(song.album, p.album);
    assert.ok(folder.files.includes('lyrics.lrc'));
    assert.ok(loadChart('notes.chart', enc.encode(chartText(restored.project))).lyrics.length);
    assert.ok(songIni(restored.project).includes('album = An album'));
  }
  assert.throws(() => validateProject({ ...p, lyrics: 'x'.repeat(MAX_LYRICS_LENGTH + 1) }, 'bad'));
  assert.throws(() => validateProject({ ...p, album: {} }, 'bad'));
  const metadata = { ...p, analysis: { ...p.analysis, waveform: Array.from(p.analysis.waveform) }, coverFile: 'album.jpg' };
  const bytes = zipFiles([{ name: 'Song/studio.json', bytes: enc.encode(JSON.stringify(metadata)) }, { name: 'Song/song.m4a', bytes: enc.encode('audio') }, { name: 'Song/album.jpg', bytes: png }]);
  await assert.rejects(importProjectZip(new Blob([bytes]), 'bad'), /invalid cover/);
});

test('ID3 tags import title, artist, album, cover and original LRC; bad tags and cancellation are recoverable', async () => {
  const frame = (id: string, data: Uint8Array) => {
    const bytes = new Uint8Array(10 + data.length); bytes.set(enc.encode(id)); new DataView(bytes.buffer).setUint32(4, data.length); bytes.set(data, 10); return bytes;
  };
  const frames = [frame('TIT2', enc.encode('\0Tagged song')), frame('TPE1', enc.encode('\0Tagged artist')), frame('TALB', enc.encode('\0Tagged album')),
    frame('USLT', enc.encode('\0eng\0[offset:100]\n[00:01.000][00:03.000]Sing')),
    frame('APIC', new Uint8Array([...enc.encode('\0image/png\0'), 3, 0, ...png]))];
  const length = frames.reduce((sum, f) => sum + f.length, 0);
  const header = new Uint8Array([73, 68, 51, 3, 0, 0, length >>> 21 & 127, length >>> 14 & 127, length >>> 7 & 127, length & 127]);
  const signal = new AbortController().signal;
  const tags = await readSongMetadata(new Blob([header, ...frames], { type: 'audio/mpeg' }), signal);
  assert.equal(tags.title, 'Tagged song'); assert.equal(tags.artist, 'Tagged artist'); assert.equal(tags.album, 'Tagged album');
  assert.equal(tags.lyrics, '[offset:100]\n[00:01.000][00:03.000]Sing');
  assert.equal(tags.cover?.type, 'image/png');
  const extra = frame('TXXX', enc.encode('\0lyrics\0Plain custom lyrics'));
  const extraHeader = header.slice(); extraHeader.set([extra.length >>> 21 & 127, extra.length >>> 14 & 127, extra.length >>> 7 & 127, extra.length & 127], 6);
  assert.equal((await readSongMetadata(new Blob([extraHeader, extra], { type: 'audio/mpeg' }), signal)).lyrics, 'Plain custom lyrics');
  assert.ok((await readSongMetadata(new Blob(['bad tags']), signal)).warning);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(readSongMetadata(new Blob(['bad tags']), abort.signal), /abort/i);
});
