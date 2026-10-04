import type { Chart } from '../chart/build.ts';
import type { Difficulty, Instrument } from '../chart/types.ts';
import { DIFFICULTIES, INSTRUMENTS, trackKey } from '../chart/types.ts';
import { chartFor } from '../game/charts.ts';
import type { Setlist } from '../game/setlists.ts';
import type { SongEntry } from '../library/song.ts';
import { settings } from '../settings.ts';
import type { App } from './app.ts';

/** How one song of a setlist went. */
export interface SetlistResult {
  score: number;
  stars: number;
  accuracy: number;
  fc: boolean;
  failed: boolean;
  /** "Guitar · expert": the part played (it can differ from the one asked for) */
  part: string;
  /** why the song was not played, e.g. no guitar part */
  skipped?: string;
}

/** A setlist being played: the songs in order, where we are, and how each went. */
export interface SetlistRun {
  name: string;
  songs: SongEntry[];
  index: number;
  results: (SetlistResult | undefined)[];
  instrument: Instrument;
  difficulty: Difficulty;
}

/** The part to play: the wanted instrument (else guitar, else any) at the nearest difficulty, easier first. */
export function pickPart(chart: Pick<Chart, 'tracks'>, instrument: Instrument, difficulty: Difficulty): { instrument: Instrument; difficulty: Difficulty } | null {
  const has = (i: Instrument, d: Difficulty) => chart.tracks.has(trackKey(i, d));
  const insts = [instrument, 'guitar' as const, ...INSTRUMENTS.filter((i) => i !== instrument && i !== 'guitar')];
  const inst = insts.find((i) => DIFFICULTIES.some((d) => has(i, d)));
  if (!inst) return null;
  const want = DIFFICULTIES.indexOf(difficulty);
  const order = DIFFICULTIES.map((d, i) => ({ d, cost: i <= want ? want - i : i - want + 0.5 })).sort((a, b) => a.cost - b.cost);
  return { instrument: inst, difficulty: order.find((o) => has(inst, o.d))!.d };
}

/** Start a setlist with the songs of it that are in the library. */
export async function startSetlist(app: App, list: Setlist): Promise<void> {
  const byId = new Map(app.library.songs.map((s) => [s.id, s]));
  const songs = list.songs.map((id) => byId.get(id)).filter((s): s is SongEntry => !!s);
  if (!songs.length) {
    app.toast('None of the songs in this setlist are in the library.');
    return;
  }
  app.closeModals();
  const run: SetlistRun = { name: list.name, songs, index: 0, results: [], instrument: settings.instrument, difficulty: settings.difficulty };
  await playSetlistSong(app, run);
}

/** Load the current song of the run and play it; songs that cannot be played are skipped. */
export async function playSetlistSong(app: App, run: SetlistRun): Promise<void> {
  const song = run.songs[run.index];
  let chart: Chart;
  try {
    chart = await chartFor(app.library, song);
  } catch (err) {
    return skip(app, run, `the chart could not be read (${(err as Error).message})`);
  }
  const part = pickPart(chart, run.instrument, run.difficulty);
  if (!part) return skip(app, run, 'the chart has no notes');
  const { GameScreen } = await import('./screens/gamescreen.ts');
  app.show(new GameScreen(app, { song, chart, ...part, bot: false, speed: settings.songSpeed, mods: settings.modifiers, setlist: run }));
}

function skip(app: App, run: SetlistRun, why: string): Promise<void> {
  const song = run.songs[run.index];
  app.toast(`Skipping ${song.name}: ${why}.`);
  run.results[run.index] = { score: 0, stars: 0, accuracy: 0, fc: false, failed: false, part: '', skipped: why };
  return nextInSetlist(app, run);
}

/** On to the next song, or the setlist's results after the last. */
export async function nextInSetlist(app: App, run: SetlistRun): Promise<void> {
  run.index++;
  if (run.index < run.songs.length) return playSetlistSong(app, run);
  const { SetlistSummary } = await import('./screens/setlistSummary.ts');
  app.show(new SetlistSummary(app, run));
}
