import type { Chart } from '../chart/build.ts';
import { loadChart } from '../chart/load.ts';
import type { Library } from '../library/library.ts';
import type { SongEntry } from '../library/song.ts';

// A few recent charts, so going back and forth in the song list does not reparse. Each holds only
// packed raw gems until a track is played, typically well under 100 KB.
const CACHE_SIZE = 6;
const caches = new WeakMap<Library, { revision: number; entries: Map<string, Promise<Chart>> }>();

/** Parse charts within one library revision; switching folders or rescanning drops stale results. */
export function chartFor(library: Library, song: SongEntry): Promise<Chart> {
  let scope = caches.get(library);
  if (!scope || scope.revision !== library.revision) {
    scope = { revision: library.revision, entries: new Map() };
    caches.set(library, scope);
  }
  const cache = scope.entries;
  let p = cache.get(song.id);
  if (!p) {
    p = library.readFile(song, song.chartFile).then((bytes) => loadChart(song.chartFile, bytes, song.chartOptions));
    const pending = p;
    void p.catch(() => { if (cache.get(song.id) === pending) cache.delete(song.id); });
  }
  // Refresh recency on hits as well as inserts.
  cache.delete(song.id);
  cache.set(song.id, p);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return p;
}
