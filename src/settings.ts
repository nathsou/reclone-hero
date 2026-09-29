import type { Difficulty, Instrument } from './chart/types.ts';
import type { GenreFilter } from './library/genres.ts';

export type MissFeedback = 'auto' | 'mute' | 'muffle' | 'off';
export type Quality = 'high' | 'medium' | 'low';
export type Theme = 'system' | 'classic' | 'ink' | 'swiss' | 'baroque' | 'synthwave' | 'terminal' | 'paper' | 'midnight';
export type NoteStyle = 'theme' | 'dome' | 'studio' | 'glass' | 'neon' | 'baroque' | 'pixel';
export type SongView = 'list' | 'covers';

export interface Settings {
  noteSpeed: number;
  /** ms; positive when audio reaches your ears late (Bluetooth etc.) */
  audioOffsetMs: number;
  /** ms; positive when the display lags */
  videoOffsetMs: number;
  hitWindowMs: number;
  strumLeniencyMs: number;
  lefty: boolean;
  /** keyboard: a fret key press also strums (no separate strum key needed) */
  kbTapMode: boolean;
  /** on-screen frets: shown on touch screens ('auto'), always, or never */
  touchControls: 'auto' | 'on' | 'off';
  /** Star Power goes off by itself as soon as it can, just before the next notes */
  autoStarPower: boolean;
  /** list the songs that ship with the game */
  builtinSongs: boolean;
  /** song list: only starred songs */
  favouritesOnly: boolean;
  timingBar: boolean;
  missFeedback: MissFeedback;
  missSounds: boolean;
  volMaster: number;
  volSong: number;
  volInstrument: number;
  volSfx: number;
  volCrowd: number;
  volPreview: number;
  quality: Quality;
  theme: Theme;
  noteStyle: NoteStyle;
  songView: SongView;
  showFps: boolean;
  instrument: Instrument;
  difficulty: Difficulty;
  sort: 'artist' | 'name' | 'difficulty' | 'length' | 'year' | 'genre' | 'charter' | 'pack' | 'plays' | 'recent';
  /** flip the sort's natural direction */
  sortReverse: boolean;
  genreFilter: GenreFilter;
}

export const DEFAULT_SETTINGS: Settings = {
  noteSpeed: 1,
  audioOffsetMs: 0,
  videoOffsetMs: 0,
  hitWindowMs: 90,
  strumLeniencyMs: 70,
  lefty: false,
  kbTapMode: true,
  touchControls: 'auto',
  autoStarPower: false,
  builtinSongs: true,
  favouritesOnly: false,
  timingBar: true,
  missFeedback: 'auto',
  missSounds: true,
  volMaster: 0.9,
  volSong: 0.9,
  volInstrument: 1,
  volSfx: 0.7,
  volCrowd: 0.5,
  volPreview: 0.6,
  quality: 'high',
  theme: 'system',
  noteStyle: 'theme',
  songView: 'list',
  showFps: false,
  instrument: 'guitar',
  difficulty: 'expert',
  sort: 'artist',
  sortReverse: false,
  genreFilter: { mode: 'hide', items: [] },
};

const KEY = 'chsq.settings';
const VERSION = 2;
type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();

/**
 * Version 1 saved every setting, so stored defaults could never change. Drop values that still equal
 * the old defaults; from version 2 on only values that differ from the defaults are stored.
 */
const V1_DEFAULTS: Partial<Record<string, unknown>> = { hitWindowMs: 70, strumLeniencyMs: 50 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, unknown>;
      if (stored.v !== VERSION) for (const [k, v] of Object.entries(V1_DEFAULTS)) if (stored[k] === v) delete stored[k];
      // Neon and Light were replaced by Classic dark and Daylight ink.
      if (stored.theme === 'dark' || stored.theme === 'neon') stored.theme = 'classic';
      else if (stored.theme === 'light') stored.theme = 'ink';
      delete stored.v;
      return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
    }
  } catch {
    // ignore corrupt or unavailable storage
  }
  return { ...DEFAULT_SETTINGS };
}

export const settings: Settings = load();

function save() {
  const diff: Record<string, unknown> = { v: VERSION };
  for (const k of Object.keys(settings) as (keyof Settings)[]) {
    if (JSON.stringify(settings[k]) !== JSON.stringify(DEFAULT_SETTINGS[k])) diff[k] = settings[k];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(diff));
  } catch {
    // storage unavailable
  }
}
save();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  save();
  for (const l of listeners) l(settings);
}

export function onSettingsChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
