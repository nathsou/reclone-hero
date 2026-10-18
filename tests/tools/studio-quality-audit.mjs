// Full recordings remain external. MUSIC_DIR contains songs; optional BASELINE_DIR contains old
// per-song project JSONs (filename + '.json'). Writes diagnostics/charts, never copies source audio.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const load=file=>import(pathToFileURL(join(process.env.SOURCE_ROOT??process.cwd(),'src',file)).href);
const [{analyzeAudio},{chartText,createProject,generateNotes,PROFILES,timingMap},{loadChart},{Engine,HIT},{applyAction,botActions}]=await Promise.all([
 load('studio/analysis.ts'),load('studio/model.ts'),load('chart/load.ts'),load('engine/engine.ts'),load('engine/bot.ts')]);
if(!process.env.MUSIC_DIR)throw new Error('Set MUSIC_DIR to recordings on this computer.');
const out=process.env.AUDIT_OUTPUT??'/tmp/chart-quality-candidate',scratch=await mkdtemp('/tmp/chart-quality-decode-');
await mkdir(out,{recursive:true});
const results=[];
const attacks=notes=>notes.filter((note,i)=>!i||notes[i-1].time!==note.time);
const stats=notes=>{
 const singles=attacks(notes),first=singles.filter(note=>note.time<30);
 return {attacks:singles.length,gems:notes.length,chords:notes.length-singles.length,introAttacks:first.length,
  laneSwitchRate:singles.slice(1).filter((note,i)=>note.lane!==singles[i].lane).length/Math.max(1,singles.length-1)};
};
const consistency=(notes,onsets)=>{
 const buckets=new Map();for(const note of attacks(notes)){
  const event=onsets.find(o=>Math.abs(o.time-note.time)<0.025&&o.pitch!==undefined&&(o.clarity??0)>=0.18);
  if(!event)continue;const pitch=Math.round(event.pitch),lanes=buckets.get(pitch)??new Map();lanes.set(note.lane,(lanes.get(note.lane)??0)+1);buckets.set(pitch,lanes);
 }
 let count=0,error=0;for(const lanes of buckets.values()){const counts=[...lanes.values()],sum=counts.reduce((a,b)=>a+b,0);count+=sum;error+=sum-Math.max(...counts)}
 return {matchedAttacks:count,estimatedPitchFretVariation:count?error/count:0};
};
try{
 for(const name of (await readdir(process.env.MUSIC_DIR)).filter(name=>/\.(mp3|wav|ogg|opus|m4a)$/i.test(name)).sort()){
  const path=join(process.env.MUSIC_DIR,name),decoded=join(scratch,'audio.f32');
  execFileSync('ffmpeg',['-v','error','-y','-i',path,'-f','f32le','-ac','2','-ar','22050',decoded]);
  const bytes=await readFile(decoded),stereo=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
  const energies=[0,0];for(let i=0;i<stereo.length;i+=32){energies[0]+=stereo[i]**2;energies[1]+=stereo[i+1]**2}
  const channel=energies[1]>energies[0]?1:0,pcm=new Float32Array(stereo.length/2);for(let i=0;i<pcm.length;i++)pcm[i]=stereo[i*2+channel];
  const start=performance.now(),analysis=analyzeAudio(pcm,22050),project=createProject('audit',name,analysis),ms=Math.round(performance.now()-start);
  if(process.env.CAPTURE_BASELINE==='1'){
   await writeFile(join(out,name+'.json'),JSON.stringify({...project,analysis:{...analysis,waveform:Array.from(analysis.waveform)}}));
   const result={name,seconds:analysis.duration,bpm:analysis.bpm,analysisMs:ms,stats:Object.fromEntries(Object.entries(project.notes).map(([diff,notes])=>[diff,stats(notes)]))};
   results.push(result);console.log(JSON.stringify(result));continue;
  }
  let baseline;
  if(process.env.BASELINE_DIR)baseline=JSON.parse(await readFile(join(process.env.BASELINE_DIR,name+'.json'),'utf8'));
  const modes={};
  for(const focus of ['balanced','melody','rhythm']){
   project.focus=focus;for(const diff of Object.keys(PROFILES))project.notes[diff]=generateNotes(project,diff);
   const chart=loadChart('notes.chart',new TextEncoder().encode(chartText(project)),{delayMs:timingMap(project).offset*1000}),counts={};
   let previous=[];
   for(const [diff,cfg] of Object.entries(PROFILES)){
    const source=project.notes[diff],track=chart.tracks.get(`guitar:${diff}`),times=source.map(note=>note.time);
    assert.ok(previous.every(time=>times.includes(time)),`${name}: ${focus}/${diff} nested attacks`);previous=times;
    assert.equal(source.length,track.notes.length,'no invented chords or collapsed events');
    for(let i=0;i<source.length;i++){
     assert.ok(source[i].lane<cfg.lanes);assert.ok(Math.abs(source[i].time-track.notes.time[i])<0.003,'recording timing survives export');
     if(i)assert.ok(times[i]-times[i-1]>=cfg.gap-0.0001);
     if(i>=cfg.burst)assert.ok(times[i]-times[i-cfg.burst]>=0.9999);
    }
    const engine=new Engine(track,chart.tempo);for(const action of botActions(track))applyAction(engine,action);engine.advance(analysis.duration+1);
    assert.ok([...engine.noteState].every(state=>state===HIT),`${name}: ${focus}/${diff} bot full combo`);
    counts[diff]={...stats(source),...consistency(source,analysis.onsets)};
   }
   modes[focus]=counts;
   await writeFile(join(out,`${name}.${focus}.chart`),chartText(project));
   if(focus==='balanced')await writeFile(join(out,name+'.json'),JSON.stringify({...project,analysis:{...analysis,waveform:Array.from(analysis.waveform)}}));
  }
  const before=baseline?{bpm:baseline.analysis.bpm,stats:Object.fromEntries(Object.entries(baseline.notes).map(([diff,notes])=>[diff,{...stats(notes),...consistency(notes,analysis.onsets)}]))}:undefined;
  const result={name,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),seconds:analysis.duration,bpm:analysis.bpm,confidence:analysis.confidence,tempoVariable:analysis.tempoVariable??false,onsets:analysis.onsets.length,analysisMs:ms,before,modes};
  results.push(result);console.log(JSON.stringify({name,oldBpm:before?.bpm,bpm:analysis.bpm,ms,beforeEasy:before?.stats.easy.introAttacks,afterEasy:modes.balanced.easy.introAttacks,expert:modes.balanced.expert.attacks,oldChords:before?.stats.expert.chords,chords:modes.balanced.expert.chords}));
 }
 await writeFile(join(out,'summary.json'),JSON.stringify(results,null,2));
 console.log(process.env.CAPTURE_BASELINE==='1'?`Captured ${results.length} baseline projects`:`PASS: ${results.length} full recordings, ${results.length*12} charts, all focus/difficulty combinations, bounds/spacing/nesting, timing round trips and bot full combos`);
}finally{await rm(scratch,{recursive:true,force:true})}
