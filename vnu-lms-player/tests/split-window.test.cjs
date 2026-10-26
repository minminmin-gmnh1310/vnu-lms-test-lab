// Viewport, focus, native media and server credit are mocks. These cases prove
// extension behavior, not Windows Snap rendering or real LMS credit.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,item,reading,numbered,survey}=require('./required-fixture.cjs');
const defaults={productionDefaults:true,width:960,height:720};
const video=(title=numbered,minimum=10)=>item(title,{type:'video',minimum});
const change=(s,value)=>{const input=s.root.getElementById('visible-mode');input.checked=value;input.dispatchEvent(new s.window.Event('change'));};
const blur=s=>{s.front=false;s.window.dispatchEvent(new s.window.Event('blur'));};
const hidden=s=>{s.visible=false;s.document.dispatchEvent(new s.window.Event('visibilitychange'));};
const viewing=s=>s.phase().includes('Hiển thị nội dung');
test('split window keeps actual playback going when the neighboring window receives focus',async()=>{
 const s=setup([video()],{...defaults,width:1920,height:1080});await s.until(()=>s.playing);await s.run(6);
 const body=s.document.getElementById('TNContentView'),time=s.time,watched=s.metric('watched'),plays=s.plays.length;
 s.resize(960,1080);blur(s);await s.run(6);
 assert.equal(s.playing,true);assert.ok(s.time>time);assert.notEqual(s.metric('watched'),watched);assert.equal(s.plays.length,plays);
 assert.equal(s.document.getElementById('TNContentView'),body);assert.match(s.phase(),/LMS còn hiển thị/);
 assert.equal(s.document.hasFocus(),false);assert.equal(s.document.visibilityState,'visible');
});
test('visible unfocused reading continues its local clock without rewriting native focus',async()=>{
 const s=setup([item(reading,{minimum:10})],{...defaults,front:false});await s.until(()=>viewing(s));await s.run(12);
 assert.equal(s.metric('watched'),'0:06');assert.equal(s.metric('recorded'),'0:00');assert.equal(s.document.hasFocus(),false);
 assert.equal(s.document.visibilityState,'visible');assert.equal(s.items[0].status,'Chưa hoàn thành');
});
for(const width of [960,683,480,320])test(`visible ${width}px viewport finishes the same required queue without focus`,async()=>{
 const s=setup([item(reading,{minimum:0.05}),video(numbered,0.05)],{...defaults,width,front:false,credit:true,serverRequiresFocus:false});
 await s.until(()=>s.phase().includes('Đã dừng'),220);
 assert.deepEqual(s.opened,[0,1]);assert.deepEqual(s.plays,[1]);assert.match(s.metric('required-summary'),/2 \/ 2/);
 assert.equal(s.root.getElementById('pending').hidden,true);assert.equal(s.document.hasFocus(),false);
});
test('resize between full half and quarter retains media position and watched total',async()=>{
 const s=setup([video()],{...defaults,width:1920,height:1080});await s.until(()=>s.playing);await s.run(8);
 let watched=s.metric('watched'),time=s.time;const body=s.document.getElementById('TNContentView'),calls=s.plays.length;
 for(const [width,height] of [[960,1080],[480,720],[1920,1080]]) {
  s.resize(width,height);assert.equal(s.time,time);assert.equal(s.metric('watched'),watched);await s.run(4);
  assert.ok(s.time>time);assert.notEqual(s.metric('watched'),watched);watched=s.metric('watched');time=s.time;
 }
 assert.equal(s.plays.length,calls);assert.equal(s.document.getElementById('TNContentView'),body);
 assert.equal(s.root.querySelector('.box').classList.contains('compact'),false);
});
test('minimizing or hiding a video pauses and discards the hidden scheduling gap',async()=>{
 const s=setup([video()],defaults);await s.until(()=>s.playing);await s.run(4);const before=s.metric('watched');hidden(s);
 assert.equal(s.playing,false);await s.tick(600000);assert.equal(s.metric('watched'),before);
 s.visible=true;s.front=false;s.document.dispatchEvent(new s.window.Event('visibilitychange'));await s.tick();assert.equal(s.playing,true);
 await s.run(4);assert.notEqual(s.metric('watched'),before);assert.equal(s.document.hasFocus(),false);
});
test('a background tab cannot continue reading even with split mode enabled',async()=>{
 const s=setup([item(reading,{minimum:10})],defaults);await s.until(()=>viewing(s));await s.run(6);const before=s.metric('watched'),visits=s.progressVisits;
 hidden(s);await s.tick(600000);await s.run(30);assert.equal(s.metric('watched'),before);assert.equal(s.progressVisits,visits);assert.match(s.phase(),/bị ẩn/);
 s.visible=true;s.document.dispatchEvent(new s.window.Event('visibilitychange'));await s.run(4);assert.notEqual(s.metric('watched'),before);
});
test('turning split mode off pauses an unfocused window and reenabling cannot credit the gap',async()=>{
 const s=setup([video()],defaults);await s.until(()=>s.playing);blur(s);await s.run(6);change(s,false);
 assert.equal(s.playing,false);const before=s.metric('watched');await s.tick(300000);assert.equal(s.metric('watched'),before);
 change(s,true);assert.equal(s.metric('watched'),before);await s.tick();await s.run(4);assert.equal(s.playing,true);assert.notEqual(s.metric('watched'),before);
});
test('server requiring actual focus is never treated as credited by the split mode clock',async()=>{
 const s=setup([item(reading,{minimum:0.05}),video()],{...defaults,front:false,credit:true});await s.until(()=>s.playing,240);
 assert.deepEqual(s.opened,[0,1]);assert.equal(s.items[0].minutes,0);assert.equal(s.items[0].status,'Chưa hoàn thành');
 assert.match(s.metric('pending-list'),/LMS chưa ghi tăng/);assert.match(s.metric('required-summary'),/0 \/ 2/);assert.equal(s.document.hasFocus(),false);
});
test('saved strict focus preference is loaded and a changed split preference is persisted',async()=>{
 const stored={vnuLmsVisibleMode:false},chrome={runtime:{},storage:{local:{get:(d,cb)=>cb({...d,...stored}),set:(v,cb)=>{Object.assign(stored,v);cb();}}}};
 const s=setup([video()],{...defaults,front:false,chrome});await s.run(10);assert.equal(s.plays.length,0);assert.equal(s.root.getElementById('visible-mode').checked,false);
 change(s,true);assert.equal(stored.vnuLmsVisibleMode,true);await s.until(()=>s.playing);assert.equal(s.document.hasFocus(),false);
});
test('a new preference defaults to split support for a preexisting auto-start preference',async()=>{
 const chrome={runtime:{},storage:{local:{get:(defaults,cb)=>cb({...defaults,vnuLmsAutoStart:true}),set:(_,cb)=>cb()}}};
 const s=setup([video()],{...defaults,front:false,chrome});await s.until(()=>s.playing);assert.equal(s.root.getElementById('visible-mode').checked,true);
});
test('small layout uses compact controls and diagnostics report actual focus and viewport',async()=>{
 const s=setup([video()],{...defaults,front:false});await s.until(()=>s.playing);
 assert.equal(s.root.querySelector('.box').classList.contains('compact'),true);assert.equal(s.root.getElementById('options').open,false);
 s.root.getElementById('diagnose').click();const report=s.metric('diagnostic');assert.match(report,/Khung cửa sổ: 960 × 720 px/);assert.match(report,/LMS có focus thật: không/);assert.match(report,/Trang còn hiển thị: có/);
 assert.match(report,/Được tiếp tục theo chế độ: có/);assert.equal(s.root.getElementById('stop').disabled,false);
 s.resize(1920,1080);assert.equal(s.root.getElementById('options').open,true);assert.equal(s.root.querySelector('.box').classList.contains('compact'),false);
});
test('short wide viewport also fits the compact controls and keeps playing',async()=>{
 const s=setup([video()],{...defaults,width:1920,height:420});await s.until(()=>s.playing);assert.equal(s.root.querySelector('.box').classList.contains('compact'),true);
 await s.run(6);assert.notEqual(s.metric('watched'),'0:00');assert.equal(s.playing,true);
});
const outOfView=(s,body)=>{
 s.bounds={top:1000,bottom:1300,left:0,right:500,width:500,height:300};body.getBoundingClientRect=()=>s.bounds;
 body.scrollIntoView=()=>{s.scrolls.push(s.index);s.bounds={...s.bounds,top:100,bottom:400};};
};
test('narrow stacked LMS brings a loaded video back into the viewport before playing',async()=>{
 const s=setup([video()],{...defaults,width:683,onLoad:outOfView});await s.until(()=>s.playing);assert.deepEqual(s.scrolls,[0]);assert.ok(s.bounds.top<s.height);
 await s.run(4);assert.notEqual(s.metric('watched'),'0:00');
});
test('narrow stacked LMS brings the reader body into view after selecting it',async()=>{
 const s=setup([item(reading,{minimum:10})],{...defaults,width:683,onLoad:outOfView});await s.until(()=>viewing(s));assert.deepEqual(s.scrolls,[0]);assert.ok(s.bounds.top<s.height);
});
test('resize scrolls an offscreen existing video without replacing or restarting it',async()=>{
 const s=setup([video()],{...defaults,width:1920,height:1080,onLoad:outOfView});await s.until(()=>s.playing);assert.equal(s.scrolls.length,0);
 const body=s.document.getElementById('TNContentView'),calls=s.plays.length;await s.run(4);const position=s.time;s.resize(683,720);
 assert.deepEqual(s.scrolls,[0]);assert.equal(s.document.getElementById('TNContentView'),body);assert.equal(s.plays.length,calls);assert.equal(s.time,position);
});
test('resize cannot scroll or release an interactive draft explicitly held by the user',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:10})],{...defaults,width:1920,height:1080,onLoad:outOfView});await s.until(()=>viewing(s));
 const answer=s.document.getElementById('survey-answer');answer.value='Bản nháp';s.root.getElementById('hold-form').click();s.resize(683,720);await s.run(20);
 assert.equal(s.scrolls.length,0);assert.equal(answer.value,'Bản nháp');assert.match(s.phase(),/Chờ bạn thực hiện/);assert.equal(s.answers,0);
});
test('resizing a hidden window performs no content scroll and Stop still cancels playback',async()=>{
 const s=setup([video()],{...defaults,width:1920,height:1080,onLoad:outOfView});await s.until(()=>s.playing);hidden(s);s.resize(683,720);
 assert.equal(s.scrolls.length,0);assert.equal(s.playing,false);s.root.getElementById('stop').click();s.visible=true;s.front=false;await s.run(30);
 assert.equal(s.playing,false);assert.equal(s.plays.length,1);assert.match(s.phase(),/Đã dừng/);
});
