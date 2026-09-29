// Optional contact sheet and rendering audit for the complete built-in cover catalog.
// Uses the same optional Playwright / Chrome environment variables as browser-audit.mjs.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
const origin = process.env.AUDIT_URL ?? 'http://127.0.0.1:5230';
const output = process.env.AUDIT_OUTPUT ?? '/tmp/reclone-audit';
await mkdir(output,{recursive:true});
try {
  const page = await browser.newPage({viewport:{width:1340,height:960},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__cover-audit',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:20px;background:#171717;color:#eee;font:12px system-ui}main{display:grid;grid-template-columns:repeat(7,176px);gap:12px}figure{margin:0}img{width:176px;height:176px;display:block}figcaption{padding:6px 0;height:22px}h1{font-size:20px}#thumbs{display:flex;flex-wrap:wrap;gap:12px}#thumbs img{width:36px;height:36px}
  </style><h1>Built-in cover collection</h1><main></main><h1>36-pixel library thumbnails</h1><div id="thumbs"></div><script type="module">
  import '/src/styles/fonts.css';import {coverArt,drawCover} from '/src/starter/art.ts';import {COVER_DESIGNS} from '/src/starter/coverDesign.ts';import {STARTER_SONGS} from '/src/starter/songs/index.ts';
  window.artAudit=[];
  for(const def of STARTER_SONGS){
    if(!COVER_DESIGNS[def.id])throw Error('Missing bespoke cover '+def.id);
    const blob=await coverArt(def),url=URL.createObjectURL(blob);
    const fig=document.createElement('figure'),img=new Image(),cap=document.createElement('figcaption');img.src=url;await img.decode();
    cap.textContent=def.name;fig.append(img,cap);document.querySelector('main').append(fig);
    document.querySelector('#thumbs').append(img.cloneNode());
    const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');drawCover(g,def);
    const pixels=g.getImageData(0,0,512,512).data;
    const digest=await crypto.subtle.digest('SHA-256',pixels);
    window.artAudit.push({id:def.id,size:blob.size,width:img.naturalWidth,height:img.naturalHeight,hash:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});
  }
  window.artDone=true;
  </script>`}));
  await page.goto(`${origin}/__cover-audit`);await page.waitForFunction(()=>window.artDone,{},{timeout:60000});
  const records=await page.evaluate(()=>artAudit);
  assert.equal(records.length,53);assert.equal(new Set(records.map(r=>r.hash)).size,53,'all 53 rendered designs differ');
  for(const r of records){assert.equal(r.width,512);assert.equal(r.height,512);assert.ok(r.size>1000&&r.size<200000,`${r.id}: efficient on-demand PNG`);}
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${output}/starter-cover-collection.png`,fullPage:true});
  await page.locator('#thumbs').screenshot({path:`${output}/starter-cover-thumbnails.png`});
  for(const id of ['spring','moonlight','mars-war-machine','paper-hearts','photon-run']){
    const index=records.findIndex(r=>r.id===id);await page.locator('main img').nth(index).screenshot({path:`${output}/cover-${id}.png`});
  }
  console.log(`PASS: ${records.length} unique, complete 512px covers; no page errors. Mean generated PNG ${(records.reduce((a,r)=>a+r.size,0)/records.length/1024).toFixed(1)} KiB, generated on demand and absent from the bundle.`);
  console.log(`Contact sheet: ${output}/starter-cover-collection.png`);
} finally {await browser.close();}
