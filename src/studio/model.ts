import { DIFFICULTIES } from '../chart/types.ts';
import type { Difficulty, RawTempo } from '../chart/types.ts';
import { TempoMap } from '../chart/tempo.ts';
import type { Analysis, Onset } from './analysis.ts';

export interface StudioNote { id: number; time: number; length: number; lane: number; kind: 'auto' | 'tap' }
export interface LockedRange { start: number; end: number }
export interface TimingPoint { time: number; bpm: number }
export interface StudioProject {
  version: 1;
  id: string;
  name: string;
  artist: string;
  audioName: string;
  analysis: Analysis;
  /** Times stay in seconds so tempo corrections cannot move authored notes away from the recording. */
  timing: TimingPoint[];
  beatOffset: number;
  notes: Record<Difficulty, StudioNote[]>;
  locks: Record<Difficulty, LockedRange[]>;
  nextId: number;
}

export const PROFILES = {
  easy: { lanes: 3, gap: 0.38, fraction: 0.45, burst: 3 },
  medium: { lanes: 4, gap: 0.24, fraction: 0.65, burst: 4 },
  hard: { lanes: 5, gap: 0.145, fraction: 0.82, burst: 6 },
  expert: { lanes: 5, gap: 0.085, fraction: 1, burst: 9 },
} as const;

export function timingMap(p: StudioProject): { map: TempoMap; tempos: RawTempo[]; offset: number } {
  const first = p.timing[0];
  const period = 60 / first.bpm;
  // A negative origin permits notes before the first detected beat without negative chart ticks.
  const offset = Math.round((((p.beatOffset % period) + period) % period - period) * 1000) / 1000;
  const tempos: RawTempo[] = [{ tick: 0, usPerQuarter: 60e6 / first.bpm }];
  let tick = 0, lastTime = offset, bpm = first.bpm;
  for (const point of p.timing.slice(1)) {
    tick += (point.time - lastTime) * bpm / 60 * 480;
    tempos.push({ tick: Math.round(tick), usPerQuarter: 60e6 / point.bpm });
    lastTime = point.time; bpm = point.bpm;
  }
  return { map: new TempoMap(tempos, 480, offset), tempos, offset };
}

export function snapTime(p: StudioProject, time: number, division: number): number {
  if (!division) return Math.max(0, Math.min(p.analysis.duration, time));
  const { map } = timingMap(p), step = 480 / division;
  return Math.max(0, Math.min(p.analysis.duration, map.tickToTime(Math.round(map.timeToTick(time) / step) * step)));
}

export function createProject(id: string, filename: string, analysis: Analysis): StudioProject {
  const extension = filename.split('.').pop()?.toLowerCase() ?? 'wav';
  const p: StudioProject = {
    version: 1, id, name: filename.replace(/\.[^.]+$/, '').slice(0, 200), artist: 'Unknown Artist', audioName: `song.${extension}`,
    analysis, timing: [{ time: 0, bpm: analysis.bpm }], beatOffset: analysis.beatOffset,
    notes: { easy: [], medium: [], hard: [], expert: [] }, locks: { easy: [], medium: [], hard: [], expert: [] }, nextId: 1,
  };
  for (const diff of DIFFICULTIES) p.notes[diff] = generateNotes(p, diff);
  return p;
}

