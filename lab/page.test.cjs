// Executes only the mock page in Node/DOM. No browser is started.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom'),{MockLms}=require('./server.cjs');
const flush=()=>new Promise(setImmediate);
async function page(scenario='pipeline'){
 const {document,window}=parseHTML(fs.readFileSync(path.join(__dirname,'page.html'),'utf8'));
 const model=new MockLms(scenario,()=>0),intervals=[];
 const fetch=async(url,options={})=>{
  assert.ok(url.startsWith('/api/'),'Mock page may request only its own API');
  let value;
  if(url.startsWith('/api/progress'))value=model.report();
  else if(url.startsWith('/api/state')){model.state(JSON.parse(options.body));value={ok:true};}
  else throw new Error('Unexpected endpoint');
  return {ok:true,json:async()=>value};
 };
 const context=vm.createContext({document,window,HTMLVideoElement:window.HTMLVideoElement,URLSearchParams,
  location:{search:'?scenario='+scenario},fetch,Promise,setInterval:fn=>intervals.push(fn)});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'page.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','vnu-lms-player','lms.js'),'utf8'),context);
 for(let i=0;i<5;i++)await flush();
 const L=vm.runInContext('VnuLms',context);
 const visible=e=>{for(let n=e;n;n=n.parentElement)if(n.style.display==='none')return false;return true};
 return {document,window,model,L,visible};
}
test('actual browser fixture lazily mounts all six required leaves with exact native selectors',async()=>{
 const {document:d,window,model,L,visible}=await page();
 assert.equal(L.links(d).length,0,'Initially only collapsed folder headings should exist');
 for(const row of model.report().slice(2)){
  let result;
  for(let i=0;i<10;i++){result=L.openItem(d,row.title,visible,{section:row.section});if(result!=='expanded')break;}
  assert.equal(result,'clicked',row.title);await flush();
  assert.equal(d.getElementById('heading').textContent,row.title);
  if(row.index===4){const gate=L.blocker(d,row.title,visible);assert.equal(gate.kind,'prerequisite');assert.deepEqual([...gate.titles],['Video 2: Tiếp theo']);}
 }
 assert.deepEqual([...window.__vnuLabMenuEvents].map(e=>e.title),['Bài 2. Nội dung bắt buộc','2.2 Nội dung','2.2.1 Bài giảng','2.2.2 Hoạt động','2.2.3 Tài liệu']);
 assert.deepEqual(model.visits,[2,3,4,5,6,7]);assert.equal(model.submissions,0);
 d.getElementById('progress-tab').click();for(let i=0;i<5;i++)await flush();
 const report=L.progress(d,visible);assert.equal(report.kind,'ready');assert.equal(report.requiredItems.length,7);
 assert.equal(report.items[3].section,'2.2.1 Bài giảng');assert.equal(report.items[7].section,'2.2.3 Tài liệu');
});
test('controls browser fixture retains its flat native video control',async()=>{
 const {document:d,window,L,visible}=await page('controls');
 const row=L.links(d)[0];assert.ok(row);assert.equal(L.openItem(d,row.textContent,visible),'clicked');
 assert.equal(d.getElementById('TNContentView').tagName,'VIDEO');assert.equal(window.__vnuLabMenuEvents.length,0);
});
test('every mandatory CI fixture leaf has a compatible report row, including the precompleted chapter',async()=>{
 const {document:d,L,visible}=await page(),state={};let snapshot;
 for(let i=0;i<80;i++){snapshot=L.scanMenu(d,visible,i*500,state);if(snapshot.kind==='ready')break;}
 assert.equal(snapshot.kind,'ready');assert.equal(snapshot.blocked.length,0);
 d.getElementById('progress-tab').click();for(let i=0;i<5;i++)await flush();
 const report=L.progress(d,visible);assert.equal(report.kind,'ready');assert.equal(L.unreportedMenuItems(snapshot,report).length,0);
});
