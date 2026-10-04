// Every run of every part, for score history: the most recent runs, and the best run at each song speed
// and set of modifiers (a "variant"). The plain best score (scores.ts) stays the one shown everywhere.

import type { PlayedWith } from './scores.ts';

export interface Run {
  score: number;
  stars: number;
  accuracy: number;
  fc: boolean;
  /** epoch ms */
  date: number;
  input?: PlayedWith;
  /** song speed, 1 = as recorded */
  speed: number;
  /** modifiers that were on (ids, sorted) */
  mods: string[];
}

export interface TrackHistory {
  /** oldest first, at most MAX_RUNS */
  runs: Run[];
  /** variant key -> best run */
  bests: Record<string, Run>;
}

const KEY = 'chsq.history';
export const MAX_RUNS = 25;
let cache: Record<string, TrackHistory> | null = null;

function all(): Record<string, TrackHistory> {
  if (!cache) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      cache = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch {
      cache = {};
    }
  }
  return cache!;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(all()));
  } catch {
    // storage full or unavailable: history is a nicety
  }
}

/** "100", "75", "100+mirror": what a best is kept per. */
export function variantKey(speed: number, mods: readonly string[]): string {
  const pct = String(Math.round(speed * 100));
  return mods.length ? `${pct}+${[...mods].sort().join('+')}` : pct;
}

/** "75% · mirror, all taps" for a variant key; names maps modifier ids to labels. */
export function variantLabel(key: string, names: Record<string, string> = {}): string {
  const [pct, ...mods] = key.split('+');
  return [`${pct}%`, mods.map((m) => names[m] ?? m).join(', ')].filter(Boolean).join(' · ');
}

export function getHistory(scoreKey: string): TrackHistory | undefined {
  return all()[scoreKey];
}

/** Add a run; returns whether it is the best yet at its speed and modifiers. */
export function recordRun(scoreKey: string, run: Run): boolean {
  const h = (all()[scoreKey] ??= { runs: [], bests: {} });
  h.runs.push(run);
  if (h.runs.length > MAX_RUNS) h.runs.splice(0, h.runs.length - MAX_RUNS);
  const v = variantKey(run.speed, run.mods);
  const prev = h.bests[v];
  const best = !prev || run.score > prev.score;
  if (best) h.bests[v] = run;
  save();
  return best;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** A run as it must look to be shown: anything else in a (hand-edited) backup is dropped. */
export function validRun(r: unknown): r is Run {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return isNum(o.score) && isNum(o.stars) && isNum(o.accuracy) && typeof o.fc === 'boolean' && isNum(o.date) && isNum(o.speed) && Array.isArray(o.mods) && o.mods.every((m) => typeof m === 'string');
}

/** Merge another computer's history into this one: runs combined (latest kept), the better best per variant. */
export function mergeHistory(mine: Record<string, TrackHistory>, theirs: unknown): Record<string, TrackHistory> {
  if (!theirs || typeof theirs !== 'object' || Array.isArray(theirs)) return mine;
  for (const [k, t] of Object.entries(theirs as Record<string, unknown>)) {
    if (!t || typeof t !== 'object') continue;
    const th = t as { runs?: unknown; bests?: unknown };
    const runs = Array.isArray(th.runs) ? th.runs.filter(validRun) : [];
    const bests = th.bests && typeof th.bests === 'object' ? Object.entries(th.bests as Record<string, unknown>).filter((e): e is [string, Run] => validRun(e[1])) : [];
    const m = (mine[k] ??= { runs: [], bests: {} });
    const seen = new Set(m.runs.map((r) => `${r.date}|${r.score}`));
    for (const r of runs) if (!seen.has(`${r.date}|${r.score}`)) m.runs.push(r);
    m.runs.sort((a, b) => a.date - b.date);
    if (m.runs.length > MAX_RUNS) m.runs.splice(0, m.runs.length - MAX_RUNS);
    for (const [v, r] of bests) if (!m.bests[v] || r.score > m.bests[v].score) m.bests[v] = r;
  }
  return mine;
}
