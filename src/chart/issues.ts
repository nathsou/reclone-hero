import { formatTime } from '../util/text.ts';
import type { Chart } from './build.ts';
import { DIFFICULTIES, INSTRUMENTS, trackKey } from './types.ts';

/** error: cannot be played; warn: plays, but something is likely wrong; info: worth knowing. */
export type IssueLevel = 'error' | 'warn' | 'info';

export interface ChartIssue {
  level: IssueLevel;
  code: 'unreadable' | 'no-notes' | 'tempo' | 'too-long' | 'late-start' | 'past-length' | 'stacked-notes';
  text: string;
}

const LEVEL_RANK: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2 };
/** A first note this late is worth a mention (it can be skipped in game). */
const LATE_START = 30;
/** Distinct notes closer than this are almost certainly a charting slip (chord gems a tick apart). */
const STACKED = 0.01;

/**
 * Problems with a parsed chart. The quick checks only read what the chart keeps while browsing; `deep`
 * also builds every Expert part to look at the notes themselves (for a library check, not for browsing).
 */
export function chartIssues(chart: Chart, song: { lengthMs: number }, opts: { deep?: boolean } = {}): ChartIssue[] {
  const out: ChartIssue[] = [];
  let total = 0;
  for (const inst of INSTRUMENTS) for (const d of DIFFICULTIES) total += chart.noteCount(trackKey(inst, d));
  if (total === 0 || !Number.isFinite(chart.firstNoteTime)) {
    out.push({ level: 'error', code: 'no-notes', text: 'This chart has no notes on any part.' });
    return out;
  }

  const { min, max } = chart.tempo.bpmRange();
  if (min < 1 || max > 5000) {
    const bpm = min < 1 ? min : max;
    out.push({ level: 'warn', code: 'tempo', text: `A tempo of ${bpm < 10 ? bpm.toFixed(2) : Math.round(bpm)} BPM: note timing is probably broken.` });
  }
  if (chart.lastNoteTime > 2 * 3600) {
    out.push({ level: 'warn', code: 'too-long', text: `The notes run for ${Math.round(chart.lastNoteTime / 60)} minutes: the tempo map is probably broken.` });
  }
  const songLength = song.lengthMs / 1000;
  if (songLength > 0 && chart.lastNoteTime > songLength + 10) {
    out.push({ level: 'info', code: 'past-length', text: `Notes continue until ${formatTime(chart.lastNoteTime)}, past the ${formatTime(songLength)} song.ini gives as its length.` });
  }
  if (chart.firstNoteTime >= LATE_START) {
    out.push({ level: 'info', code: 'late-start', text: `The first note comes at ${formatTime(chart.firstNoteTime)}. Hold red + yellow + blue + orange in game to skip the intro.` });
  }

  if (opts.deep) {
    let stacked = 0;
    for (const inst of INSTRUMENTS) {
      if (inst === 'touch') continue; // folded from the guitar part
      const notes = chart.tracks.get(trackKey(inst, 'expert'))?.notes;
      if (!notes) continue;
      // (drum gems of one chord share a time: only near misses count)
      for (let i = 1; i < notes.length; i++) {
        const dt = notes.time[i] - notes.time[i - 1];
        if (dt > 0 && dt < STACKED) stacked++;
      }
    }
    if (stacked) {
      out.push({ level: 'warn', code: 'stacked-notes', text: `${stacked} note${stacked > 1 ? 's sit' : ' sits'} less than 10 ms after the one before: chord gems that should share a tick probably don't.` });
    }
  }
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

/** The most serious level in a list, or null for none. */
export function worstLevel(issues: readonly ChartIssue[]): IssueLevel | null {
  let worst: IssueLevel | null = null;
  for (const i of issues) if (!worst || LEVEL_RANK[i.level] < LEVEL_RANK[worst]) worst = i.level;
  return worst;
}

// What is known about songs looked at this session (selected in the song list, or checked), by song id.
const known = new Map<string, ChartIssue[]>();

export function rememberIssues(songId: string, issues: ChartIssue[]): void {
  known.set(songId, issues);
}

export function knownIssues(songId: string): ChartIssue[] | undefined {
  return known.get(songId);
}
