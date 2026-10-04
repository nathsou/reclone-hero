// Export/import of everything the player builds up: settings, key and controller bindings, best scores,
// favourites and hidden songs.
// The charts folder itself cannot travel (browsers tie folder access to this machine).

import type { PlayStat } from './plays.ts';
import type { BestScore } from './scores.ts';
import { mergeHistory } from './history.ts';
import { mergeSetlists } from './setlists.ts';
import type { TrackHistory } from './history.ts';

const APP = 'reclone-hero';
const FORMAT = 1;
const KEYS = { settings: 'chsq.settings', keys: 'chsq.keys', pads: 'chsq.pads', scores: 'chsq.scores', plays: 'chsq.plays', favourites: 'chsq.favourites', hidden: 'chsq.hidden', history: 'chsq.history', setlists: 'chsq.setlists' } as const;
type Section = keyof typeof KEYS;

export interface Backup {
  app: typeof APP;
  format: number;
  exportedAt: string;
  data: Partial<Record<Section, unknown>>;
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function makeBackup(): Backup {
  const data: Backup['data'] = {};
  for (const [section, key] of Object.entries(KEYS) as [Section, string][]) {
    const v = read(key);
    if (v !== undefined) data[section] = v;
  }
  return { app: APP, format: FORMAT, exportedAt: new Date().toISOString(), data };
}

export function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(makeBackup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reclone-hero-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface BackupSummary {
  settings: boolean;
  keys: boolean;
  controllers: number;
  scores: number;
  plays: number;
  favourites: number;
  hidden: number;
  /** parts with a run history */
  history: number;
  setlists: number;
  exportedAt: string;
}

export function parseBackup(text: string): Backup {
  let b: Backup;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!b || b.app !== APP || typeof b.data !== 'object') throw new Error('This is not a reclone hero backup.');
  if (b.format > FORMAT) throw new Error('This backup comes from a newer version of reclone hero.');
  return b;
}

export function summarize(b: Backup): BackupSummary {
  return {
    settings: !!b.data.settings,
    keys: !!b.data.keys,
    controllers: b.data.pads ? Object.keys(b.data.pads as object).length : 0,
    scores: b.data.scores ? Object.keys(b.data.scores as object).length : 0,
    plays: b.data.plays ? Object.keys(b.data.plays as object).length : 0,
    favourites: Array.isArray(b.data.favourites) ? b.data.favourites.length : 0,
    hidden: Array.isArray(b.data.hidden) ? b.data.hidden.length : 0,
    history: isObj(b.data.history) ? Object.keys(b.data.history).length : 0,
    setlists: Array.isArray(b.data.setlists) ? b.data.setlists.length : 0,
    exportedAt: b.exportedAt,
  };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** A best score as it must look to be shown: anything else in a (hand-edited) file is skipped. */
function validScore(s: unknown): s is BestScore {
  return isObj(s) && isNum(s.score) && isNum(s.stars) && isNum(s.accuracy) && typeof s.fc === 'boolean' && isNum(s.date);
}

function validPlay(p: unknown): p is PlayStat {
  return isObj(p) && isNum(p.count) && isNum(p.last);
}

/**
 * Apply a backup. Throws if storage is full (the caller shows the message). Settings and key bindings are replaced, controller profiles are merged per device,
 * and best scores are merged keeping the higher score, so importing never loses a record.
 */
export function applyBackup(b: Backup): void {
  const write = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
  if (isObj(b.data.settings)) write(KEYS.settings, b.data.settings);
  if (isObj(b.data.keys)) write(KEYS.keys, b.data.keys);
  if (isObj(b.data.pads)) write(KEYS.pads, { ...(isObj(read(KEYS.pads)) ? (read(KEYS.pads) as object) : {}), ...b.data.pads });
  if (isObj(b.data.scores)) {
    const stored = read(KEYS.scores);
    const mine = (isObj(stored) ? stored : {}) as Record<string, BestScore>;
    for (const [k, s] of Object.entries(b.data.scores)) {
      if (validScore(s) && (!mine[k] || s.score > mine[k].score)) mine[k] = s;
    }
    write(KEYS.scores, mine);
  }
  if (isObj(b.data.plays)) {
    // Play history: keep the larger count and the latest date per song.
    const stored = read(KEYS.plays);
    const mine = (isObj(stored) ? stored : {}) as Record<string, PlayStat>;
    for (const [k, p] of Object.entries(b.data.plays)) {
      if (!validPlay(p)) continue;
      const m = mine[k];
      mine[k] = m ? { count: Math.max(m.count, p.count), last: Math.max(m.last, p.last) } : p;
    }
    write(KEYS.plays, mine);
  }
  // Run history: runs combined, the better best at each speed and set of modifiers.
  if (isObj(b.data.history)) {
    const stored = read(KEYS.history);
    write(KEYS.history, mergeHistory((isObj(stored) ? stored : {}) as Record<string, TrackHistory>, b.data.history));
  }
  if (Array.isArray(b.data.setlists)) write(KEYS.setlists, mergeSetlists(read(KEYS.setlists), b.data.setlists));
  // Favourites and hidden songs: the union of both lists.
  for (const section of ['favourites', 'hidden'] as const) {
    const theirs = b.data[section];
    if (!Array.isArray(theirs)) continue;
    const mine = read(KEYS[section]);
    const ids = theirs.filter((x): x is string => typeof x === 'string');
    write(KEYS[section], [...new Set([...(Array.isArray(mine) ? mine : []), ...ids])]);
  }
}
