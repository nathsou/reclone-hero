import type { ChartOptions, Instrument } from '../chart/types.ts';
import { iniBool, iniNumber, parseIni, songSection } from '../util/ini.ts';
import type { IniSection } from '../util/ini.ts';
import { decodeText, stripTags } from '../util/text.ts';

/** A song folder as discovered by a library source. */
export interface RawSongFolder {
  path: string;
  files: string[];
  ini: Uint8Array | null;
  /** first bytes of notes.chart, used for metadata when there is no song.ini */
  chartHead: Uint8Array | null;
}

export interface SongEntry {
  id: string;
  path: string;
  pack: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  charter: string;
  lengthMs: number;
  chartFile: string;
  /** stem name (lower-case, no extension) -> file name */
  stems: Record<string, string>;
  albumArt: string | null;
  background: string | null;
  video: string | null;
  videoStartMs: number;
  /** -1 means the part is absent; undefined means unknown (resolved when the chart is parsed) */
  diffs: Partial<Record<Instrument, number>>;
  previewStartMs: number;
  loadingPhrase: string;
  chartOptions: ChartOptions;
}

const STEM_RE = /^(song|guitar|bass|rhythm|keys|vocals(?:_\d)?|drums(?:_\d)?|crowd|preview)\.(ogg|opus|mp3|wav)$/i;
const FORMAT_RANK: Record<string, number> = { opus: 0, ogg: 1, mp3: 2, wav: 3 };
const DIFF_KEYS: Record<Instrument, string> = {
  guitar: 'diff_guitar',
  bass: 'diff_bass',
  rhythm: 'diff_rhythm',
  keys: 'diff_keys',
  guitarcoop: 'diff_guitar_coop',
  drums: 'diff_drums',
  vocals: 'diff_vocals',
  touch: 'diff_guitar',
};

export function makeSongEntry(folder: RawSongFolder): SongEntry | null {
  const lower = new Map(folder.files.map((f) => [f.toLowerCase(), f]));
  const chartFile =
    lower.get('notes.mid') ?? lower.get('notes.chart') ?? folder.files.find((f) => /\.chart$/i.test(f)) ?? folder.files.find((f) => /\.mid$/i.test(f));
  if (!chartFile) return null;

  const stems: Record<string, string> = {};
  for (const f of folder.files) {
    const m = STEM_RE.exec(f);
    if (!m) continue;
    const stem = m[1].toLowerCase();
    const prev = stems[stem];
    if (!prev || FORMAT_RANK[m[2].toLowerCase()] < FORMAT_RANK[prev.split('.').pop()!.toLowerCase()]) stems[stem] = f;
  }
  if (Object.keys(stems).filter((s) => s !== 'preview').length === 0) return null;

  let sec: IniSection = {};
  if (folder.ini) sec = songSection(parseIni(decodeText(folder.ini)));
  else if (folder.chartHead) sec = chartHeadMeta(decodeText(folder.chartHead));

  const segs = folder.path.split('/');
  const folderName = segs[segs.length - 1] ?? folder.path;
  const pick = (...names: string[]) => names.map((n) => lower.get(n)).find((f) => f) ?? null;
  const diffs: Partial<Record<Instrument, number>> = {};
  for (const [inst, key] of Object.entries(DIFF_KEYS) as [Instrument, string][]) {
    const v = iniNumber(sec, key);
    if (v !== undefined) diffs[inst] = v;
  }
  const str = (k: string) => stripTags(sec[k] ?? '');

  return {
    id: folder.path,
    path: folder.path,
    pack: segs.length > 1 ? segs[0] : '',
    name: str('name') || folderName,
    artist: str('artist') || 'Unknown Artist',
    album: str('album'),
    genre: str('genre'),
    year: str('year').replace(/^[,\s]+/, ''),
    charter: str('charter') || str('frets'),
    lengthMs: iniNumber(sec, 'song_length') ?? 0,
    chartFile,
    stems,
    albumArt: pick('album.png', 'album.jpg', 'album.jpeg'),
    background: pick('background.png', 'background.jpg', 'background.jpeg'),
    video: pick('video.webm', 'video.mp4', 'bg.webm', 'bg.mp4'),
    videoStartMs: iniNumber(sec, 'video_start_time') ?? 0,
    diffs,
    previewStartMs: Math.max(0, iniNumber(sec, 'preview_start_time') ?? iniNumber(sec, 'previewstart') ?? 0),
    loadingPhrase: str('loading_phrase'),
    chartOptions: {
      hopoFrequency: iniNumber(sec, 'hopo_frequency'),
      eighthNoteHopo: iniBool(sec, 'eighthnote_hopo'),
      sustainCutoff: iniNumber(sec, 'sustain_cutoff_threshold'),
      multiplierNote: iniNumber(sec, 'multiplier_note'),
      delayMs: iniNumber(sec, 'delay') ?? 0,
    },
  };
}

/** Read the [Song] block of a .chart file into ini-style keys. */
function chartHeadMeta(text: string): IniSection {
  const out: IniSection = {};
  const m = /\[Song\]\s*\{([^}]*)/.exec(text);
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim().toLowerCase();
    const v = line.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    out[k] = v;
  }
  if (out['previewstart']) out['previewstart'] = String(Number(out['previewstart']) * 1000);
  return out;
}