/** Strong attacks first, bounded density, and the easier charts are subsets of harder timings. */
function choose(p: StudioProject, diff: Difficulty): Onset[] {
  let candidates = p.analysis.onsets;
  const { map } = timingMap(p);
  for (const d of [...DIFFICULTIES].reverse()) {
    const cfg = PROFILES[d];
    const score = (o: Onset) => {
      const beat = map.timeToBeat(o.time), distance = Math.abs(beat - Math.round(beat));
      return o.strength + (distance < 0.12 ? 0.6 : distance > 0.4 ? 0.15 : 0);
    };
    const ranked = [...candidates].sort((a, b) => score(b) - score(a) || a.time - b.time);
    const chosen: Onset[] = [], target = Math.max(1, Math.ceil(candidates.length * cfg.fraction));
    for (const event of ranked) {
      if (chosen.length >= target) break;
      let lo = 0, hi = chosen.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (chosen[mid].time < event.time) lo = mid + 1; else hi = mid; }
      if ((chosen[lo] && chosen[lo].time - event.time < cfg.gap) || (lo > 0 && event.time - chosen[lo - 1].time < cfg.gap)) continue;
      // Check every one-second window containing the new attack, including windows straddling seconds.
      const near = chosen.slice(Math.max(0, lo - cfg.burst), lo + cfg.burst).filter((n) => Math.abs(n.time - event.time) < 1).map((n) => n.time).concat(event.time).sort((a, b) => a - b);
      if (near.some((time, i) => near[i + cfg.burst] !== undefined && near[i + cfg.burst] - time < 1)) continue;
      chosen.splice(lo, 0, event);
    }
    candidates = chosen.sort((a, b) => a.time - b.time);
    if (d === diff) break;
  }
  return candidates;
}

export function generateNotes(p: StudioProject, diff: Difficulty): StudioNote[] {
  const events = choose(p, diff), cfg = PROFILES[diff], notes: StudioNote[] = [];
  const tones = events.map((e) => e.tone).sort((a, b) => a - b);
  const low = tones[Math.floor(tones.length * 0.1)] ?? 0, high = tones[Math.floor(tones.length * 0.9)] ?? 1;
  let lane = 0;
  events.forEach((event, i) => {
    const target = Math.round((event.tone - low) / Math.max(0.25, high - low) * (cfg.lanes - 1));
    const previous = events[i - 1];
    if (!previous || event.time - previous.time > 0.8) lane = Math.max(0, Math.min(cfg.lanes - 1, target));
    else if (Math.abs(event.tone - previous.tone) > 0.12) {
      const step = Math.sign(event.tone - previous.tone);
      lane = Math.max(0, Math.min(cfg.lanes - 1, lane + step));
    }
    notes.push({ id: p.nextId++, time: event.time, lane, length: 0, kind: 'auto' });
    // Conservative two-fret accents; no pretend pitch transcription or guessed sustains in a full mix.
    const gap = (events[i + 1]?.time ?? p.analysis.duration) - event.time;
    if ((diff === 'hard' || diff === 'expert') && event.strength > (diff === 'expert' ? 1.3 : 1.7) && gap > 0.28 && (!previous || event.time - previous.time > 0.25)) {
      notes.push({ id: p.nextId++, time: event.time, lane: lane < 3 ? lane + 2 : lane - 2, length: 0, kind: 'auto' });
    }
  });
  return normalizeNotes(notes, p.analysis.duration);
}

/** Canonicalize edited chords and reject impossible/invalid values before storage or export. */
export function normalizeNotes(notes: StudioNote[], duration: number): StudioNote[] {
  const sorted = notes.filter((n) => Number.isFinite(n.time) && Number.isFinite(n.length) && Number.isInteger(n.lane) && n.lane >= 0 && n.lane < 5 && n.time >= 0 && n.time < duration)
    .map((n) => ({ ...n, time: Math.round(n.time * 10000) / 10000, length: Math.max(0, Math.min(n.length, duration - n.time)) }))
    .sort((a, b) => a.time - b.time || a.lane - b.lane);
  const out: StudioNote[] = [];
  for (const n of sorted) {
    const duplicate = out[out.length - 1];
    if (duplicate && duplicate.time === n.time && duplicate.lane === n.lane) duplicate.length = Math.max(duplicate.length, n.length);
    else out.push(n);
  }
  // A lane cannot be struck again while its previous gem is still held.
  const next = new Array<number>(5).fill(duration);
  for (let i = out.length - 1; i >= 0; i--) { const n = out[i]; n.length = Math.min(n.length, Math.max(0, next[n.lane] - n.time - 0.01)); next[n.lane] = n.time; }
  return out;
}

