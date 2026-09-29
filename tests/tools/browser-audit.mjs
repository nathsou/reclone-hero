// Optional real-browser regression checks. Run a Vite server first, then:
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROME_PATH=/path/to/chrome node tests/tools/browser-audit.mjs
// Uses an isolated profile and a built-in-only fixture; never reads the user's browser data.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const output = process.env.AUDIT_OUTPUT ?? '/tmp/reclone-audit';
await mkdir(output, { recursive: true });
const origin = process.env.AUDIT_URL ?? 'http://127.0.0.1:5230';
const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', e => failures.push(e.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { value: () => [] }));
  await page.route('**/__ui-audit', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
    ${['fonts','tokens','base','select','game','settings','results'].map(s => `import '/src/styles/${s}.css';`).join('\n')}
    import { App } from '/src/ui/app.ts'; import { SongSelect } from '/src/ui/screens/songselect.ts'; import { initTheme } from '/src/ui/theme.ts';
    initTheme(); const app = window.auditApp = new App(document.querySelector('#app')); await app.library.open(null); app.show(new SongSelect(app));
  </script>` }));
  await page.goto(`${origin}/__ui-audit`);
  await page.locator('.select-screen').waitFor();
  assert.equal(await page.evaluate(async () => (await import('/src/settings.ts')).settings.quality), 'medium');
  await page.evaluate(async () => (await import('/src/settings.ts')).updateSettings({quality: 'high'}));
  await page.reload();
  await page.locator('.select-screen').waitFor();
  assert.equal(await page.evaluate(async () => (await import('/src/settings.ts')).settings.quality), 'high');
  await page.evaluate(async () => (await import('/src/settings.ts')).updateSettings({quality: 'medium', volPreview: 0}));

  await page.getByRole('button', { name: 'Covers', exact: true }).click();
  const checkCovers = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('.cover')].every(el => el.style.backgroundImage));
    const covers = await page.evaluate(async () => {
      const screen = auditApp.current;
      return await Promise.all([...screen.coverEls].map(async ([i, el]) => ({ index: i, id: el.dataset.songId, expected: screen.filtered[i].id, art: el.style.backgroundImage, expectedArt: `url("${await screen.art(screen.filtered[i])}")` })));
    });
    for (const c of covers) { assert.equal(c.id, c.expected); assert.equal(c.art, c.expectedArt); }
  };
  await checkCovers();
  const swipe = async () => page.evaluate(() => {
    const stage=document.querySelector('.cover-stage'), r=stage.getBoundingClientRect();
    const dispatch=(type,x,t)=>{const e=new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:101,pointerType:'touch',clientX:r.x+x,clientY:r.y+100});Object.defineProperty(e,'timeStamp',{value:t});stage.dispatchEvent(e);};
    dispatch('pointerdown',300,1000);dispatch('pointermove',250,1040);dispatch('pointermove',180,1080);dispatch('pointerup',180,1090);
  });
  await swipe();
  const released=await page.evaluate(()=>auditApp.current.coverGesture.position);
  assert.ok(released>0);
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(p=>auditApp.current.coverGesture.position>p,released),'coasts after lifting finger');
  await page.waitForFunction(()=>auditApp.current.coverGesture.position===undefined);
  assert.equal(await page.locator('.game-screen').count(),0,'swipe never launches a song');
  await checkCovers();
  await swipe();await page.locator('.search').fill('Holst');
  assert.equal(await page.evaluate(()=>auditApp.current.coverGesture.position),undefined,'filter stops fling');
  await checkCovers();await page.locator('.search').fill('');
  await page.emulateMedia({reducedMotion:'reduce'});await swipe();
  assert.equal(await page.evaluate(()=>auditApp.current.coverGesture.position),undefined,'reduced motion snaps without coasting');
  await page.emulateMedia({reducedMotion:'no-preference'});
  console.log('PASS: touch cover drag, momentum, snapping, no accidental play, interruption, reduced motion');
  for (const query of ['Holst', 'Paper Hearts', 'Circuit Atlas', 'no matching song']) {
    await page.locator('.search').fill(query);
    if (query === 'no matching song') assert.equal(await page.locator('.cover').count(), 0);
    else await checkCovers();
  }
  await page.locator('.search').fill('');
  await page.getByLabel('Sort by').selectOption('name'); await checkCovers();
  await page.evaluate(() => auditApp.current.sortDir.click()); await checkCovers();
  await page.evaluate(async () => {
    const { updateSettings } = await import('/src/settings.ts');
    updateSettings({genreFilter:{mode:'hide',items:['f:Metal']}}); auditApp.current.refilter();
  });
  await checkCovers();
  await page.evaluate(async () => { const { toggleFavourite } = await import('/src/game/favourites.ts'); toggleFavourite(auditApp.current.filtered[0].id); auditApp.current.toggleFavouritesOnly(); });
  await checkCovers();
  await page.evaluate(() => auditApp.current.toggleFavouritesOnly());
  console.log('PASS: medium default, explicit high preserved, covers after search/sort/genre/favourites/empty results');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-page').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  for (const width of [1280, 1024, 390]) {
    await page.setViewportSize({width, height:800});
    let navBox;
    for (const name of ['Gameplay','Audio','Display','Controls','Data']) {
      await page.getByRole('tab', {name, exact:true}).click();
      const box = await page.locator('.settings-nav').boundingBox();
      if(navBox) {assert.equal(box.y, navBox.y); assert.equal(box.height, navBox.height); assert.equal(box.width, navBox.width);}
      navBox=box;
      assert.equal(await page.evaluate(() => document.querySelector('.settings-page').scrollWidth > innerWidth), false);
    }
  }
  await page.keyboard.press('Escape');
  console.log('PASS: settings sidebar stays fixed across every tab at desktop/tablet/phone widths');

  await page.getByRole('button', {name:'List',exact:true}).click();
  for (const [width,height] of [[390,844],[320,568],[600,900],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.locator('.search').fill('Paper Hearts');
    await page.locator('.song-detail .diff').first().waitFor();
    await page.waitForTimeout(250);
    const bounds = await page.evaluate(() => {
      const detail = document.querySelector('.song-detail'), list = document.querySelector('.song-list'), play = detail.querySelector('.primary');
      const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      return { list:rect(list),detail:rect(detail),play:rect(play),overflow:document.querySelector('.select-screen').scrollWidth>innerWidth, toolbar:rect(document.querySelector('.topbar')) };
    });
    assert.equal(bounds.overflow,false);
    assert.ok(bounds.list.height>=120,`${width}x${height} leaves room to browse: ${JSON.stringify(bounds)}`);
    if(width<=600 && height>=700) assert.ok(bounds.play.bottom <= bounds.detail.bottom,`Play visible: ${JSON.stringify(bounds)}`);
    await page.screenshot({path:`${output}/library-${width}x${height}.png`});
    await page.getByRole('button',{name:'Browse',exact:true}).click();
    assert.equal(await page.locator('.library-options').isVisible(),true);
    assert.equal(await page.evaluate(() => document.querySelector('.select-screen').scrollWidth > innerWidth),false,'expanded tools fit');
    await page.getByRole('button',{name:'Browse',exact:true}).click();
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Browse',exact:true}).click();
  assert.equal(await page.locator('.library-options').isVisible(),true);
  await page.getByRole('button',{name:'Browse',exact:true}).click();
  assert.equal(await page.locator('.library-options').isVisible(),false);
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.locator('.song-options').waitFor();
  await page.screenshot({path:`${output}/options-phone.png`});
  assert.ok(await page.getByText('Watch the bot',{exact:true}).isVisible());
  await page.keyboard.press('Escape');
  console.log('PASS: mobile browsing, expanded tools, accessible secondary song actions, no horizontal overflow');

  // Construct results from a real chart. Check record/compare semantics separately from playing a whole song.
  await page.evaluate(async () => {
    const { chartFor } = await import('/src/game/charts.ts'); const { ResultsScreen } = await import('/src/ui/screens/results.ts');
    const song = auditApp.library.songs.find(s=>s.name==='Paper Hearts');const chart = await chartFor(auditApp.library,song);const track=chart.tracks.get('guitar:expert');
    const setup = {song,chart,track,instrument:'guitar',duration:100,bot:false};
    const r = {setup,score:12345,maxStreak:87,hits:50,total:100,misses:50,overstrums:0,stars:3,spPhrases:1,spPhrasesTotal:2,sustainDrops:0,solos:[],sections:[],deltas:[],start:0,end:100,noteState:new Uint8Array(track.notes.length),hitDelta:new Float32Array(track.notes.length),missByLane:[1,2,3,4,5],missByType:{strum:50,hopo:0,tap:0},missChords:0,missOpen:0,wrongFret:0,lateMiss:50,input:'keyboard'};
    window.auditResult={r,req:{song,chart,instrument:'guitar',difficulty:'expert',bot:false},ResultsScreen};
    auditApp.show(new ResultsScreen(auditApp,r,auditResult.req));
  });
  assert.equal(await page.getByText('Max streak',{exact:true}).locator('..').locator('.v').innerText(),'87');
  assert.ok((await page.locator('.res-best').innerText()).includes('12,345'));
  assert.equal(await page.locator('.tag.best').count(),1);
  await page.evaluate(() => {const {r,req,ResultsScreen}=auditResult;auditApp.show(new ResultsScreen(auditApp,{...r,score:9000},{...req}));});
  assert.ok((await page.locator('.res-best').innerText()).includes('12,345'));
  assert.equal(await page.locator('.tag.best').count(),0);
  for(const patch of [{bot:true},{practice:{}}]) {
    await page.evaluate(patch => {const {r,req,ResultsScreen}=auditResult;auditApp.show(new ResultsScreen(auditApp,{...r,score:999999},{...req,...patch}));},patch);
    assert.ok((await page.locator('.res-best').innerText()).includes('12,345'));
  }
  await page.waitForTimeout(250);
  await page.screenshot({path:`${output}/results-phone.png`});
  console.log('PASS: max streak, first/new/lower best scores, bot/practice do not replace records');

  // Use real touch controls and shaders; silent short buffers avoid slow synthesis during this layout test.
  const startTouchGame = async (legacy = false) => page.evaluate(async legacy => {
    const { Game } = await import('/src/game/game.ts'); const { Hud } = await import('/src/ui/hud.ts'); const { audio } = await import('/src/audio/audio.ts'); const { updateSettings } = await import('/src/settings.ts');const { noteSkin,renderTheme }=await import('/src/ui/theme.ts');
    updateSettings({touchControls:'on',noteStyle:'dome'});
    const {r}=auditResult;const canvas=document.createElement('canvas');canvas.className='game-canvas';const hud=new Hud();const el=document.createElement('div');el.className='screen game-screen';el.append(canvas,hud.root);auditApp.show({el});
    await audio().resume();const b=audio().ctx.createBuffer(2,44100*10,44100);audio().setBuffers({player:b,backing:b,origin:0});
    const game = window.auditGame = new Game({...r.setup,bot:false},canvas,hud);
    if (!legacy) { game.prepareStart(); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); }
    game.renderer.warmUp(r.setup.chart.beats,noteSkin(),renderTheme());
    const gl=game.renderer.gl;window.auditTargetBuilds=0;const orig=gl.renderbufferStorageMultisample.bind(gl);gl.renderbufferStorageMultisample=(...args)=>{auditTargetBuilds++;return orig(...args);};
    game.start();
  }, legacy);
  await startTouchGame(true);
  await page.waitForTimeout(300);
  const legacyBuilds = await page.evaluate(()=>auditTargetBuilds);
  assert.ok(legacyBuilds > 0, 'reproduces pre-fix target rebuild at touch startup');
  await page.evaluate(()=>auditGame.stop());
  await startTouchGame();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>auditTargetBuilds),0,'first frames keep warmed GPU targets');
  await page.evaluate(() => {
    const pad=document.querySelector('.tf-pad'),zone=document.querySelector('.tf-zone'),r=pad.getBoundingClientRect();
    window.auditTouches=[];
    for(let i=0;i<2;i++) {
      zone.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:i+1,pointerType:'touch',clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
      zone.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:i+1,pointerType:'touch',clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
      const event=new Event('touchend',{bubbles:true,cancelable:true});pad.dispatchEvent(event);auditTouches.push(event.defaultPrevented);
    }
  });
  assert.deepEqual(await page.evaluate(()=>auditTouches),[true,true]);
  assert.equal(await page.locator('.tf-pad').first().evaluate(el=>getComputedStyle(el).touchAction),'none');
  const padBox=await page.locator('.tf-pad').first().boundingBox();
  await page.touchscreen.tap(padBox.x+padBox.width/2,padBox.y+padBox.height/2);
  await page.touchscreen.tap(padBox.x+padBox.width/2,padBox.y+padBox.height/2);
  assert.equal(await page.evaluate(()=>visualViewport.scale),1);
  await page.screenshot({path:`${output}/game-phone.png`});
  await page.evaluate(()=>auditGame.stop());
  console.log(`PASS: touch gestures canceled, scale stable, GPU allocation calls after warm-up ${legacyBuilds} before / 0 after`);
  assert.deepEqual(failures,[]);
} finally { await browser.close(); }
