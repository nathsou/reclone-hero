// Real Web Audio/worker/startup regressions. Start Vite, then use the same optional Playwright/Chrome
// environment variables as browser-audit.mjs. The fixture only reads built-in songs.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const origin = process.env.AUDIT_URL ?? 'http://127.0.0.1:5230';
const failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', e => failures.push(e.message));
  await page.route('**/__startup-audit', route => route.fulfill({ contentType: 'text/html', body: `<div id="app"></div><script type="module">
    ${['fonts','tokens','base','select','game','settings','results'].map(s => `import '/src/styles/${s}.css';`).join('\n')}
    import {App} from '/src/ui/app.ts'; import {initTheme} from '/src/ui/theme.ts';
    import {GameScreen} from '/src/ui/screens/gamescreen.ts'; import {chartFor} from '/src/game/charts.ts';
    import {audio} from '/src/audio/audio.ts'; import {stretchAsync} from '/src/audio/stretch.ts';
    import {renderStems} from '/src/starter/client.ts'; import {updateSettings} from '/src/settings.ts';
    initTheme(); updateSettings({quality:'low', autoQuality:false, volPreview:0});
    const app=new App(document.querySelector('#app')); await app.library.open(null);
    window.audit={app,GameScreen,chartFor,audio,stretchAsync,renderStems};
  </script>` }));
  await page.goto(`${origin}/__startup-audit`);
  await page.waitForFunction(() => window.audit);

  // Real transferable buffers, worker bootstrap failure, cancellation, and worker-disabled fallback.
  const workerResult = await page.evaluate(async () => {
    const { audio, stretchAsync, renderStems } = audit;
    const a = audio(); await a.resume();
    const b = a.ctx.createBuffer(2, 8000, 8000);
    b.getChannelData(0).set(Float32Array.from({length:8000}, (_, i) => Math.sin(i / 10) * 0.1));
    const out = await stretchAsync(a.ctx, b, 0, 1, 0.5);
    const controller = new AbortController();
    const canceled = stretchAsync(a.ctx, b, 0, 1, 0.5, undefined, controller.signal).then(() => 'resolved', e => e.name);
    controller.abort();
    const NativeWorker = window.Worker;
    let terminated = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); queueMicrotask(() => this.dispatchEvent(new ErrorEvent('error', {message:'simulated startup failure', cancelable:true}))); }
      terminate() { terminated++; return super.terminate(); }
    };
    let failed;
    try { failed = await stretchAsync(a.ctx, b, 0, 1, 0.5).then(() => 'resolved', e => e.message); }
    finally { window.Worker = NativeWorker; }
    window.Worker = class { constructor() { throw new Error('workers disabled'); } };
    let fallback;
    try { fallback = await stretchAsync(a.ctx, b, 0, 1, 0.5); }
    finally { window.Worker = NativeWorker; }
    const one = new AbortController();
    const first = renderStems('midnight-drive', undefined, one.signal, 8000).then(() => 'resolved', e => e.name);
    const second = renderStems('midnight-drive', undefined, undefined, 8000);
    one.abort();
    const pcm = await second;
    const all = new AbortController();
    const abandoned = renderStems('seventh-gear', undefined, all.signal, 8000).then(() => 'resolved', e => e.name);
    all.abort();
    return { duration:out.duration, canceled:await canceled, failed, terminated, fallback:fallback.duration,
      sharedCanceled:await first, remainingSamples:pcm.guitar[0].length, abandoned:await abandoned };
  });
  assert.equal(workerResult.duration, 2);
  assert.equal(workerResult.fallback, 2);
  assert.equal(workerResult.canceled, 'AbortError');
  assert.equal(workerResult.failed, 'simulated startup failure');
  assert.equal(workerResult.terminated, 1);
  assert.equal(workerResult.sharedCanceled, 'AbortError');
  assert.ok(workerResult.remainingSamples > 0);
  assert.equal(workerResult.abandoned, 'AbortError');
  console.log('PASS: real stretching, worker failure/termination, cancellation, fallback and shared synthesis ownership');

  await page.evaluate(async () => {
    const { app, GameScreen, chartFor, audio } = audit;
    const song=app.library.songs.find(s=>s.name==='Midnight Drive');
    const chart=await chartFor(app.library,song);
    const a=audio();
    audit.urls=[];audit.released=[];
    const fileUrl=app.library.fileUrl.bind(app.library), release=app.library.release.bind(app.library);
    app.library.fileUrl=async (...args)=>{const u=await fileUrl(...args);audit.urls.push(u);return u;};
    app.library.release=u=>{audit.released.push(u);release(u);};
    const raw=a.rawSongTime.bind(a), sync=a.sync.bind(a);
    let first;
    audit.samples=[];
    a.rawSongTime=p=>raw(p)-(first!==undefined && p-first>500 ? 0.15 : 0);
    a.sync=p=>{
      if(a.isPlaying && first===undefined)first=p;
      sync(p);
      if(a.isPlaying)audit.samples.push({perf:p,song:a.songTime(p)});
    };
    audit.request={song,chart,instrument:'guitar',difficulty:'expert',bot:true};
    app.show(new GameScreen(app,audit.request));
    audit.restoreClock=()=>{a.rawSongTime=raw;a.sync=sync;};
  });
  await page.waitForFunction(() => audit.samples.length >= 15 && audit.samples.at(-1).song > 1, null, {timeout:90000});
  const speeds = await page.evaluate(() => audit.samples.slice(1).map((v,i)=>(v.song-audit.samples[i].song)/((v.perf-audit.samples[i].perf)/1000)).filter(Number.isFinite));
  assert.ok(Math.min(...speeds) >= 0.975, `opening-note speeds: ${speeds}`);
  console.log(`PASS: late Chrome output timestamp; minimum observed clock speed ${Math.min(...speeds).toFixed(3)}x`);

  const resources = await page.evaluate(async () => {
    const {app,audio}=audit;
    const screen=app.current;
    for(let i=0;i<3;i++){screen.game.pause();screen.resume();}
    await screen.artwork;
    const requests=audit.urls.length;
    audit.restoreClock();
    app.show({el:document.createElement('div')});
    await Promise.resolve();
    return {requests,released:audit.released.length,playing:audio().isPlaying,player:audio().buffers.player};
  });
  assert.equal(resources.requests,1,'loading and repeated pauses share one artwork URL');
  assert.equal(resources.released,1);
  assert.equal(resources.playing,false);
  assert.equal(resources.player,null);
  console.log('PASS: artwork reuse/release and audio unload on screen destruction');

  // Exercise the full loader's practice excerpt, not only the low-level stretch worker.
  await page.evaluate(() => {
    const {app,GameScreen}=audit;
    const notes=audit.request.chart.tracks.get('guitar:expert').notes;
    let last=0; while(last+1<notes.length && notes.time[last+1]<=5)last++;
    app.show(new GameScreen(app,{...audit.request,practice:{start:0,end:5,speed:0.75,first:0,last,label:'Audit'}}));
  });
  await page.waitForFunction(()=>window.__game && audit.audio().isPlaying,null,{timeout:90000});
  const practice=await page.evaluate(()=>{
    const {app,audio}=audit, a=audio();
    const duration=a.buffers.player.duration;
    app.current.game.restart();
    app.current.game.pause();app.current.resume();
    const result={duration,rate:a.playbackRate,origin:a.buffers.origin};
    app.show({el:document.createElement('div')});
    return result;
  });
  assert.ok(Math.abs(practice.duration-8/0.75)<0.001);
  assert.equal(practice.rate,0.75);
  assert.equal(practice.origin,0);
  console.log('PASS: practice excerpt duration, restart and pause/resume at the chosen rate');

  // Destroy while a real synthesis is pending; no late load may recreate playback buffers.
  await page.evaluate(async () => {
    const {app,GameScreen,chartFor}=audit;
    const song=app.library.songs.find(s=>s.name==='Seventh Gear');
    const chart=await chartFor(app.library,song);
    app.show(new GameScreen(app,{song,chart,instrument:'guitar',difficulty:'expert',bot:true}));
    await new Promise(r=>setTimeout(r,50));
    app.show({el:document.createElement('div')});
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>audit.audio().buffers.player),null);
  assert.deepEqual(failures,[]);
  console.log('PASS: abandoning a song load leaves no stale audio or unhandled errors');
} finally { await browser.close(); }
