// Real browser integration. Run Vite, then set MUSIC_DIR to a clone of https://github.com/librosa/data.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_PATH=/usr/bin/chromium MUSIC_DIR=/tmp/librosa-data/audio node tests/tools/studio-browser-audit.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const origin = process.env.AUDIT_URL ?? 'http://127.0.0.1:5230';
const music = process.env.MUSIC_DIR;
if (!music) throw new Error('Set MUSIC_DIR to the external librosa/data audio directory. No recordings are bundled with this test.');
const out = process.env.AUDIT_OUTPUT ?? '/tmp/studio-audit';
await mkdir(out, { recursive: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { value: () => [] }));
  await page.route('**/__studio-audit', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
    ${['fonts','tokens','base','select','game','settings','results','studio'].map(s => `import '/src/styles/${s}.css';`).join('\n')}
    import { App } from '/src/ui/app.ts'; import { initTheme } from '/src/ui/theme.ts';
    initTheme(); window.auditApp = new App(document.querySelector('#app')); await auditApp.boot();
  </script>` }));
  const openProject = async () => { if (!await page.locator('.studio-project-menu').evaluate(el => el.open)) await page.locator('.studio-project-menu > summary').click(); };
  await page.goto(`${origin}/__studio-audit`);
  await page.getByRole('button', { name: 'Chart Studio', exact: true }).waitFor();
  for (const width of [1440, 1280, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('.topbar').evaluate(el => el.scrollWidth > el.clientWidth), false, `library toolbar fits ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Chart Studio', exact: true }).click();
  await page.getByLabel('Import song file').setInputFiles({ name: 'broken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not music') });
  await page.waitForFunction(() => document.querySelector('.studio-status').textContent.includes('could not be decoded'));
  await page.getByLabel('Import song file').setInputFiles(`${music}/Kevin_MacLeod_-_Vibe_Ace.ogg`);
  await page.getByRole('button', { name: 'Playtest', exact: true }).waitFor({ timeout: 60000 });
  const original = await page.evaluate(() => structuredClone(auditApp.current.project));
  assert.ok(original.analysis.onsets.length > 100);
  assert.equal(await page.locator('.studio-screen').evaluate(el => el.scrollHeight > el.clientHeight), false, 'desktop editor fits the viewport');
  const inspector = await page.locator('.studio-sidebar').boundingBox();
  assert.ok(inspector.y + inspector.height <= 1000, 'inspector remains beside the timeline');
  assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled(), true);
  for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
    await page.getByLabel('Chart difficulty').selectOption(difficulty);
    assert.ok((await page.locator('.studio-stats').innerText()).startsWith(difficulty[0].toUpperCase() + difficulty.slice(1)));
  }
  await page.getByLabel('Chart difficulty').selectOption('medium');
  const scrub = async time => page.getByLabel('Song position').evaluate((el, t) => { el.value = String(t); el.dispatchEvent(new Event('input', { bubbles: true })); }, time);
  await scrub(20);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  assert.equal(await page.evaluate(() => auditApp.current.cursor), 20, 'zoom keeps the playhead fixed');
  assert.ok(await page.evaluate(() => auditApp.current.start <= 20 && auditApp.current.start + auditApp.current.span >= 20));
  await page.getByRole('button', { name: 'Next view', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Follow playhead', exact: true }).getAttribute('aria-pressed'), 'false');
  await page.getByRole('button', { name: 'Follow playhead', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.notes), original.notes, 'view navigation never edits notes');
  await page.getByLabel('Grid snap').selectOption('0');
  await scrub(0.25);
  await page.locator('.studio-timeline').focus(); await page.keyboard.press('5');
  await page.getByLabel('Sustain length (seconds)').fill('0.12'); await page.getByLabel('Sustain length (seconds)').press('Tab');
  assert.ok(await page.getByLabel('Note lane', { exact: true }).evaluate(el => el === document.activeElement), 'Tab keeps focus in the note inspector');
  await page.getByLabel('Sustain length (seconds)').fill('0.11'); await page.getByLabel('Sustain length (seconds)').press('Tab');
  assert.equal(await page.evaluate(() => auditApp.current.project.notes.medium.find(n => n.time === 0.25 && n.lane === 4).length), 0.11, 'consecutive property edits use current notes');
  await page.locator('.studio-timeline').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
  await page.getByLabel('Note type', { exact: true }).selectOption('tap');
  let manual = await page.evaluate(() => auditApp.current.project.notes.medium.find(n => n.time === 0.25 && n.lane === 4));
  assert.ok(manual); assert.equal(manual.kind, 'tap'); assert.ok(manual.length > 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await page.evaluate(id => auditApp.current.project.notes.medium.find(n => n.id === id).kind, manual.id), 'auto');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal(await page.evaluate(id => auditApp.current.project.notes.medium.find(n => n.id === id).kind, manual.id), 'tap');
  const box = await page.locator('.studio-timeline').boundingBox();
  const row = (box.height - 86 - 20) / 5;
  const x = box.x + 64 + 0.25 / 12 * (box.width - 64), y = box.y + 86 + 4.5 * row;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 0.5 / 12 * (box.width - 64), y - row, { steps: 5 }); await page.mouse.up();
  const dragged = await page.evaluate(id => auditApp.current.project.notes.medium.find(n => n.id === id), manual.id);
  assert.ok(Math.abs(dragged.time - 0.75) < 0.02); assert.equal(dragged.lane, 3);

  await page.getByRole('tab', { name: 'Passage', exact: true }).click();
  await page.getByLabel('Passage end (seconds)').fill('2'); await page.getByLabel('Passage end (seconds)').press('Tab');
  await page.getByRole('button', { name: 'Lock passage', exact: true }).click();
  const locked = await page.evaluate(() => auditApp.current.project.notes.medium.filter(n => n.time < 2));
  await page.getByLabel('Passage end (seconds)').fill('61'); await page.getByLabel('Passage end (seconds)').press('Tab');
  await page.getByRole('button', { name: 'Regenerate passage', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.notes.medium.filter(n => n.time < 2)), locked);
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.notes.expert), original.notes.expert);

  await page.getByRole('tab', { name: 'Grid', exact: true }).click();
  await page.getByRole('tab', { name: 'Grid', exact: true }).press('ArrowLeft');
  assert.equal(await page.getByRole('tab', { name: 'Notes', exact: true }).getAttribute('aria-selected'), 'true', 'inspector tabs support keyboard navigation');
  await page.getByRole('tab', { name: 'Grid', exact: true }).click();
  await page.getByLabel('Initial BPM').fill('130'); await page.getByLabel('Initial BPM').press('Tab');
  await scrub(20); await page.getByRole('button', { name: 'Add tempo at playhead', exact: true }).click();
  await page.getByLabel('BPM at 20.00 seconds').fill('140'); await page.getByLabel('BPM at 20.00 seconds').press('Tab');
  assert.ok(await page.evaluate(() => auditApp.current.project.timing.some(t => t.time === 20 && t.bpm === 140)));
  await page.getByLabel('Preview clicks').selectOption('notes');
  await page.locator('.studio-timeline').focus(); await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('audio').evaluate(el => !el.paused && el.currentTime > 20));
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  assert.ok(await page.locator('audio').evaluate(el => el.paused));
  await openProject();
  await page.getByLabel('Song title').fill('Studio audit song'); await page.getByLabel('Song title').press('Tab');
  await openProject();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.studio-save-status').textContent === 'Saved in this browser');
  const snapshot = await page.evaluate(() => structuredClone(auditApp.current.project));
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export song ZIP', exact: true }).click();
  await (await download).saveAs(`${out}/studio-song.zip`);
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.locator('.studio-screen').evaluate(el => el.scrollWidth > el.clientWidth), false, `no horizontal overflow at ${width}`);
    assert.ok((await page.getByLabel('Preview clicks').boundingBox()).width > 120, 'phone transport selectors remain readable');
    await page.screenshot({ path: `${out}/phone-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const theme of ['ink', 'classic']) {
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.screenshot({ path: `${out}/studio-${theme}.png`, fullPage: true });
  }
  await page.reload();
  await page.getByRole('button', { name: 'Chart Studio', exact: true }).click();
  await openProject();
  await page.getByLabel('Saved projects').selectOption(snapshot.id);
  await page.getByRole('button', { name: 'Playtest', exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.notes), snapshot.notes);
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.timing), snapshot.timing);
  await scrub(22);
  await page.getByRole('tab', { name: 'Grid', exact: true }).click();
  const editorView = await page.evaluate(() => ({ cursor: auditApp.current.cursor, start: auditApp.current.start, span: auditApp.current.span }));
  await page.getByRole('button', { name: 'Playtest', exact: true }).click();
  await page.waitForFunction(() => globalThis.__game && document.querySelector('.loading')?.classList.contains('gone'), { timeout: 60000 });
  await page.waitForTimeout(300); await page.keyboard.press('Escape');
  await page.getByText('Return to Chart Studio', { exact: true }).click();
  await page.locator('.studio-timeline').waitFor();
  await page.waitForFunction(cursor => Math.abs(auditApp.current.cursor - cursor) < 0.01, editorView.cursor);
  assert.equal(await page.getByRole('tab', { name: 'Grid', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => auditApp.current.start), editorView.start, 'preview returns to the editing passage');
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.notes), snapshot.notes);
  const scoringBeforeBot = await page.evaluate(() => ['chsq.plays', 'chsq.history', 'chsq.scores'].map(key => localStorage.getItem(key)));
  await page.getByLabel('Chart difficulty').selectOption('hard');
  await page.getByRole('button', { name: 'Watch bot', exact: true }).click();
  await page.waitForFunction(() => globalThis.__game?.setup.bot && document.querySelector('.loading')?.classList.contains('gone'), { timeout: 60000 });
  assert.equal(await page.evaluate(() => __game.setup.track.difficulty), 'hard');
  await page.waitForFunction(() => __game.engine.hits >= 3);
  assert.equal(await page.evaluate(() => __game.engine.misses), 0, 'bot hits notes without player input');
  await page.keyboard.press('Escape');
  await page.getByText('Return to Chart Studio', { exact: true }).click();
  await page.locator('.studio-timeline').waitFor();
  assert.equal(await page.getByLabel('Chart difficulty').inputValue(), 'hard');
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.notes), snapshot.notes);
  assert.deepEqual(await page.evaluate(() => ['chsq.plays', 'chsq.history', 'chsq.scores'].map(key => localStorage.getItem(key))), scoringBeforeBot);
  await page.getByRole('button', { name: '← Library', exact: true }).click();
  await page.locator('.search').fill('Studio audit song');
  await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
  await page.locator('.studio-timeline').waitFor();
  assert.equal(await page.getByLabel('Song title').inputValue(), 'Studio audit song');
  await page.getByLabel('Import Studio ZIP').setInputFiles(`${out}/studio-song.zip`);
  await page.waitForFunction(id => auditApp.current.project.id !== id, snapshot.id);
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.notes), snapshot.notes);
  assert.deepEqual(await page.evaluate(() => auditApp.current.project.locks), snapshot.locks);
  // Cancel while a longer recording is being decoded/analyzed; the edited project survives.
  const retainedId = await page.evaluate(() => auditApp.current.project.id);
  await openProject();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Import song file').setInputFiles(`${music}/Karissa_Hobbs_-_Lets_Go_Fishin.ogg`);
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => auditApp.current.project.id), retainedId);
  assert.equal(await page.locator('.studio-status').innerText(), 'Analysis cancelled.');
  assert.deepEqual(errors, []);
  console.log('PASS: real OGG import, invalid input, difficulties, note/sustain/tap editing, undo/redo, locks, regeneration, tempo changes, audible preview, ZIP export, mobile layout, persisted reload, playtest and bot preview, unchanged scores, and library round trip');

  // Worker/CSP fallback is a separate isolated browser context, with no saved projects.
  const fallback = await browser.newContext();
  await fallback.addInitScript(() => { globalThis.Worker = class { constructor() { throw new Error('Worker blocked for fallback test'); } }; });
  const fp = await fallback.newPage(); fp.on('pageerror', e => errors.push(e.message));
  await fp.goto(origin); await fp.getByRole('button', { name: 'Chart Studio', exact: true }).click();
  await fp.getByLabel('Import song file').setInputFiles(`${music}/sorohanro_-_solo-trumpet-06.ogg`);
  await fp.getByRole('button', { name: 'Playtest', exact: true }).waitFor({ timeout: 60000 });
  assert.ok((await fp.locator('.studio-status').innerText()).includes('Found'));
  await fp.getByRole('button', { name: 'Watch bot', exact: true }).click();
  await fp.waitForFunction(() => globalThis.__game?.setup.bot && document.querySelector('.loading')?.classList.contains('gone'), { timeout: 60000 });
  await fp.evaluate(() => { globalThis.auditBotGame = __game; });
  await fp.locator('.studio-timeline').waitFor({ timeout: 30000 });
  assert.equal(await fp.evaluate(() => auditBotGame.engine.hits), await fp.evaluate(() => auditBotGame.setup.track.notes.length));
  assert.equal(await fp.evaluate(() => auditBotGame.engine.misses), 0);
  assert.equal(await fp.locator('.results-screen').count(), 0, 'completed bot preview returns directly to the editor');
  assert.equal(await fp.evaluate(() => localStorage.getItem('chsq.history')), null);
  assert.deepEqual(errors, []);
  console.log('PASS: analysis fallback when Web Workers are blocked, bot completion returns to editor without recording a score');
} finally { await browser.close(); }
