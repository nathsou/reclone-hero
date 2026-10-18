// Build and run `npm run preview -- --port 5231` first. Same external tools/data as the browser audit.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
if(!process.env.MUSIC_DIR) throw new Error('Set MUSIC_DIR to the external librosa/data audio directory.');
const temp=await mkdtemp('/tmp/studio-formats-');
for(const ext of ['mp3','wav','opus']) execFileSync('ffmpeg',['-v','error','-y','-i',`${process.env.MUSIC_DIR}/Kevin_MacLeod_-_Vibe_Ace.ogg`,'-t','12',`${temp}/song.${ext}`]);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage();
 const openProject=async()=>{if(!await page.locator('.studio-project-menu').evaluate(el=>el.open))await page.locator('.studio-project-menu > summary').click();};const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.AUDIT_URL ?? 'http://127.0.0.1:5231');
 await page.getByRole('button',{name:'Chart Studio',exact:true}).click();
 for(const ext of ['mp3','wav','opus']){
  await page.getByLabel('Import song file').setInputFiles(`${temp}/song.${ext}`);
  await page.waitForFunction(()=>document.querySelector('.studio-status').textContent.startsWith('Found'));
  await openProject();await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.studio-save-status').textContent==='Saved in this browser');
  console.log('PASS: single-file production build imports, analyzes, edits and saves actual music as '+ext);
 }
 await page.locator('.studio-project-menu > summary').click();await page.getByLabel('Preview clicks').selectOption('beats');await page.locator('.studio-timeline').focus();await page.keyboard.press('Space');await page.waitForTimeout(250);assert.ok(await page.locator('audio').evaluate(a=>!a.paused));await page.keyboard.press('Space');
 await page.evaluate(()=>{window.restorePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}});
 await openProject();await page.getByLabel('Song title').fill('Storage failure check');await page.getByLabel('Song title').press('Tab');await openProject();await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.studio-save-status').textContent.startsWith('Not saved'));
 await page.evaluate(()=>IDBObjectStore.prototype.put=window.restorePut);
 await openProject();await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.studio-save-status').textContent==='Saved in this browser');
 console.log('PASS: storage failure is visible; retry succeeds without losing edits');
 assert.deepEqual(errors,[]);
} finally {await browser.close();await rm(temp,{recursive:true,force:true});}
