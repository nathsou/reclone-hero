// Import actual local recordings through the production browser analyzer, then exercise focus/locks,
// persistence, modern ZIP features and the bot. MUSIC_DIR stays external to this repository.
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
if(!process.env.MUSIC_DIR)throw new Error('Set MUSIC_DIR to the local recordings.');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/__quality-browser',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
 ${['fonts','tokens','base','select','game','settings','results','studio'].map(s=>`import '/src/styles/${s}.css';`).join('\n')}
 import {App} from '/src/ui/app.ts';window.auditApp=new App(document.querySelector('#app'));await auditApp.boot();</script>`}));
 await page.goto((process.env.AUDIT_URL??'http://127.0.0.1:5230')+'/__quality-browser');
 await page.getByRole('button',{name:'Chart Studio',exact:true}).click();
 for(const name of (await readdir(process.env.MUSIC_DIR)).filter(name=>/\.(mp3|wav|ogg|opus|m4a)$/i.test(name)).sort()){
  const old=await page.evaluate(()=>auditApp.current.project?.id);
  await page.getByLabel('Import song file').setInputFiles(join(process.env.MUSIC_DIR,name));
  await page.waitForFunction(old=>auditApp.current.project?.analysis.version===2&&auditApp.current.project.id!==old,old,{timeout:120000});
  await page.getByRole('tab',{name:'Passage',exact:true}).click();
  assert.equal(await page.getByLabel('Generation focus').isDisabled(),false);
  await page.getByLabel('Generation focus').selectOption('melody');
  await page.getByRole('button',{name:'Regenerate passage',exact:true}).click();
  await page.getByLabel('Passage end (seconds)').fill('4');await page.getByLabel('Passage end (seconds)').press('Tab');
  await page.getByRole('button',{name:'Lock passage',exact:true}).click();
  const locked=await page.evaluate(()=>structuredClone(auditApp.current.project.notes.medium.filter(n=>n.time<4)));
  const duration=await page.evaluate(()=>auditApp.current.project.analysis.duration);
  await page.getByLabel('Passage end (seconds)').fill(String(duration));await page.getByLabel('Passage end (seconds)').press('Tab');
  await page.getByLabel('Generation focus').selectOption('rhythm');
  await page.getByRole('button',{name:'Regenerate passage',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>auditApp.current.project.notes.medium.filter(n=>n.time<4)),locked,'focus changes respect authored locks');
  const result=await page.evaluate(async()=>{
   await auditApp.current.save();const {readProject}=await import('/src/studio/storage.ts');const p=auditApp.current.project,s=await readProject(p.id);
   const {exportProject,importProjectZip}=await import('/src/studio/export.ts');const r=await importProjectZip(await exportProject(s.project,s.audio,s.stems,s.cover),'restored');
   return {focus:r.project.focus,version:r.project.analysis.version,features:r.project.analysis.onsets,original:p.analysis.onsets,variable:p.analysis.tempoVariable,bpm:p.analysis.bpm};
  });
  assert.equal(result.focus,'rhythm');assert.equal(result.version,2);assert.deepEqual(result.features,result.original);
  if(result.variable){await page.getByRole('tab',{name:'Grid',exact:true}).click();await page.getByText(/Different passages support different tempos/).waitFor()}
  await page.getByRole('button',{name:'Watch bot',exact:true}).click();
  await page.waitForFunction(()=>globalThis.__game?.setup.bot&&document.querySelector('.loading')?.classList.contains('gone'),{timeout:120000});
  await page.waitForFunction(()=>__game.engine.hits>0,{},{timeout:30000});
  await page.keyboard.press('Escape');await page.getByText('Return to Chart Studio',{exact:true}).click();
  await page.getByRole('tab',{name:'Passage',exact:true}).click();
  assert.equal(await page.getByLabel('Generation focus').inputValue(),'rhythm');
  assert.deepEqual(await page.evaluate(()=>auditApp.current.project.notes.medium.filter(n=>n.time<4)),locked);
  for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.locator('.studio-screen').evaluate(el=>el.scrollWidth>el.clientWidth),false)}
  await page.setViewportSize({width:1440,height:1000});
  console.log(`PASS: ${name}; native import, ${result.bpm} BPM${result.variable?' (variable tempo flagged)':''}, focus/locks, feature persistence/ZIP, bot, return, mobile layout`);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
