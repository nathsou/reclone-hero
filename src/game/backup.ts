// Export/import of everything the player builds up: settings, key and controller bindings, best scores.
// The charts folder itself cannot travel (browsers tie folder access to this machine).

import type { PlayStat } from './plays.ts';
import type { BestScore } from './scores.ts';

const APP = 'reclone-hero';
const FORMAT = 1;
const KEYS = { settings: 'chsq.settings', keys: 'chsq.keys', pads: 'chsq.pads', scores: 'chsq.scores', plays: 'chsq.plays', favourites: 'chsq.favourites' } as const;
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
    exportedAt: b.exportedAt,
  };
}

/**
 * Apply a backup. Settings and key bindings are replaced, controller profiles are merged per device,
 * and best scores are merged keeping the higher score, so importing never loses a record.
 */
export function applyBackup(b: Backup): void {
  const write = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));
  if (b.data.settings) write(KEYS.settings, b.data.settings);
  if (b.data.keys) write(KEYS.keys, b.data.keys);
  if (b.data.pads) write(KEYS.pads, { ...((read(KEYS.pads) as object) ?? {}), ...(b.data.pads as object) });
  if (b.data.scores) {
    const mine = (read(KEYS.scores) as Record<string, BestScore>) ?? {};
    for (const [k, s] of Object.entries(b.data.scores as Record<string, BestScore>)) {
      if (!mine[k] || s.score > mine[k].score) mine[k] = s;
    }
    write(KEYS.scores, mine);
  }
  if (b.data.plays) {
    // Play history: keep the larger count and the latest date per song.
    const mine = (read(KEYS.plays) as Record<string, PlayStat>) ?? {};
    for (const [k, p] of Object.entries(b.data.plays as Record<string, PlayStat>)) {
      const m = mine[k];
      mine[k] = m ? { count: Math.max(m.count, p.count), last: Math.max(m.last, p.last) } : p;
    }
    write(KEYS.plays, mine);
  }
  if (Array.isArray(b.data.favourites)) {
    // Favourites: the union of both lists.
    const mine = read(KEYS.favourites);
    write(KEYS.favourites, [...new Set([...(Array.isArray(mine) ? mine : []), ...b.data.favourites])]);
  }
}
