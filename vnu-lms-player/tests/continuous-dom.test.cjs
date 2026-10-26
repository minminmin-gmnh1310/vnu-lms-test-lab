// Complete extension, continuous mode. LMS server credit is supplied by an
// independent fixture; no test result proves a real VNU account received credit.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,item,notice,channel,reading,numbered,survey}=require('./required-fixture.cjs');
const automatic={continuous:true,muteRecovery:true};
const vid=(title=numbered,minimum=0.05)=>item(title,{type:'video',minimum});
const active=s=>s.phase().includes('Hiển thị nội dung');
const stopped=s=>s.phase().includes('Đã dừng');
const grantOnly=(indices)=>s=>{for(const i of indices){const it=s.items[i],minutes=it.initialMinutes+s.serverSeconds[i]/60;s.update(i,Number(minutes.toFixed(3)),minutes>=it.minimum?'Đã hoàn thành':'Chưa hoàn thành');}};
test('production defaults enable continuous running and muted autoplay recovery',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],{productionDefaults:true,credit:true,creditSurvey:true});
 assert.equal(s.root.getElementById('continuous').checked,true);assert.equal(s.root.getElementById('mute-recovery').checked,true);
 await s.until(()=>s.plays.length===1,160);assert.deepEqual(s.opened,[0,1]);assert.equal(s.answers,0);
});
test('timed survey automatically rereads real report and advances without answering or submitting',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],{...automatic,credit:true,creditSurvey:true});
 await s.until(()=>s.plays.length===1,160);assert.deepEqual(s.opened,[0,1]);assert.equal(s.items[0].status,'Đã hoàn thành');assert.equal(s.answers,0);
 assert.equal(s.root.getElementById('pending').hidden,true);
});
test('two-minute screenshot survey updates its stale LMS value then reaches the next video',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:2}),vid()],{...automatic,credit:true,creditSurvey:true});
 await s.until(()=>active(s));assert.equal(s.metric('required'),'2:00');assert.equal(s.metric('recorded'),'0:00');
 await s.until(()=>s.items[0].minutes>=1&&s.items[0].minutes<2,160);assert.notEqual(s.metric('recorded'),'0:00');assert.equal(s.items[0].status,'Chưa hoàn thành');
 await s.until(()=>s.plays.length===1,180);assert.deepEqual(s.opened,[0,1]);assert.equal(s.answers,0);assert.ok(s.progressVisits>=3);
});
test('uncredited survey is recorded as pending and later automatic video still starts',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],automatic);
 await s.until(()=>s.plays.length===1,220);assert.deepEqual(s.opened,[0,1]);assert.equal(s.items[0].status,'Chưa hoàn thành');assert.equal(s.items[0].minutes,0);
 assert.match(s.metric('pending-summary'),/1/);assert.match(s.metric('pending-list'),/LMS chưa ghi tăng/);assert.equal(s.answers,0);
});
test('unchanged reading gets one later retry then finishes with an honest pending list',async()=>{
 const s=setup([item(reading,{minimum:0.05}),vid()],{...automatic,onProgress:grantOnly([1])});
 await s.until(()=>stopped(s),650);assert.deepEqual(s.opened,[0,1,0]);assert.match(s.message(),/Còn 1 mục chưa được LMS xác nhận/);
 assert.match(s.metric('pending-list'),/Cần xử lý/);assert.equal(s.items[0].status,'Chưa hoàn thành');assert.equal(s.items[1].status,'Đã hoàn thành');assert.match(s.metric('required-summary'),/1 \/ 2/);
 const visits=s.progressVisits;await s.run(500);assert.equal(s.progressVisits,visits);assert.equal(s.root.getElementById('pending').open,true);
});
test('delayed LMS completion clears a deferred item on the next real reread',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid(numbered,10)],automatic);
 await s.until(()=>s.plays.length===1,220);s.update(0,0.05,'Đã hoàn thành');s.refresh();
 await s.until(()=>s.plays.length===2);assert.equal(s.root.getElementById('pending').hidden,true);assert.match(s.metric('required-summary'),/1 \/ 2/);assert.deepEqual(s.opened,[0,1]);
});
test('sufficient LMS minutes with incomplete status cannot loop forever as its minutes keep increasing',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],{...automatic,onProgress:s=>{
  s.update(0,Number((s.serverSeconds[0]/60).toFixed(3)),'Chưa hoàn thành');grantOnly([1])(s);
 }});
 await s.until(()=>stopped(s),400);assert.deepEqual(s.opened,[0,1]);assert.match(s.metric('pending-list'),/đã ghi đủ phút/);assert.equal(s.answers,0);assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('required page without a readable time threshold is opened then deferred',async()=>{
 const s=setup([item('Xác nhận đã đọc hướng dẫn',{minimum:null}),vid()],automatic);
 await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[0,1]);assert.match(s.metric('pending-list'),/chưa đọc được ngưỡng phút/);assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('required video without a readable threshold is deferred before automatic playback',async()=>{
 const s=setup([vid('Video 1: Chưa rõ điều kiện',null),vid('Video 2: Điều kiện rõ')],automatic);
 await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[0,1]);assert.deepEqual(s.plays,[1]);assert.match(s.metric('pending-list'),/chưa đọc được ngưỡng phút/);
});
test('unknown earliest required status does not prevent later usable content',async()=>{
 const s=setup([item(reading,{status:'Bị khóa'}),vid()],automatic);await s.until(()=>s.plays.length===1);
 assert.deepEqual(s.opened,[1]);assert.match(s.metric('pending-list'),/Trạng thái LMS chưa xác định/);assert.equal(s.items[0].status,'Bị khóa');
});
test('a formerly unknown row becomes eligible when LMS unlocks its actual status',async()=>{
 const s=setup([item(reading,{status:'Bị khóa',minimum:0.05}),vid(numbered,10)],automatic);await s.until(()=>s.plays.length===1);
 s.update(0,0,'Chưa hoàn thành');s.refresh();await s.until(()=>s.index===0&&active(s));assert.deepEqual(s.opened,[1,0]);assert.equal(s.root.getElementById('pending').hidden,true);
});
test('same-section duplicate required titles are retained rather than clicked arbitrarily',async()=>{
 const s=setup([item(reading),item(reading),vid()],automatic);await s.until(()=>s.plays.length===1);
 assert.deepEqual(s.opened,[2]);assert.match(s.metric('pending-summary'),/2/);assert.match(s.metric('pending-list'),/Trùng cả tên/);
});
test('missing first link allows later content and recovers once the link appears for retry',async()=>{
 const s=setup([item(reading,{minimum:0.05}),vid()],{...automatic,credit:true});
 const wrapper=s.document.querySelector('[data-item="0"]').parentElement;wrapper.remove();await s.until(()=>s.plays.length===1,120);
 assert.deepEqual(s.opened,[1]);s.document.getElementById('tnContentList').prepend(wrapper);await s.until(()=>stopped(s),200);
 assert.deepEqual(s.opened,[1,0]);assert.equal(s.root.getElementById('pending').hidden,true);assert.match(s.message(),/tất cả mục có sao đỏ/);assert.match(s.metric('required-summary'),/2 \/ 2/);
});
test('locked first menu entry is retried after later content makes it available',async()=>{
 const s=setup([item(reading,{minimum:0.05}),vid()],{...automatic,credit:true});const first=s.document.querySelector('[data-item="0"]').parentElement;first.setAttribute('aria-disabled','true');
 await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[1]);first.removeAttribute('aria-disabled');await s.until(()=>stopped(s),220);
 assert.deepEqual(s.opened,[1,0]);assert.match(s.metric('required-summary'),/2 \/ 2/);
});
test('empty reader body times out without local credit then continues a later video',async()=>{
 const s=setup([item(reading),vid()],{...automatic,emptyBody:true});await s.until(()=>s.phase().includes('Tải đúng nội dung'));assert.equal(s.metric('watched'),'0:00');
 await s.tick(61000);await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[0,1]);assert.match(s.metric('pending-list'),/Chưa xác nhận được đúng nội dung/);assert.equal(s.items[0].minutes,0);
});
test('a video media error does not prevent the next playable required video',async()=>{
 const s=setup([vid('Video 1: Lỗi media'),vid('Video 2: Phát được')],{...automatic,mediaErrors:{0:{code:4}}});await s.until(()=>s.plays.length===1);
 assert.deepEqual(s.opened,[0,1]);assert.deepEqual(s.plays,[1]);assert.match(s.metric('pending-list'),/Video bị lỗi tải/);
});
test('mismatched loaded video resource receives no play or credit before timeout and deferral',async()=>{
 const s=setup([vid('Video 1: Nguồn chưa tải'),vid('Video 2: Nguồn đã tải')],{...automatic,onLoad:(s,body,i)=>{if(i===0)body.currentSrc='https://example.test/stale.mp4';}});
 await s.until(()=>s.phase().includes('Phát video'));assert.equal(s.plays.length,0);assert.equal(s.metric('watched'),'0:00');
 await s.tick(121000);await s.tick();await s.until(()=>s.plays.length===1);assert.deepEqual(s.plays,[1]);assert.equal(s.items[0].minutes,0);
});
test('stalled first video is deferred and the next source starts',async()=>{
 const s=setup([vid('Video 1: Đứng hình'),vid('Video 2: Bình thường')],{...automatic,onLoad:(s,body,i)=>{s.freeze=i===0;}});await s.until(()=>s.plays.length===1);
 await s.run(4);assert.equal(s.metric('watched'),'0:00');await s.tick(91000);await s.tick();await s.until(()=>s.plays.length===2);assert.deepEqual(s.plays,[0,1]);assert.match(s.metric('pending-list'),/Video đứng trong 90 giây/);
});
test('Stop during retry delay cancels retries and preserves the pending report',async()=>{
 const s=setup([item(reading)],automatic);s.document.querySelector('[data-item="0"]').remove();await s.until(()=>s.phase().includes('Chờ thử lại'),100);
 s.root.getElementById('stop').click();const visits=s.progressVisits;await s.tick(60000);await s.run(20);assert.equal(s.progressVisits,visits);assert.equal(s.opened.length,0);assert.match(s.metric('pending-summary'),/1/);
});
test('retry backoff waits for actual foreground time after a long absence',async()=>{
 const s=setup([item(reading)],automatic);s.document.querySelector('[data-item="0"]').remove();await s.until(()=>s.phase().includes('Chờ thử lại'),100);
 const visits=s.progressVisits;s.front=false;await s.tick();await s.tick(600000);s.front=true;await s.tick();await s.run(26);assert.equal(s.progressVisits,visits);assert.match(s.phase(),/Chờ thử lại/);
 await s.run(7);assert.doesNotMatch(s.phase(),/Chờ thử lại/);assert.equal(s.opened.length,0);await s.until(()=>stopped(s));assert.match(s.metric('pending-list'),/Cần xử lý/);
});
test('trusted input protects a survey draft from automatic progress switches',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],automatic);await s.until(()=>active(s));const input=s.document.getElementById('survey-answer');input.value='Bản nháp riêng';
 const event=new s.window.Event('input',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});input.dispatchEvent(event);
 const visits=s.progressVisits;await s.run(650);assert.match(s.phase(),/Chờ bạn thực hiện/);assert.equal(s.progressVisits,visits);assert.equal(input.value,'Bản nháp riêng');assert.equal(s.answers,0);
 s.update(0,0.05,'Đã hoàn thành');s.refresh();await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[0,1]);
});
test('iframe autofocus alone does not hold the queue or inspect its foreign document',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],{...automatic,surveyIframe:true});await s.until(()=>active(s));const frame=s.document.getElementById('TNContentView');
 Object.defineProperty(frame,'contentDocument',{get:()=>{throw new Error('foreign iframe access forbidden');}});let focusedElement=frame;Object.defineProperty(s.document,'activeElement',{get:()=>focusedElement});
 await s.tick();const visits=s.progressVisits;s.update(0,0.05,'Đã hoàn thành');await s.until(()=>s.plays.length===1);
 assert.ok(s.progressVisits>visits);assert.equal(s.answers,0);assert.equal(focusedElement,frame);
});
test('explicit Hold form keeps an untouched interactive viewer available to answer',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],automatic);await s.until(()=>active(s));assert.equal(s.root.getElementById('hold-form').hidden,false);
 s.root.getElementById('hold-form').click();const visits=s.progressVisits;await s.run(150);assert.equal(s.progressVisits,visits);assert.match(s.message(),/bảo vệ câu trả lời/);assert.equal(s.answers,0);
});
test('continuous and mute recovery preferences persist and load their actual values',async()=>{
 const stored={vnuLmsAutoStart:false,vnuLmsContinuous:false,vnuLmsMuteRecovery:false};const chrome={runtime:{},storage:{local:{get:(defaults,cb)=>cb({...defaults,...stored}),set:(values,cb)=>{Object.assign(stored,values);cb();}}}};
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],{productionDefaults:true,chrome,credit:true,creditSurvey:true});
 assert.equal(s.root.getElementById('continuous').checked,false);assert.equal(s.root.getElementById('mute-recovery').checked,false);assert.equal(s.opened.length,0);
 for(const id of ['continuous','mute-recovery','auto-start']){const input=s.root.getElementById(id);input.checked=true;input.dispatchEvent(new s.window.Event('change'));}
 assert.deepEqual(stored,{vnuLmsAutoStart:true,vnuLmsContinuous:true,vnuLmsMuteRecovery:true});await s.until(()=>s.plays.length===1,160);
});
test('enabling continuous mode resumes a timed interactive item that was manually waiting',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],{credit:true,creditSurvey:true});await s.until(()=>s.phase().includes('Chờ bạn thực hiện'));
 const input=s.root.getElementById('continuous');input.checked=true;input.dispatchEvent(new s.window.Event('change'));await s.until(()=>s.plays.length===1,160);assert.equal(s.answers,0);
});
test('mode changes cannot release a form that the user explicitly protected',async()=>{
 const s=setup([item(survey,{type:'survey',minimum:0.05}),vid()],automatic);await s.until(()=>active(s));s.root.getElementById('hold-form').click();
 const input=s.root.getElementById('continuous');input.checked=false;input.dispatchEvent(new s.window.Event('change'));input.checked=true;input.dispatchEvent(new s.window.Event('change'));
 const visits=s.progressVisits;await s.run(150);assert.equal(s.progressVisits,visits);assert.match(s.phase(),/Chờ bạn thực hiện/);
});
test('autoplay rejection retries the verified video once with audio muted',async()=>{
 const s=setup([vid(),vid('Video 2: Kế tiếp')],{...automatic,credit:true,play:(s,body,i)=>{
  if(i===0&&!body.muted)return Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));s.playing=true;return Promise.resolve();
 }});
 await s.until(()=>s.playing);assert.deepEqual(s.plays,[0,0]);assert.equal(s.document.getElementById('TNContentView').muted,true);assert.match(s.metric('position'),/Âm thanh tắt/);
 await s.until(()=>stopped(s),160);assert.deepEqual(s.plays,[0,0,1]);assert.match(s.metric('required-summary'),/2 \/ 2/);
});
test('muted autoplay rejection records a pending video then starts a later allowed one',async()=>{
 const s=setup([vid('Video 1: Chặn cả muted'),vid('Video 2: Cho phép')],{...automatic,play:(s,body,i)=>{
  if(i===0)return Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));s.playing=true;return Promise.resolve();
 }});
 await s.until(()=>s.playing);assert.deepEqual(s.plays,[0,0,1]);assert.match(s.metric('pending-list'),/Edge vẫn chặn tự phát/);assert.equal(s.items[0].minutes,0);assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('disabling muted recovery retains direct user Play as an actionable choice',async()=>{
 const s=setup([vid()],{continuous:true,muteRecovery:false,play:(s,body)=>{
  if(!s.gesture)return Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));s.playing=true;return Promise.resolve();
 }});await s.until(()=>s.phase().includes('Chờ bạn bấm Play'));assert.equal(s.plays.length,1);
 s.gesture=true;s.root.getElementById('start').click();await s.tick();assert.equal(s.playing,true);assert.equal(s.plays.length,2);
});
test('course change clears deferred identities and stops carrying the old pending list',async()=>{
 const s=setup([item(reading)],automatic);s.document.querySelector('[data-item="0"]').remove();await s.until(()=>s.phase().includes('Chờ thử lại'),100);s.root.getElementById('auto-start').checked=false;
 s.path='/learn/lop-hoc/chi-tiet/11111111-1111-1111-1111-111111111111';await s.tick();assert.equal(s.root.getElementById('pending').hidden,true);assert.equal(s.metric('watched'),'0:00');
});
test('mixed red-star sequence runs to LMS-confirmed end without Next guesses or form submission',async()=>{
 const s=setup([item(notice,{minimum:0.05}),item(channel,{minimum:0.05}),item(reading,{minimum:0.05}),item(survey,{type:'survey',minimum:0.05}),vid(),item('Tài liệu PDF bắt buộc',{type:'pdf',minimum:0.05}),item('Hoạt động 1: Thảo luận nhóm',{type:'survey',minimum:0.05}),vid('Video 2: Kết thúc')],{...automatic,credit:true,creditSurvey:true});
 await s.until(()=>stopped(s),300);assert.deepEqual(s.opened,[0,1,2,3,4,5,6,7]);assert.deepEqual(s.plays,[4,7]);assert.equal(s.answers,0);assert.equal(s.next,0);assert.match(s.metric('required-summary'),/8 \/ 8/);assert.equal(s.root.getElementById('pending').hidden,true);
});
