const {test}=require('node:test'),assert=require('node:assert/strict');
const {MockLms,startServer}=require('./server.cjs');
function model(){let time=0;const m=new MockLms('pipeline',()=>time);return {m,advance:ms=>time+=ms};}
test('mock begins with one completed required lesson and one optional lesson',()=>{const {m}=model();const r=m.report();assert.equal(r.length,8);assert.equal(r.filter(x=>x.required).length,7);assert.equal(r.filter(x=>x.required&&x.status==='Đã hoàn thành').length,1);});
test('mock server counts eligible reading independently of any extension clock',()=>{const {m,advance}=model();m.state({index:2,visible:true});for(let i=0;i<16;i++){advance(100);m.state({index:2,visible:true});}assert.equal(m.report()[2].status,'Đã hoàn thành');});
test('a paused native video receives no mock credit',()=>{const {m,advance}=model();m.state({index:3,visible:true,playing:false});advance(100);m.tick();assert.equal(m.report()[3].minutes,0);});
test('a playing video receives mock credit',()=>{const {m,advance}=model();m.state({index:3,visible:true,playing:true});advance(200);m.tick();assert.ok(m.report()[3].minutes>0);});
test('a hidden mock page receives no credit',()=>{const {m,advance}=model();m.state({index:2,visible:false});advance(200);m.tick();assert.equal(m.report()[2].minutes,0);});
test('missing heartbeats cannot manufacture a large credit jump',()=>{const {m,advance}=model();m.state({index:2,visible:true});advance(600000);m.tick();assert.ok(m.report()[2].minutes<0.01);assert.equal(m.report()[2].status,'Chưa hoàn thành');});
test('switching to progress stops credit and does not submit a survey',()=>{const {m,advance}=model();m.state({index:4,visible:true});advance(100);m.state({index:null});const before=m.report()[4].minutes;advance(100);assert.equal(m.report()[4].minutes,before);assert.equal(m.summary().submissions,0);});
test('malformed lesson indices are rejected',()=>{const {m}=model();for(const index of [-1,99,'2',2.5])assert.throws(()=>m.state({index,visible:true}),/Invalid lesson/);});
test('mock independently denies credit to a gated activity before its prerequisite completes',()=>{
 const {m,advance}=model();m.state({index:4,visible:true,playing:true});for(let i=0;i<30;i++){advance(100);m.state({index:4,visible:true,playing:true});}
 assert.equal(m.report()[4].minutes,0);assert.equal(m.report()[4].status,'Chưa hoàn thành');
});
test('mock unlocks a gated activity only after its prerequisite receives actual mock credit',()=>{
 const {m,advance}=model();m.state({index:5,visible:true,playing:true});for(let i=0;i<16;i++){advance(100);m.state({index:5,visible:true,playing:true});}
 assert.equal(m.report()[5].status,'Đã hoàn thành');m.state({index:4,visible:true});advance(100);m.tick();assert.ok(m.report()[4].minutes>0);
});
test('mock HTTP server binds loopback and exposes only test fixtures',async()=>{
 const lab=await startServer();try{
  assert.equal(lab.server.address().address,'127.0.0.1');const r=await fetch(lab.origin+lab.coursePath);assert.match(await r.text(),/LMS MÔ PHỎNG/);
  const state=await fetch(lab.origin+'/api/progress').then(x=>x.json());assert.equal(state.length,8);
  assert.equal((await fetch(lab.origin+'/not-a-real-endpoint')).status,404);
  const bad=await fetch(lab.origin+'/api/state',{method:'POST',body:JSON.stringify({index:999})});assert.equal(bad.status,400);
  const media=await fetch(lab.origin+'/clip.webm');assert.equal(media.headers.get('content-type'),'video/webm');assert.ok((await media.arrayBuffer()).byteLength>1000);
  await fetch(lab.origin+'/api/submit',{method:'POST'});assert.equal((await fetch(lab.origin+'/api/summary').then(r=>r.json())).submissions,1);
 }finally{await lab.close();}
});