export function regenerate(p: StudioProject, diff: Difficulty, range: LockedRange): void {
  const editable = (time: number) => time >= range.start && time < range.end && !p.locks[diff].some((r) => time >= r.start && time < r.end);
  const kept = p.notes[diff].filter((n) => !editable(n.time));
  const fresh = generateNotes(p, diff).filter((n) => editable(n.time));
  // Leave space at protected boundaries instead of creating a fast accidental double-strum.
  p.notes[diff] = normalizeNotes([...kept, ...fresh.filter((n) => !kept.some((k) =>
    Math.abs(k.time - n.time) < PROFILES[diff].gap || (k.lane === n.lane && n.time > k.time && n.time < k.time + k.length + 0.01),
  ))], p.analysis.duration);
}

export function chartText(p: StudioProject, audioName = p.audioName): string {
  const { map, tempos } = timingMap(p);
  const clean = (s: string) => s.replace(/[\r\n"{}\[\]]/g, ' ').trim();
  const lines = ['[Song]', '{', `  Name = "${clean(p.name)}"`, `  Artist = "${clean(p.artist)}"`, '  Charter = "Chart Studio"', '  Resolution = 480', '  Offset = 0', `  MusicStream = "${audioName}"`, '}', '[SyncTrack]', '{', '  0 = TS 4'];
  for (const t of tempos) lines.push(`  ${t.tick} = B ${Math.round(60e9 / t.usPerQuarter)}`);
  lines.push('}', '[Events]', '{');
  const end = map.timeToTick(p.analysis.duration);
  const firstTick = Math.ceil(map.timeToTick(0)), lastTick = Math.ceil(end) - 1;
  for (let tick = 0, section = 1; tick < end; tick += 480 * 32, section++) lines.push(`  ${tick} = E "section Passage ${section}"`);
  lines.push('}');
  for (const diff of DIFFICULTIES) {
    lines.push(`[${diff[0].toUpperCase() + diff.slice(1)}Single]`, '{');
    const tapTicks = new Set<number>();
    const gems = new Map<string, { tick: number; lane: number; length: number }>();
    for (const n of normalizeNotes(p.notes[diff], p.analysis.duration)) {
      const tick = Math.max(firstTick, Math.min(lastTick, Math.round(map.timeToTick(n.time))));
      const length = Math.max(0, Math.min(lastTick, Math.round(map.timeToTick(n.time + n.length))) - tick);
      const key = `${tick}:${n.lane}`, existing = gems.get(key);
      gems.set(key, { tick, lane: n.lane, length: Math.max(length, existing?.length ?? 0) });
      if (n.kind === 'tap') tapTicks.add(tick);
    }
    const events = [...gems.values()].map((g) => ({ tick: g.tick, line: `N ${g.lane} ${g.length}` }));
    for (const tick of tapTicks) events.push({ tick, line: 'N 6 0' });
    for (const e of events.sort((a, b) => a.tick - b.tick)) lines.push(`  ${e.tick} = ${e.line}`);
    lines.push('}');
  }
  return lines.join('\n') + '\n';
}

export function songIni(p: StudioProject): string {
  const clean = (s: string) => s.replace(/[\r\n]/g, ' ');
  return `[song]\nname = ${clean(p.name)}\nartist = ${clean(p.artist)}\ncharter = Chart Studio\nsong_length = ${Math.round(p.analysis.duration * 1000)}\ndelay = ${Math.round(timingMap(p).offset * 1000)}\n`;
}

/** Undo stores chart state only: never duplicates audio, analysis, or waveform data. */
export class StudioHistory {
  private past: string[] = [];
  private future: string[] = [];
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  private snapshot(p: StudioProject): string { return JSON.stringify({ notes: p.notes, locks: p.locks, timing: p.timing, beatOffset: p.beatOffset, nextId: p.nextId }); }
  capture(p: StudioProject): void { this.past.push(this.snapshot(p)); if (this.past.length > 80) this.past.shift(); this.future = []; }
  undo(p: StudioProject): boolean { const s = this.past.pop(); if (!s) return false; this.future.push(this.snapshot(p)); Object.assign(p, JSON.parse(s)); return true; }
  redo(p: StudioProject): boolean { const s = this.future.pop(); if (!s) return false; this.past.push(this.snapshot(p)); Object.assign(p, JSON.parse(s)); return true; }
}
