// Browser integration with deterministic audio fixtures (not a model-quality test).
// Set STEM_HELPER_CODE to exercise a running real helper instead. Use AUDIT_URL as its allowed origin.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
if(!process.env.MUSIC_DIR) throw new Error('Set MUSIC_DIR to external librosa/data audio.');
const temp=await mkdtemp('/tmp/studio-stems-');
const origin=process.env.AUDIT_URL ?? 'http://127.0.0.1:5230';
execFileSync('ffmpeg',['-v','error','-y','-i',`${process.env.MUSIC_DIR}/Karissa_Hobbs_-_Lets_Go_Fishin.ogg`,'-ss','30','-t','16',`${temp}/song.ogg`]);
for(const [name,volume] of [['guitar',0.35],['backing',0.65]]) execFileSync('ffmpeg',['-v','error','-y','-i',`${temp}/song.ogg`,'-af',`volume=${volume}`,'-c:a','libvorbis','-q:a','7',`${temp}/${name}.ogg`]);
const guitar=await readFile(`${temp}/guitar.ogg`),backing=await readFile(`${temp}/backing.ogg`);
const real=!!process.env.STEM_HELPER_CODE;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__stems-audit',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
 ${['fonts','tokens','base','select','game','settings','results','studio'].map(s=>`import '/src/styles/${s}.css';`).join('\n')}
 import {App} from '/src/ui/app.ts'; window.auditApp=new App(document.querySelector('#app'));await auditApp.boot();</script>`}));
 let mode='ready',deletes=0,posts=0;
 if(!real) await page.route('http://127.0.0.1:8765/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const json=value=>route.fulfill({json:value});
  if(req.headers()['authorization']!=='Bearer fixture-code')return route.fulfill({status:401,json:{error:'Pairing code incorrect'}});
  if(path==='/health')return json({service:'reclone-stems',version:1,model:'htdemucs_6s'});
  if(req.method()==='POST'){posts++;return json({id:'a'.repeat(32)})}
  if(req.method()==='DELETE'){deletes++;return json({deleted:true})}
  if(path.endsWith('.ogg'))return route.fulfill({contentType:'audio/ogg',body:path.endsWith('guitar.ogg')?guitar:backing});
  return json({state:mode,phase:mode==='error'?'Separation failed: fixture error':'Separating guitar',progress:0.5,model:'htdemucs_6s',duration:16,gain:1});
 });
 await page.goto(origin+'/__stems-audit');
 await page.getByRole('button',{name:'Chart Studio',exact:true}).click();
 await page.getByLabel('Import song file').setInputFiles(`${temp}/song.ogg`);
 await page.getByRole('button',{name:'Playtest',exact:true}).waitFor({timeout:60000});
 const notes=await page.evaluate(()=>structuredClone(auditApp.current.project.notes));
 await page.getByRole('tab',{name:'Audio',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Separate guitar',exact:true}).isDisabled(),true);
 if(!real){
  await page.getByLabel('Helper pairing code').fill('wrong-code');await page.getByRole('button',{name:'Separate guitar',exact:true}).click();
  await page.getByText('Pairing code incorrect',{exact:true}).waitFor();
 }
 await page.getByLabel('Helper pairing code').fill(process.env.STEM_HELPER_CODE ?? 'fixture-code');
 await page.getByRole('button',{name:'Separate guitar',exact:true}).click();
 await page.getByText('Guitar and backing ready. Audition the result, then watch the bot or playtest.',{exact:true}).waitFor({timeout:1200000});
 assert.deepEqual(await page.evaluate(()=>auditApp.current.project.notes),notes,'separation never changes notes');
 assert.equal(await page.evaluate(()=>!!auditApp.current.stems),true);
 for(const track of ['guitar','backing','original']){
  await page.getByLabel('Preview audio',{exact:true}).selectOption(track);
  await page.waitForFunction(()=>document.querySelector('audio').readyState>=1);
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('audio').paused);
  await page.getByRole('button',{name:'Pause preview',exact:true}).click();
 }
 const saved=await page.evaluate(async()=>{
  await auditApp.current.save();
  const {readProject}=await import('/src/studio/storage.ts');const saved=await readProject(auditApp.current.project.id);
  const {StudioSource,studioFolder}=await import('/src/studio/source.ts');const source=new StudioSource();
  const folder=studioFolder(saved.project,saved.stems);
  const {makeSongEntry}=await import('/src/library/song.ts');const song=makeSongEntry(folder);
  const {audio}=await import('/src/audio/audio.ts');const engine=audio();
  const files=[];for(const [stem,name]of Object.entries(song.stems))files.push({stem,bytes:await source.readFile(folder.path+'/'+name)});
  const loaded=await engine.loadSong(files,'guitar');
  const backing=engine.backing.getChannelData(0).slice(),gain=engine.backingVol.gain.value;
  await engine.ctx.resume();
  engine.setPlayerAudible(false,true);
  await new Promise(resolve=>setTimeout(resolve,30));
  const muted=engine.missGain.gain.value===0 && engine.backingVol.gain.value===gain && backing.every((v,i)=>v===engine.backing.getChannelData(0)[i]);
  engine.setPlayerAudible(true,true);
  const {exportProject,importProjectZip}=await import('/src/studio/export.ts');
  const restored=await importProjectZip(await exportProject(saved.project,saved.audio,saved.stems),crypto.randomUUID());
  return {loaded,files:folder.files,muted,sizes:[saved.audio.size,saved.stems.guitar.size,saved.stems.backing.size],restored:[restored.audio.size,restored.stems.guitar.size,restored.stems.backing.size]};
 });
 assert.equal(saved.loaded.hasPlayerStem,true);assert.ok(Math.abs(saved.loaded.duration-16)<0.15);assert.equal(saved.muted,true);
 assert.deepEqual(saved.files,['notes.chart','song.ini','guitar.ogg','song.ogg']);assert.deepEqual(saved.sizes,saved.restored);
 await page.getByRole('button',{name:'Watch bot',exact:true}).click();
 await page.waitForFunction(()=>globalThis.__game?.setup.bot && document.querySelector('.loading')?.classList.contains('gone'),{timeout:60000});
 await page.waitForFunction(()=>__game.engine.hits>0);
 await page.keyboard.press('Escape');await page.getByText('Return to Chart Studio',{exact:true}).click();
 await page.getByRole('tab',{name:'Audio',exact:true}).click();
 assert.equal(await page.getByLabel('Preview audio',{exact:true}).isDisabled(),false,'stems survive returning from bot');
 if(!real){
  await page.getByLabel('Helper pairing code').fill('fixture-code');
  mode='running';await page.getByRole('button',{name:'Separate guitar again',exact:true}).click();
  await page.getByText(/Separating guitar · 50%/).waitFor();
  const deletesBeforeCancel=deletes;
  await page.getByRole('button',{name:'Cancel separation',exact:true}).click();
  await page.getByText('Separation cancelled. Your audio is unchanged.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>!!auditApp.current.stems),true,'cancel retains previous stems');
  assert.equal(deletes,deletesBeforeCancel+1,'cancellation deletes its known job');
  mode='error';await page.getByRole('button',{name:'Separate guitar again',exact:true}).click();
  await page.getByText(/Separation failed: fixture error/).waitFor();assert.equal(await page.evaluate(()=>!!auditApp.current.stems),true);
  assert.ok(deletes>=2);assert.ok(posts>=2);
 }
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.locator('.studio-screen').evaluate(el=>el.scrollWidth>el.clientWidth),false,`fits ${width}`);
 }
 await page.screenshot({path:'/tmp/studio-audio-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/tmp/studio-audio-desktop.png'});
 await page.getByRole('button',{name:'Use original mix',exact:true}).click();
 assert.equal(await page.evaluate(()=>auditApp.current.stems),undefined);
 await page.evaluate(()=>auditApp.current.save());
 assert.deepEqual(errors,[]);
 console.log(`PASS: ${real?'real helper':'deterministic helper fixtures'}; separation UI, audition, unchanged edits, persistence/ZIP, player-only muting, bot preview, cancellation/failure, original restore, responsive layouts`);
}finally{await browser.close();await rm(temp,{recursive:true,force:true})}
