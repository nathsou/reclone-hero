// Live CORS/pairing/failure/cleanup audit. Start the real helper and set STEM_HELPER_CODE.
// An invalid recording fails at ffmpeg decode, before any model download or inference.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
if(!process.env.STEM_HELPER_CODE)throw new Error('Set STEM_HELPER_CODE from the running helper.');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
try{
 const page=await browser.newPage();
 await page.goto(process.env.AUDIT_URL ?? 'http://127.0.0.1:5230');
 const result=await page.evaluate(async token=>{
  const {connectHelper,separateAudio}=await import('/src/studio/stems.ts');
  await connectHelper(token);
  let auth='';try{await connectHelper('wrong-code')}catch(error){auth=error.message}
  let failure='';try{await separateAudio(new Blob(['invalid song']),token,16,new AbortController().signal,()=>{})}catch(error){failure=error.message}
  // A second upload must be accepted and fail for the same decode reason, not because a job leaked.
  let retry='';try{await separateAudio(new Blob(['invalid retry']),token,16,new AbortController().signal,()=>{})}catch(error){retry=error.message}
  return {auth,failure,retry};
 },process.env.STEM_HELPER_CODE);
 assert.match(result.auth,/pairing code is incorrect/);
 assert.match(result.failure,/Separation failed/);assert.match(result.retry,/Separation failed/);
 assert.equal(result.retry.includes('Another separation is active'),false);
 console.log('PASS: real loopback helper across browser origins, CORS, bearer pairing, real ffmpeg rejection, retry and job cleanup; no model required');
}finally{await browser.close()}
