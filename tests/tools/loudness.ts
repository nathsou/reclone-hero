// Loudness of the built-in songs, and the level trims that even them out.
//   node tests/tools/loudness.ts [song-id…] [--write]
// Renders each song as the game does (with its current trim), measures the gated RMS of the full
// mix (seconds quieter than -40 dB are ignored, so quiet intros do not count), and suggests the trim
// that brings it to TARGET. With --write the suggestions go to src/starter/songs/levels.ts; the
// limiter makes gain changes non-linear, so run it again until nothing moves.
// @ts-expect-error node types are not installed
import { writeFileSync } from 'node:fs';
import { renderSong, songSeconds } from '../../src/starter/render.ts';
import { LEVELS } from '../../src/starter/songs/levels.ts';
import { STARTER_SONGS } from '../../src/starter/songs/index.ts';

const TARGET = -12;
const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.filter((a) => !a.startsWith('--'));
const sr = 44100;
const db = (x: number) => 10 * Math.log10(Math.max(x, 1e-12));

const next: Record<string, number> = { ...LEVELS };
for (const def of STARTER_SONGS) {
  if (only.length && !only.includes(def.id)) continue;
  let acc = 0;
  let cnt = 0;
  let sum = 0;
  let loud = 0;
  let peak = 0;
  for (const b of renderSong(def, sr, 0, songSeconds(def))) {
    for (let i = 0; i < b.n; i++) {
      const l = b.pl[i] + b.bl[i];
      const r = b.pr[i] + b.br[i];
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      acc += (l * l + r * r) / 2;
      if (++cnt === sr) {
        if (db(acc / cnt) > -40) {
          sum += acc;
          loud += cnt;
        }
        acc = cnt = 0;
      }
    }
  }
  const level = db(sum / Math.max(1, loud));
  const trim = def.levelDb ?? 0;
  const suggest = Math.round((trim + TARGET - level) * 10) / 10;
  next[def.id] = suggest;
  console.log(`${def.id.padEnd(26)} ${level.toFixed(1).padStart(6)} dB  peak ${db(peak * peak).toFixed(1)} dB  trim ${trim.toFixed(1).padStart(5)} -> ${suggest.toFixed(1)}`);
}

if (write) {
  const lines = Object.keys(next)
    .sort()
    .map((id) => `  '${id}': ${next[id]},`);
  writeFileSync(
    new URL('../../src/starter/songs/levels.ts', import.meta.url),
    `/**\n * Level trims (dB) that bring the built-in songs to about the same loudness. Written by\n * \`node tests/tools/loudness.ts --write\`; songs not listed play at 0 dB.\n */\nexport const LEVELS: Record<string, number> = {\n${lines.join('\n')}\n};\n`,
  );
  console.log('wrote src/starter/songs/levels.ts');
}
