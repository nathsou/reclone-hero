// Parses every chart in a real library (CHARTS_DIR, default /Volumes/S/charts) and reports problems.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { loadChart } from '../src/chart/load.ts';
import { makeSongEntry } from '../src/library/song.ts';
import { HOPO, TAP } from '../src/chart/types.ts';

const ROOT = process.env.CHARTS_DIR ?? '/Volumes/S/charts';

function* walk(dir: string, rel: string): Generator<{ abs: string; rel: string; files: string[] }> {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  if (files.some((f) => /\.(chart|mid)$/i.test(f))) yield { abs: dir, rel, files };
  for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.')) yield* walk(`${dir}/${e.name}`, rel ? `${rel}/${e.name}` : e.name);
}

test('parses the whole chart library', { skip: !existsSync(ROOT) && 'no library' }, () => {
  let songs = 0;
  let guitar = 0;
  const failures: string[] = [];
  const stats = { notes: 0, hopo: 0, tap: 0, open: 0, sp: 0, solos: 0, sustains: 0, sections: 0 };
  const t0 = performance.now();
  for (const folder of walk(ROOT, '')) {
    const iniName = folder.files.find((f) => f.toLowerCase() === 'song.ini');
    const entry = makeSongEntry({
      path: folder.rel,
      files: folder.files,
      ini: iniName ? readFileSync(`${folder.abs}/${iniName}`) : null,
      chartHead: null,
    });
    if (!entry) {
      failures.push(`${folder.rel}: no entry`);
      continue;
    }
    songs++;
    try {
      const chart = loadChart(entry.chartFile, readFileSync(`${folder.abs}/${entry.chartFile}`), entry.chartOptions);
      stats.sections += chart.sections.length;
      const t = chart.tracks.get('guitar:expert');
      if (!t) continue;
      guitar++;
      for (let i = 0; i < t.notes.length; i++) {
        const n = t.notes[i];
        if (!Number.isFinite(n.time) || (i > 0 && n.time < t.notes[i - 1].time)) throw new Error(`bad time at note ${i}`);
        stats.notes++;
        if (n.type === HOPO) stats.hopo++;
        if (n.type === TAP) stats.tap++;
        if (n.mask === 0) stats.open++;
        if (n.endTick > n.tick) stats.sustains++;
      }
      stats.sp += t.starPower.length;
      stats.solos += t.solos.length;
    } catch (err) {
      failures.push(`${folder.rel}: ${(err as Error).message}`);
    }
  }
  console.log(`${songs} songs, ${guitar} with expert guitar, ${(performance.now() - t0).toFixed(0)} ms`, stats);
  if (failures.length) console.log(failures.slice(0, 20).join('\n'));
  assert.equal(failures.length, 0);
});
