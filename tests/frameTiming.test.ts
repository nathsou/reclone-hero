import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_CHART } from './bench/fixture.ts';
import { install, clock, mockCanvas, mockGL, rafQueue } from './bench/mocks.ts';
install();
const { Game, effectiveQuality } = await import('../src/game/game.ts');
const { Hud } = await import('../src/ui/hud.ts');
const { audio } = await import('../src/audio/audio.ts');
const { loadChart } = await import('../src/chart/load.ts');
const { makeSongEntry } = await import('../src/library/song.ts');
const { updateSettings } = await import('../src/settings.ts');
const { initTheme } = await import('../src/ui/theme.ts');
initTheme();

test('sustained slow rendering lowers quality from startup and reports uncapped intervals', () => {
  const chart = loadChart('notes.chart', new TextEncoder().encode(FRAME_CHART));
  const song = makeSongEntry({ path: 'bench', files: ['notes.chart', 'guitar.ogg'], ini: null, chartHead: null })!;
  for (const fps of [30, 10]) {
    // Changing the chosen quality resets the previous session's cap.
    updateSettings({ autoQuality: true, quality: fps === 30 ? 'high' : 'medium', rockMeter: 'off' });
    const game = new Game({ song, chart, track: chart.tracks.get('guitar:expert')!, instrument: 'guitar', duration: 500, bot: true }, mockCanvas(mockGL()) as unknown as HTMLCanvasElement, new Hud());
    const a = audio();
    const buf = a.ctx.createBuffer(2, 100, 48000);
    a.setBuffers({ player: buf, backing: buf, origin: 0 });
    game.start();
    const timing = game as unknown as { frame: (now: number) => void; lastFrame: number; fps: number; worstFrame: number };
    timing.lastFrame = 0;
    for (let i = 1; i <= fps * 10; i++) { clock.now = i * 1000 / fps; timing.frame(clock.now); }
    assert.ok(Math.abs(timing.fps - fps) < 0.01);
    assert.ok(Math.abs(timing.worstFrame - 1 / fps) < 0.001);
    assert.ok(effectiveQuality() !== (fps === 30 ? 'high' : 'medium'));
    game.stop();
    rafQueue.length = 0;
  }
});
