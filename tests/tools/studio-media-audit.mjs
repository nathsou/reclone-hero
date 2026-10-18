// Recorded music with real MP4/ID3/Vorbis metadata. No songs or artwork are downloaded by the app.
// Requires FFmpeg, MUSIC_DIR (external librosa/data audio), Vite, and Playwright/Chromium.
// PRODUCTION_URL optionally verifies the same metadata and HUD in the single-file build.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
if(!process.env.MUSIC_DIR)throw new Error('Set MUSIC_DIR to the external librosa/data audio directory.');
const temp=await mkdtemp('/tmp/studio-media-');
const origin=process.env.AUDIT_URL ?? 'http://127.0.0.1:5230';
const lrc='[00:01.000]First fixture line\n[00:04.000]Second fixture line\n[00:08.000]Last fixture line';
const be=value=>{const b=Buffer.alloc(4);b.writeUInt32BE(value);return b};
const chunk=(name,data)=>{
 const body=Buffer.concat([Buffer.from(name),data]);let crc=-1;
 for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0)}
 return Buffer.concat([be(data.length),body,be((crc^-1)>>>0)]);
};
const header=Buffer.concat([be(64),be(64),Buffer.from([8,2,0,0,0])]);
const pixels=Buffer.concat(Array.from({length:64},()=>Buffer.concat([Buffer.from([0]),Buffer.from(Array.from({length:192},(_,i)=>[28,160,210][i%3]))])));
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
await writeFile(`${temp}/cover.png`,png);
await writeFile(`${temp}/plain.txt`,'Plain fixture lyrics\nKeep this line');
await writeFile(`${temp}/timed.lrc`,lrc);
const picture=Buffer.concat([be(3),be(9),Buffer.from('image/png'),be(0),be(64),be(64),be(24),be(0),be(png.length),png]).toString('base64');
const frame=(id,data)=>Buffer.concat([Buffer.from(id),be(data.length),Buffer.alloc(2),data]);
const formats=['m4a','mp3','ogg','opus','wav'];
for(const ext of formats){
 const args=['-v','error','-y','-ss','30','-t','16','-i',`${process.env.MUSIC_DIR}/Karissa_Hobbs_-_Lets_Go_Fishin.ogg`];
 if(ext==='m4a'||ext==='mp3')args.push('-i',`${temp}/cover.png`,'-map','0:a:0','-map','1:v:0','-c:v','copy','-disposition:v:0','attached_pic');
 else args.push('-vn');
 args.push('-map_metadata','-1','-map_metadata:s','-1','-metadata',`title=Tagged ${ext}`,'-metadata','artist=Fixture Artist','-metadata','album=Fixture Album','-metadata',`lyrics=${lrc}`);
 if(ext==='m4a')args.push('-c:a','aac','-b:a','192k');
 if(ext==='mp3')args.push('-id3v2_version','3');
 if(ext==='ogg'||ext==='opus')args.push('-metadata',`METADATA_BLOCK_PICTURE=${picture}`);
 args.push(`${temp}/song.${ext}`);execFileSync('ffmpeg',args);
 if(ext==='wav'||ext==='mp3'){
  // RIFF permits ID3 tags; FFmpeg's INFO writer has no embedded cover/lyrics fields.
  const frames=Buffer.concat([frame('TIT2',Buffer.from(`\0Tagged ${ext}`)),frame('TPE1',Buffer.from('\0Fixture Artist')),frame('TALB',Buffer.from('\0Fixture Album')),
   frame('USLT',Buffer.from(`\0eng\0${lrc}`)),frame('APIC',Buffer.concat([Buffer.from('\0image/png\0\x03\0'),png]))]);
  const size=frames.length;const id3=Buffer.concat([Buffer.from([73,68,51,3,0,0,size>>>21&127,size>>>14&127,size>>>7&127,size&127]),frames]);
  if(ext==='wav'){
   const sizeBytes=Buffer.alloc(4);sizeBytes.writeUInt32LE(id3.length);
   const wav=Buffer.concat([await readFile(`${temp}/song.wav`),Buffer.from('id3 '),sizeBytes,id3,...(id3.length%2?[Buffer.from([0])]:[])]);
   wav.writeUInt32LE(wav.length-8,4);await writeFile(`${temp}/song.wav`,wav);
  }else{
   const mp3=await readFile(`${temp}/song.mp3`),oldSize=10+(mp3[6]<<21|mp3[7]<<14|mp3[8]<<7|mp3[9]);
   await writeFile(`${temp}/song.mp3`,Buffer.concat([id3,mp3.subarray(oldSize)]));
  }
 }
}
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/__media-audit',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module">
 ${['fonts','tokens','base','select','game','settings','results','studio'].map(s=>`import '/src/styles/${s}.css';`).join('\n')}
 import {App} from '/src/ui/app.ts';window.auditApp=new App(document.querySelector('#app'));await auditApp.boot();</script>`}));
 await page.goto(origin+'/__media-audit');await page.getByRole('button',{name:'Chart Studio',exact:true}).click();
 for(const ext of formats){
  await page.getByLabel('Import song file').setInputFiles(`${temp}/song.${ext}`);
  await page.waitForFunction(name=>auditApp.current.project?.name===name,`Tagged ${ext}`,{timeout:60000});
  await page.getByRole('tab',{name:'Song',exact:true}).click();
  assert.equal(await page.getByLabel('Album',{exact:true}).inputValue(),'Fixture Album');
  assert.equal(await page.getByLabel('Lyrics',{exact:true}).inputValue(),lrc);
  await page.waitForFunction(()=>document.querySelector('.studio-cover')?.naturalWidth===64);
  await page.getByLabel('Song position').evaluate(el=>{el.value='1.5';el.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.equal(await page.getByLabel('Current lyric',{exact:true}).innerText(),'First fixture line');
  const saved=await page.evaluate(async()=>{
   await auditApp.current.save();const {readProject}=await import('/src/studio/storage.ts');const s=await readProject(auditApp.current.project.id);
   const {StudioSource,studioFolder}=await import('/src/studio/source.ts');const source=new StudioSource(),folder=studioFolder(s.project,s.stems,s.cover);
   const {makeSongEntry}=await import('/src/library/song.ts');const song=makeSongEntry(folder);
   const coverUrl=await source.fileUrl(folder.path+'/'+song.albumArt),cover=await(await fetch(coverUrl)).arrayBuffer();source.release(coverUrl);
   const {exportProject,importProjectZip}=await import('/src/studio/export.ts');const zip=await exportProject(s.project,s.audio,s.stems,s.cover),r=await importProjectZip(zip,'restored');
   return {id:s.project.id,artist:s.project.artist,lyrics:r.project.lyrics,album:r.project.album,cover:Array.from(new Uint8Array(cover)),restoredCover:Array.from(new Uint8Array(await r.cover.arrayBuffer())),file:song.albumArt};
  });
  assert.equal(saved.artist,'Fixture Artist');assert.equal(saved.album,'Fixture Album');assert.equal(saved.lyrics,lrc);
  assert.equal(saved.file,'album.png');assert.deepEqual(saved.cover,[...png]);assert.deepEqual(saved.restoredCover,[...png]);
  console.log(`PASS: ${ext} embedded title/artist/album/cover/LRC, native decode, Studio preview, saved source artwork, ZIP round trip`);
 }
 // Manual replacements and synchronization must survive ordinary chart edits and undo.
 await page.getByLabel('Lyrics file',{exact:true}).setInputFiles(`${temp}/plain.txt`);
 assert.equal(await page.getByLabel('Lyrics',{exact:true}).inputValue(),'Plain fixture lyrics\nKeep this line');
 await page.getByLabel('Song position').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.getByLabel('Lyrics',{exact:true}).evaluate(el=>el.setSelectionRange(0,0));
 await page.getByRole('button',{name:'Time line at playhead',exact:true}).click();
 assert.ok((await page.getByLabel('Lyrics',{exact:true}).inputValue()).startsWith('[00:02.000]Plain fixture lyrics'));
 await page.getByLabel('Lyrics file',{exact:true}).setInputFiles(`${temp}/timed.lrc`);
 await page.getByRole('button',{name:'Remove cover',exact:true}).click();
 assert.equal(await page.locator('.studio-cover').count(),0);
 await page.getByLabel('Album cover file',{exact:true}).setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
 await page.getByText('Choose a PNG, JPEG, or WebP cover up to 5 MB.',{exact:true}).waitFor();
 await page.getByLabel('Album cover file',{exact:true}).setInputFiles(`${temp}/cover.png`);
 await page.waitForFunction(()=>document.querySelector('.studio-cover')?.naturalWidth===64);
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.locator('.studio-screen').evaluate(el=>el.scrollWidth>el.clientWidth),false)}
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:'/tmp/studio-song-media.png'});
 await page.getByRole('button',{name:'Watch bot',exact:true}).click();
 await page.waitForFunction(()=>globalThis.__game?.setup.bot&&document.querySelector('.loading')?.classList.contains('gone'),{timeout:60000});
 assert.equal(await page.evaluate(()=>__game.setup.chart.lyrics.length),3);
 await page.getByText('First fixture line',{exact:true}).waitFor();
 await page.keyboard.press('Escape');await page.getByText('Return to Chart Studio',{exact:true}).click();
 await page.getByRole('tab',{name:'Song',exact:true}).click();
 assert.equal(await page.getByLabel('Lyrics',{exact:true}).inputValue(),lrc);
 await page.waitForFunction(()=>document.querySelector('.studio-cover')?.naturalWidth===64);
 const id=await page.evaluate(()=>auditApp.current.project.id);await page.reload();
 await page.getByRole('button',{name:'Chart Studio',exact:true}).click();
 await page.locator('.studio-project-menu > summary').click();await page.getByLabel('Saved projects').selectOption(id);
 await page.getByRole('tab',{name:'Song',exact:true}).click();
 assert.equal(await page.getByLabel('Lyrics',{exact:true}).inputValue(),lrc);
 await page.waitForFunction(()=>document.querySelector('.studio-cover')?.naturalWidth===64);
 assert.deepEqual(errors,[]);
 console.log('PASS: manual cover replacement/rejection, plain lyrics import, manual line timing, timed import, phone layout, bot HUD, return, reload persistence');
 if(process.env.PRODUCTION_URL){
  const built=await browser.newPage();built.on('pageerror',error=>errors.push(error.message));
  await built.goto(process.env.PRODUCTION_URL);await built.getByRole('button',{name:'Chart Studio',exact:true}).click();
  await built.getByLabel('Import song file').setInputFiles(`${temp}/song.m4a`);
  await built.getByRole('button',{name:'Playtest',exact:true}).waitFor({timeout:60000});
  await built.getByRole('tab',{name:'Song',exact:true}).click();
  assert.equal(await built.getByLabel('Lyrics',{exact:true}).inputValue(),lrc);
  assert.equal(await built.getByLabel('Album',{exact:true}).inputValue(),'Fixture Album');
  await built.waitForFunction(()=>document.querySelector('.studio-cover')?.naturalWidth===64);
  assert.ok((await built.locator('#third-party-notices').textContent()).includes('music-metadata'));
  await built.getByRole('button',{name:'Watch bot',exact:true}).click();
  await built.waitForFunction(()=>globalThis.__game?.setup.bot&&document.querySelector('.loading')?.classList.contains('gone'),{timeout:60000});
  assert.equal(await built.evaluate(()=>__game.setup.chart.lyrics.length),3);
  await built.getByText('First fixture line',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: single-file production metadata reader, embedded cover/LRC, dependency notices and bot lyric HUD');
 }
}finally{await browser.close();await rm(temp,{recursive:true,force:true})}
