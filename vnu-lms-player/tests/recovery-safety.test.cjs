// Recovery boundaries: DOM/media/timers/server are mocks, not live Edge/LMS.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {setup,item,reading,numbered,survey}=require('./required-fixture.cjs');
const video=(title=numbered,minimum=10)=>item(title,{type:'video',minimum});
const automatic={productionDefaults:true};
const viewing=s=>s.phase().includes('Hiển thị nội dung');
const generic='Bài 1: Tổng quan về học phần';
const blocked=()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));

test('uncredited slow-callback reading is bounded and remains incomplete when later video starts',async()=>{
 const s=setup([item(reading,{minimum:1}),video()],automatic);
 for(let i=0;i<90&&!s.playing;i++)await s.tick(10000);
 assert.equal(s.playing,true);assert.deepEqual(s.opened,[0,1]);assert.equal(s.items[0].minutes,0);assert.equal(s.items[0].status,'Chưa hoàn thành');
 assert.match(s.metric('pending-list'),/LMS chưa ghi tăng/);assert.match(s.metric('required-summary'),/0 \/ 2/);
});
test('three unchanged reads cannot defer a ten-minute page after only five minutes',async()=>{
 const s=setup([item(reading,{minimum:10}),video()],automatic);await s.until(()=>viewing(s));
 for(let i=0;i<30;i++)await s.tick(10000);
 assert.ok(s.progressVisits>=3);assert.equal(s.root.getElementById('pending').hidden,true);assert.equal(s.plays.length,0);assert.deepEqual(s.opened,[0]);
});
test('delayed video samples reread actual report without crediting the missing samples',async()=>{
 let serverDoneAt=Infinity;
 const s=setup([video(numbered,1),video('Video 2: Tiếp theo')],{...automatic,onProgress:s=>{if(s.clock>=serverDoneAt)s.update(0,1,'Đã hoàn thành');}});
 await s.until(()=>s.playing);serverDoneAt=s.clock+60000;
 for(let i=0;i<40&&!s.plays.includes(1);i++){if(s.playing)s.time+=10;await s.tick(10000);}
 assert.deepEqual(s.plays,[0,1]);assert.equal(s.items[0].status,'Đã hoàn thành');assert.match(s.metric('required-summary'),/1 \/ 2/);
});
test('hidden time cannot consume a fallback deadline or its watchdog budget',async()=>{
 const s=setup([item(reading,{minimum:10})],automatic);await s.until(()=>viewing(s));await s.tick(10000);
 const visits=s.progressVisits,watched=s.metric('watched');s.visible=false;s.document.dispatchEvent(new s.window.Event('visibilitychange'));await s.tick(600000);
 assert.equal(s.progressVisits,visits);assert.equal(s.metric('watched'),watched);s.visible=true;s.document.dispatchEvent(new s.window.Event('visibilitychange'));await s.run(80);
 assert.equal(s.progressVisits,visits);await s.until(()=>s.progressVisits>visits,40);assert.equal(s.items[0].minutes,0);
});
test('manual Pause after a delayed sample suspends polling until real playback resumes',async()=>{
 const s=setup([video()],automatic);await s.until(()=>s.playing);s.time+=10;await s.tick(10000);
 s.document.getElementById('TNContentView').pause();await s.tick();const visits=s.progressVisits;await s.tick(600000);await s.run(10);
 assert.equal(s.progressVisits,visits);assert.equal(s.playing,false);assert.match(s.metric('lms-read'),/lịch đọc lại chờ Play/);
 s.playing=true;await s.run(20);assert.equal(s.progressVisits,visits);
});
test('Stop cancels a scheduled fallback read and never converts estimated time into completion',async()=>{
 const s=setup([item(reading,{minimum:1}),video()],automatic);await s.until(()=>viewing(s));await s.tick(10000);s.root.getElementById('stop').click();const visits=s.progressVisits;
 await s.tick(600000);await s.run(20);assert.equal(s.progressVisits,visits);assert.equal(s.plays.length,0);assert.equal(s.items[0].minutes,0);assert.match(s.phase(),/Đã dừng/);
});
test('a live changing reader completes only when the native report confirms it',async()=>{
 const s=setup([item(reading,{minimum:1}),video()],{...automatic,credit:true});await s.until(()=>viewing(s));const body=s.document.getElementById('TNContentView');
 for(let i=0;i<200&&!s.playing;i++){body.textContent='Nội dung học tập và bộ đếm: '+i;await s.tick();}
 assert.equal(s.playing,true);assert.equal(s.items[0].status,'Đã hoàn thành');assert.match(s.metric('required-summary'),/1 \/ 2/);assert.equal(s.answers,0);
});
test('a changed viewer heading cannot be masked by a stable reading-clock marker',async()=>{
 const s=setup([item(reading,{minimum:10}),video()],automatic);await s.until(()=>viewing(s));await s.run(4);const before=s.metric('watched');
 s.document.getElementById('title').textContent='Một bài khác';await s.tick();await s.run(3);assert.equal(s.metric('watched'),before);assert.equal(s.items[0].minutes,0);
});
test('programmatic input focus is not treated as editing',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),video()],automatic);await s.until(()=>viewing(s));const input=s.document.getElementById('survey-answer');
 const event=new s.window.Event('focusin',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});input.dispatchEvent(event);
 s.update(0,0.05,'Đã hoàn thành');await s.until(()=>s.playing);assert.equal(s.answers,0);assert.deepEqual(s.opened,[0,1]);
});
test('actual change events still protect an inline survey draft',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),video()],automatic);await s.until(()=>viewing(s));const input=s.document.getElementById('survey-answer');input.value='Bản nháp';
 const event=new s.window.Event('change',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});input.dispatchEvent(event);const visits=s.progressVisits;
 await s.tick(600000);await s.run(10);assert.equal(input.value,'Bản nháp');assert.equal(s.progressVisits,visits);assert.equal(s.answers,0);assert.match(s.phase(),/Chờ bạn thực hiện/);
});
test('explicit Hold protects a foreign frame without reading its content even after a long gap',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),video()],{...automatic,surveyIframe:true});await s.until(()=>viewing(s));const frame=s.document.getElementById('TNContentView');
 Object.defineProperty(frame,'contentDocument',{get:()=>{throw new Error('Foreign frame access');}});s.root.getElementById('hold-form').click();const visits=s.progressVisits;
 await s.tick(600000);await s.run(10);assert.equal(s.progressVisits,visits);assert.match(s.phase(),/Chờ bạn thực hiện/);assert.equal(s.answers,0);
});
test('an already-selected generic native video is recognized safely',async()=>{
 const s=setup([video(generic)],{...automatic,initial:0});await s.until(()=>s.playing);assert.deepEqual(s.plays,[0]);assert.match(s.metric('watch-label'),/Phát/);
});
test('a misleading interactive title can still describe a verified native video',async()=>{
 const s=setup([video('Hoạt động thảo luận: Hướng dẫn')],automatic);await s.until(()=>s.playing);assert.deepEqual(s.plays,[0]);assert.equal(s.answers,0);
});
test('generic video kind and native position survive an automatic reread without reloading',async()=>{
 const s=setup([video(generic,0.05)],automatic);await s.until(()=>s.playing);const body=s.document.getElementById('TNContentView');await s.until(()=>s.progressVisits===2);
 await s.until(()=>s.playing);assert.equal(s.document.getElementById('TNContentView'),body);assert.deepEqual(s.opened,[0]);assert.match(s.metric('watch-label'),/Phát/);
 assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('a generic title cannot promote an old video while the new content body is still loading',async()=>{
 const s=setup([video('Video: Bài cũ'),video(generic)],{...automatic,initial:0,delayBody:true});s.update(0,10,'Đã hoàn thành');
 await s.until(()=>s.opened.length===1);await s.run(10);assert.deepEqual(s.plays,[]);assert.equal(s.pendingBodies.length,1);
 s.pendingBodies.shift()();await s.until(()=>s.playing);assert.deepEqual(s.plays,[1]);
});
test('generic video requires the viewer heading as well as the selected menu entry',async()=>{
 const s=setup([video(generic),video('Video 2: Tiếp theo')],{...automatic,onLoad:(s,body,i)=>{if(i===0)s.document.getElementById('title').textContent='Tiêu đề cũ';}});
 await s.until(()=>s.opened.length===1);await s.run(10);assert.equal(s.plays.length,0);await s.tick(61000);await s.until(()=>s.playing);
 assert.deepEqual(s.plays,[1]);assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('ambiguous generic titles are never promoted by guessing a native player',async()=>{
 const s=setup([video(generic),video(generic),video('Video 3: Rõ ràng')],automatic);await s.until(()=>s.playing);
 assert.deepEqual(s.plays,[2]);assert.deepEqual(s.opened,[2]);assert.match(s.metric('pending-list'),/Trùng cả tên/);
});
test('transient player removal during await-play gets a grace period and does not play another item',async()=>{
 const s=setup([video(),video('Video 2: Tiếp theo')],{continuous:true,muteRecovery:false,play:blocked});await s.until(()=>s.phase().includes('Chờ bạn bấm Play'));
 const body=s.document.getElementById('TNContentView');body.remove();await s.tick(500);await s.tick(1000);s.document.getElementById('payload').append(body);await s.tick();
 assert.match(s.phase(),/Chờ bạn bấm Play/);assert.deepEqual(s.plays,[0]);assert.equal(s.root.getElementById('pending').hidden,true);
});
test('permanent missing await-play video is deferred and the next allowed source starts',async()=>{
 const s=setup([video(),video('Video 2: Cho phép')],{continuous:true,muteRecovery:false,play:(s,b,i)=>{if(i===0)return blocked();s.playing=true;return Promise.resolve();}});
 await s.until(()=>s.phase().includes('Chờ bạn bấm Play'));s.document.getElementById('TNContentView').remove();await s.until(()=>s.plays.includes(1));
 assert.match(s.metric('pending-list'),/Trình phát đã biến mất/);assert.equal(s.items[0].minutes,0);assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('away time does not expire the await-play missing-player grace period',async()=>{
 const s=setup([video()],{continuous:true,muteRecovery:false,play:blocked});await s.until(()=>s.phase().includes('Chờ bạn bấm Play'));
 const body=s.document.getElementById('TNContentView');body.remove();await s.tick();s.visible=false;s.document.dispatchEvent(new s.window.Event('visibilitychange'));await s.tick(600000);
 s.visible=true;s.document.dispatchEvent(new s.window.Event('visibilitychange'));s.document.getElementById('payload').append(body);await s.tick();assert.match(s.phase(),/Chờ bạn bấm Play/);
 assert.equal(s.root.getElementById('pending').hidden,true);
});

const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','controller.js'),'utf8'),context);const Clock=vm.runInContext('VnuWatchClock',context);
test('reading clock tolerates mutable text only when the verified lesson identity stays fixed',()=>{
 const c=new Clock(),element={};c.page('one',{element,marker:'text 1',clockMarker:'lesson',ready:true},0,true);
 c.page('one',{element,marker:'text 2',clockMarker:'lesson',ready:true},1000,true);assert.equal(c.record('one').seconds,1);
});
test('reading clock resets its sample when the source identity changes on a reused element',()=>{
 const c=new Clock(),element={};c.page('one',{element,marker:'a.pdf',clockMarker:'a.pdf',ready:true},0,true);
 c.page('one',{element,marker:'b.pdf',clockMarker:'b.pdf',ready:true},1000,true);assert.equal(c.record('one').seconds,0);
});
test('reading clock never counts an unready body, an inactive window or a long gap',()=>{
 const c=new Clock(),element={},p={element,marker:'text',clockMarker:'lesson',ready:true};c.page('one',p,0,true);c.page('one',p,10000,true);
 c.page('one',p,11000,false);c.page('one',{...p,ready:false},12000,true);assert.equal(c.record('one').seconds,0);
});
