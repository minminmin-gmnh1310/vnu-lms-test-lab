// Regression cases reproduced on 0.8.1; verify recovery on the fixed runtime.
// Real selectors, but simulated layout/media/focus/time/server as in the shipped tests.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,item,reading,numbered,survey}=require('./required-fixture.cjs');
const video=(title=numbered)=>item(title,{type:'video',minimum:10});
const automatic={productionDefaults:true};
const viewing=s=>s.phase().includes('Hiển thị nội dung');
test('CONTROL: regular callbacks complete a timed page when native report confirms it',async()=>{
 const s=setup([item(reading,{minimum:0.05}),video()],{...automatic,credit:true});
 await s.until(()=>s.playing,160);assert.deepEqual(s.opened,[0,1]);assert.equal(s.items[0].status,'Đã hoàn thành');
});
test('REGRESSION: callback gaps must not indefinitely suppress native LMS progress reads',async()=>{
 let shouldComplete=false;
 const s=setup([item(reading,{minimum:1}),video()],{...automatic,onProgress:s=>{if(shouldComplete)s.update(0,1,'Đã hoàn thành');}});
 await s.until(()=>viewing(s));const visits=s.progressVisits;shouldComplete=true;
 for(let i=0;i<60;i++)await s.tick(10000);
 assert.ok(s.progressVisits>visits,JSON.stringify({problem:'No progress read after ten minutes with 10s callback gaps',visits:s.progressVisits,watched:s.metric('watched'),phase:s.phase()}));
});
test('REGRESSION: a recognized video player must be usable when its title lacks the Video prefix',async()=>{
 const s=setup([video('Bài 1: Tổng quan về học phần'),video('Video 2: Tiếp theo')],automatic);
 await s.until(()=>s.opened.length===1);await s.tick(61000);await s.until(()=>s.playing,120);
 assert.equal(s.items[0].status,'Chưa hoàn thành');
 assert.ok(s.plays.includes(0),JSON.stringify({problem:'Playable required video skipped because of title',opened:s.opened,plays:s.plays,pending:s.metric('pending-list')}));
});
test('REGRESSION: iframe autofocus alone must not indefinitely hold an untouched timed survey',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),video()],{...automatic,surveyIframe:true});await s.until(()=>viewing(s));
 const frame=s.document.getElementById('TNContentView');Object.defineProperty(s.document,'activeElement',{get:()=>frame});
 const visits=s.progressVisits;await s.run(150);
 assert.equal(s.answers,0);
 assert.ok(s.progressVisits>visits,JSON.stringify({problem:'Iframe focus without input held the queue',visits:s.progressVisits,phase:s.phase(),message:s.message()}));
});
test('REGRESSION: a player removed while waiting for user Play must not leave an unlimited wait',async()=>{
 const s=setup([video(),video('Video 2: Tiếp theo')],{continuous:true,muteRecovery:false,play:()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}))});
 await s.until(()=>s.phase().includes('Chờ bạn bấm Play'));s.document.getElementById('TNContentView').remove();
 await s.tick(600000);await s.run(10);
 assert.doesNotMatch(s.phase(),/Chờ bạn bấm Play/,JSON.stringify({problem:'Missing player still awaiting Play ten minutes later',phase:s.phase(),message:s.message()}));
});
test('REGRESSION: a changing counter in a stable reader must not prevent all future progress reads',async()=>{
 const s=setup([item(reading,{minimum:1}),video()],automatic);await s.until(()=>viewing(s));
 const body=s.document.getElementById('TNContentView'),visits=s.progressVisits;
 for(let i=0;i<400;i++){body.textContent='Cùng nội dung học tập. Bộ đếm động: '+i;await s.tick();}
 assert.ok(s.progressVisits>visits,JSON.stringify({problem:'Content text changes reset every observation',visits:s.progressVisits,watched:s.metric('watched'),phase:s.phase()}));
});
test('CONTROL: default split mode allows a visible unfocused window but pauses a hidden tab',async()=>{
 const s=setup([video()],automatic);await s.until(()=>s.playing);s.front=false;await s.run(4);assert.equal(s.playing,true);
 s.visible=false;s.document.dispatchEvent(new s.window.Event('visibilitychange'));assert.equal(s.playing,false);assert.equal(s.document.visibilityState,'hidden');
});
