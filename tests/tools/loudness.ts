// Compatibility entry point for the full-song EBU R128 audit (requires FFmpeg).
// node tests/tools/loudness.ts [song-id...] [--write]
// @ts-expect-error Node process typings are intentionally minimal in this project.
import { spawnSync } from 'node:child_process';
const result = spawnSync('node', ['tests/tools/starter-audio-audit.mjs', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
