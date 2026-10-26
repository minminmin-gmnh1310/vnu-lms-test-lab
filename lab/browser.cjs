'use strict';
// Intended for the user's own machine or GitHub-hosted VM. This script is not
// executed through the restricted Cloud Browser in this conversation.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {startServer}=require('./server.cjs');
const {launchNativeBrowser}=require('./native-browser.cjs');
const root=path.join(__dirname,'..'),results=path.join(root,'results');fs.mkdirSync(results,{recursive:true});
const scripts=['controller.js','lms.js','queue.js','player.js'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const panel=(page,id)=>page.locator('#vnu-lecture-helper').locator('#'+id);
async function waitPlaying(page){await page.waitForFunction(()=>{const v=document.getElementById('TNContentView');return v instanceof HTMLVideoElement&&!v.paused&&v.readyState>=2;},null,{timeout:45000});}
async function step(entry,name,action){
 const item={name,status:'running',startedAt:new Date().toISOString()};entry.steps.push(item);
 try{const value=await action();item.status='passed';return value;}
 catch(error){item.status='failed';throw error;}
 finally{item.finishedAt=new Date().toISOString();}
}
async function snapshot(page){
 return page.evaluate(()=>{
  const v=document.querySelector('video'),panel=document.getElementById('vnu-lecture-helper')?.shadowRoot;
  return {url:location.href,visibility:document.visibilityState,hidden:document.hidden,focused:document.hasFocus(),
   video:v?{paused:v.paused,time:v.currentTime,readyState:v.readyState}:null,
   engine:panel?.getElementById('engine')?.textContent,visibilityEvents:window.__vnuLabVisibilityEvents||[]};
 });
}
async function main(){
 const lab=await startServer(),work=fs.mkdtempSync(path.join(os.tmpdir(),'vnu-offline-lab-'));
 const extension=path.join(work,'extension');fs.mkdirSync(extension);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'vnu-lms-player','manifest.json'),'utf8'));
 const report={mode:'REAL CHROMIUM + LOCAL MOCK LMS',vnuServerTested:false,windowsEdgeTested:false,environment:{os:process.platform,node:process.version},startedAt:new Date().toISOString(),runtimeVersion:manifest.version,
  labVersion:'1.0.2',requirementsSeconds:1.5,browser:null,runtimeHashes:{},cases:[],setupError:null};
 try {
  for(const name of scripts){const source=path.join(root,'vnu-lms-player',name);fs.copyFileSync(source,path.join(extension,name));report.runtimeHashes[name]=hash(source);assert.equal(hash(source),hash(path.join(extension,name)));}
  // Chromium match patterns use host names without ports; network routing
  // below still restricts browser requests to this one random loopback port.
  manifest.name+=' — OFFLINE LAB';for(const entry of manifest.content_scripts)entry.matches=['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest,null,2));
  const cases=[
   ['pipeline','pipeline',async(page,context,entry)=>{
    await page.waitForFunction(()=>document.getElementById('vnu-lecture-helper')?.shadowRoot?.getElementById('required-summary')?.textContent.includes('7 / 7'),null,{timeout:120000});
    const summary=lab.models.get('pipeline').summary();assert.deepEqual(summary.visits,[2,3,4,5,6,7]);assert.equal(summary.submissions,0);
    assert.ok(summary.items.filter(x=>x.required).every(x=>x.status==='Đã hoàn thành'));
    await page.waitForFunction(()=>document.getElementById('vnu-lecture-helper').shadowRoot.getElementById('engine').textContent.includes('Đã dừng'));
    assert.equal(await panel(page,'pending').isVisible(),false);return summary;
   }],
   ['controls','controls',async(page,context,entry)=>{
    await step(entry,'resize and native video at 1x',async()=>{
    await waitPlaying(page);const v=page.locator('video#TNContentView');assert.equal(await v.evaluate(x=>x.playbackRate),1);
    await v.evaluate(x=>{window.__vnuLabTimeUpdates=0;x.addEventListener('timeupdate',()=>window.__vnuLabTimeUpdates++);});
    await page.setViewportSize({width:680,height:720});
    await page.waitForFunction(()=>window.__vnuLabTimeUpdates>0&&!document.querySelector('video').paused,null,{polling:100,timeout:5000});
    assert.equal(await page.locator('#vnu-lecture-helper .box').evaluate(x=>x.classList.contains('compact')),true);
    });
    const v=page.locator('video#TNContentView');
    await step(entry,'keyboard Pause and Play',async()=>{
    await v.press('Space');await page.waitForFunction(()=>document.querySelector('video').paused);await page.waitForTimeout(700);assert.equal(await v.evaluate(x=>x.paused),true);
    await v.press('Space');await waitPlaying(page);
    });
    await step(entry,'Stop remains paused and Start resumes',async()=>{
    await panel(page,'stop').click();await page.waitForTimeout(700);assert.equal(await v.evaluate(x=>x.paused),true);
    await panel(page,'start').click();await waitPlaying(page);await panel(page,'stop').click();
    });
    return lab.models.get('controls').summary();
   }],
   ['visibility','controls',async(page,context,entry)=>{
    await waitPlaying(page);
    await page.evaluate(()=>{
     window.__vnuLabVisibilityEvents=[];
     document.addEventListener('visibilitychange',()=>window.__vnuLabVisibilityEvents.push({
      visibility:document.visibilityState,hidden:document.hidden,at:Date.now()}));
    });
    const other=await context.newPage();await other.goto(lab.origin+'/frame');
    // noDefaults was enabled on the FIRST connection, before either page.
    // Merely disabling emulation from a second CDP session cannot release the
    // original session's keep-visible capture handle (Chromium EmulationHandler).
    await step(entry,'both pages belong to the same native browser window',async()=>{
     entry.windows=[];
     for(const target of [page,other]){
      const session=await context.newCDPSession(target);
      const {targetInfo}=await session.send('Target.getTargetInfo');
      const {windowId}=await session.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});
      entry.windows.push({url:target.url(),windowId});await session.detach();
     }
     assert.equal(entry.windows[0].windowId,entry.windows[1].windowId,'Visibility test requires two tabs in ONE window');
    });
    await page.bringToFront();
    await page.waitForFunction(()=>document.visibilityState==='visible',null,{polling:100,timeout:10000});
    await waitPlaying(page);
    await step(entry,'background tab becomes hidden and video pauses',async()=>{
    await other.bringToFront();
    await page.waitForFunction(()=>document.visibilityState==='hidden',null,{polling:100,timeout:10000});
    await page.waitForFunction(()=>document.querySelector('video').paused,null,{polling:100,timeout:10000});
    await page.waitForTimeout(700);
    assert.equal((await snapshot(page)).visibility,'hidden');
    assert.equal((await snapshot(page)).video.paused,true);
    });
    await step(entry,'return to visible tab resumes video',async()=>{
    await page.bringToFront();
    await page.waitForFunction(()=>document.visibilityState==='visible',null,{polling:100,timeout:10000});
    await waitPlaying(page);
    });
    entry.visibility=await snapshot(page);
    assert.ok(entry.visibility.visibilityEvents.some(x=>x.visibility==='hidden'));
    assert.ok(entry.visibility.visibilityEvents.some(x=>x.visibility==='visible'));
    await other.close();await panel(page,'stop').click();
    return lab.models.get('controls').summary();
   }]
  ];
  for(const [name,scenario,action] of cases){
   let context=null,page=null,native=null;const logs=[],entry={name,scenario,status:'running',steps:[],startedAt:new Date().toISOString()};report.cases.push(entry);
   try {
    if(name==='visibility'){
     native=await launchNativeBrowser(chromium,{profile:path.join(work,'profile-'+name),extension,
      logPath:path.join(results,'visibility-browser.log'),artifactsDir:results});
     context=native.context;entry.browserSetup={noDefaults:true,recordVideo:false,traceScreenshots:false};
    }else context=await chromium.launchPersistentContext(path.join(work,'profile-'+name),{channel:'chromium',headless:false,
     args:['--disable-extensions-except='+extension,'--load-extension='+extension],viewport:{width:1280,height:900},recordVideo:{dir:path.join(results,'videos',name),size:{width:960,height:675}}});
    report.browser=context.browser()?.version()||'Chromium persistent context';
    await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===lab.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
    await context.tracing.start({screenshots:name!=='visibility',snapshots:true,sources:true});page=context.pages()[0]||await context.newPage();
    if(native)await page.setViewportSize({width:1280,height:900});
    page.on('console',m=>logs.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>logs.push({type:'pageerror',text:e.message}));
    await page.goto(lab.origin+lab.coursePath+'?scenario='+scenario);await page.locator('#lab-banner').waitFor();
    assert.match(await page.locator('#lab-banner').innerText(),/MÔ PHỎNG/);
    await page.locator('#vnu-lecture-helper').waitFor({timeout:15000});
    entry.summary=await action(page,context,entry);assert.equal(await page.locator('#fixture-error').innerText(),'');
    assert.deepEqual(logs.filter(x=>x.type==='pageerror'),[]);entry.status='passed';
   }catch(error){
    entry.status='failed';entry.error=error.stack||String(error);process.exitCode=1;
    if(context)entry.pageStates=await Promise.all(context.pages().map(p=>snapshot(p).catch(e=>({error:e.message}))));
   }
   finally {
    entry.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(results,name+'-console.json'),JSON.stringify(logs,null,2));
    // Capture states above BEFORE foregrounding a failed/background page.
    if(page){await page.bringToFront().catch(()=>{});await page.screenshot({path:path.join(results,name+'.png'),fullPage:true,timeout:10000}).catch(()=>{});}
    if(context){await context.tracing.stop({path:path.join(results,name+'-trace.zip')}).catch(()=>{});if(!native)await context.close().catch(()=>{});}
    if(native)await native.close();
    console.log(name+': '+entry.status+(entry.error?'\n'+entry.error:''));
   }
  }
 }catch(error){report.setupError=error.stack||String(error);process.exitCode=1;}
 finally {
  await lab.close();fs.rmSync(work,{recursive:true,force:true});report.finishedAt=new Date().toISOString();
  report.status=report.setupError||report.cases.some(x=>x.status!=='passed')?'failed':'passed';
  fs.writeFileSync(path.join(results,'browser-summary.json'),JSON.stringify(report,null,2));
  console.log('Browser report: results/browser-summary.json; real VNU was not contacted.');
 }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
