import type { Chart } from '../chart/build.ts';
import { loadChart } from '../chart/load.ts';
import type { Library } from '../library/library.ts';
import type { SongEntry } from '../library/song.ts';

const cache = new Map<string, Promise<Chart>>();

/** Parse (and memoise a few) charts for songs. */
export function chartFor(library: Library, song: SongEntry): Promise<Chart> {
  let p = cache.get(song.id);
  if (!p) {
    p = library.readFile(song, song.chartFile).then((bytes) => loadChart(song.chartFile, bytes, song.chartOptions));
    p.catch(() => cache.delete(song.id));
    cache.set(song.id, p);
    if (cache.size > 24) cache.delete(cache.keys().next().value!);
  }
  return p;
}
