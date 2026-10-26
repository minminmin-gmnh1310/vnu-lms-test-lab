'use strict';
// Intended for the user's own machine or GitHub-hosted VM. This script is not
// executed through the restricted Cloud Browser in this conversation.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {startServer}=require('./server.cjs');
const root=path.join(__dirname,'..'),results=path.join(root,'results');fs.mkdirSync(results,{recursive:true});
const scripts=['controller.js','lms.js','queue.js','player.js'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const panel=(page,id)=>page.locator('#vnu-lecture-helper').locator('#'+id);
async function waitPlaying(page){await page.waitForFunction(()=>{const v=document.getElementById('TNContentView');return v instanceof HTMLVideoElement&&!v.paused&&v.readyState>=2;},null,{timeout:45000});}
async function main(){
 const lab=await startServer(),work=fs.mkdtempSync(path.join(os.tmpdir(),'vnu-offline-lab-'));
 const extension=path.join(work,'extension');fs.mkdirSync(extension);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'vnu-lms-player','manifest.json'),'utf8'));
 const report={mode:'REAL CHROMIUM + LOCAL MOCK LMS',vnuServerTested:false,windowsEdgeTested:false,environment:{os:process.platform,node:process.version},startedAt:new Date().toISOString(),runtimeVersion:manifest.version,
  requirementsSeconds:1.5,browser:null,runtimeHashes:{},cases:[],setupError:null};
 try {
  for(const name of scripts){const source=path.join(root,'vnu-lms-player',name);fs.copyFileSync(source,path.join(extension,name));report.runtimeHashes[name]=hash(source);assert.equal(hash(source),hash(path.join(extension,name)));}
  // Chromium match patterns use host names without ports; network routing
  // below still restricts browser requests to this one random loopback port.
  manifest.name+=' — OFFLINE LAB';for(const entry of manifest.content_scripts)entry.matches=['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest,null,2));
  const cases=[
   ['pipeline',async(page,context)=>{
    await page.waitForFunction(()=>document.getElementById('vnu-lecture-helper')?.shadowRoot?.getElementById('required-summary')?.textContent.includes('7 / 7'),null,{timeout:120000});
    const summary=lab.models.get('pipeline').summary();assert.deepEqual(summary.visits,[2,3,4,5,6,7]);assert.equal(summary.submissions,0);
    assert.ok(summary.items.filter(x=>x.required).every(x=>x.status==='Đã hoàn thành'));
    await page.waitForFunction(()=>document.getElementById('vnu-lecture-helper').shadowRoot.getElementById('engine').textContent.includes('Đã dừng'));
    assert.equal(await panel(page,'pending').isVisible(),false);return summary;
   }],
   ['controls',async(page,context)=>{
    await waitPlaying(page);const v=page.locator('video#TNContentView');assert.equal(await v.evaluate(x=>x.playbackRate),1);
    const before=await v.evaluate(x=>x.currentTime);await page.setViewportSize({width:680,height:720});await page.waitForTimeout(450);
    assert.ok(await v.evaluate(x=>x.currentTime)>before,'Video position must advance after resize');
    assert.equal(await page.locator('#vnu-lecture-helper .box').evaluate(x=>x.classList.contains('compact')),true);
    await v.press('Space');await page.waitForFunction(()=>document.querySelector('video').paused);await page.waitForTimeout(700);assert.equal(await v.evaluate(x=>x.paused),true);
    await v.press('Space');await waitPlaying(page);
    const other=await context.newPage();await other.goto(lab.origin+'/frame');await other.bringToFront();
    await page.waitForFunction(()=>document.visibilityState==='hidden',null,{polling:100,timeout:10000});
    await page.waitForFunction(()=>document.querySelector('video').paused,null,{polling:100,timeout:10000});
    await page.bringToFront();await waitPlaying(page);await other.close();
    await panel(page,'stop').click();await page.waitForTimeout(700);assert.equal(await v.evaluate(x=>x.paused),true);
    await panel(page,'start').click();await waitPlaying(page);await panel(page,'stop').click();return lab.models.get('controls').summary();
   }]
  ];
  for(const [name,action] of cases){
   let context=null,page=null;const logs=[],entry={name,status:'running',startedAt:new Date().toISOString()};report.cases.push(entry);
   try {
    context=await chromium.launchPersistentContext(path.join(work,'profile-'+name),{channel:'chromium',headless:false,
     args:['--disable-extensions-except='+extension,'--load-extension='+extension],viewport:{width:1280,height:900},recordVideo:{dir:path.join(results,'videos',name),size:{width:960,height:675}}});
    report.browser=context.browser()?.version()||'Chromium persistent context';
    await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===lab.origin||url.protocol==='chrome-extension:'?route.continue():route.abort();});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});page=context.pages()[0]||await context.newPage();
    page.on('console',m=>logs.push({type:m.type(),text:m.text()}));page.on('pageerror',e=>logs.push({type:'pageerror',text:e.message}));
    await page.goto(lab.origin+lab.coursePath+'?scenario='+name);await page.locator('#lab-banner').waitFor();
    assert.match(await page.locator('#lab-banner').innerText(),/MÔ PHỎNG/);
    await page.locator('#vnu-lecture-helper').waitFor({timeout:15000});
    entry.summary=await action(page,context);assert.equal(await page.locator('#fixture-error').innerText(),'');
    assert.deepEqual(logs.filter(x=>x.type==='pageerror'),[]);entry.status='passed';
   }catch(error){entry.status='failed';entry.error=error.stack||String(error);process.exitCode=1;}
   finally {
    entry.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(results,name+'-console.json'),JSON.stringify(logs,null,2));
    if(page)await page.screenshot({path:path.join(results,name+'.png'),fullPage:true}).catch(()=>{});
    if(context){await context.tracing.stop({path:path.join(results,name+'-trace.zip')}).catch(()=>{});await context.close().catch(()=>{});}
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
