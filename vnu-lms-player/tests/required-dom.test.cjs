// Strict mode regression tests; continuous mode has its own suite.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,item,notice,channel,reading,numbered,survey}=require('./required-fixture.cjs');
test('screenshot order chooses required notice before videos and omits optional rows',async()=>{
 const s=setup([item('DANH SÁCH SINH VIÊN',{required:false,status:'Đã hoàn thành',minimum:null}),item(notice,{minutes:0.3}),item(channel),item('Bài đọc: Thông tin giảng viên',{required:false,minimum:null}),item(numbered,{type:'video',minimum:10})]);
 await s.until(()=>s.phase().includes('Hiển thị nội dung'));assert.deepEqual(s.opened,[1]);assert.equal(s.plays.length,0);
 assert.equal(s.metric('required'),'2:00');assert.equal(s.metric('recorded'),'0:18');assert.equal(s.metric('remaining'),'1:42');
 assert.match(s.metric('required-summary'),/0 \/ 3/);assert.equal(s.metric('watch-label'),'Hiển thị tại máy · phiên này');
});
test('CSS pseudo-star marker without literal asterisk selects every required content kind',async()=>{
 const s=setup([item(notice),item(reading),item(numbered,{type:'video'}),item(survey,{type:'survey'})]);
 const r=s.report();assert.equal(r.requiredItems.length,4);assert.deepEqual(Array.from(r.requiredItems,it=>it.kind),['page','page','video','interactive']);
 assert.ok(r.requiredItems.every(it=>!it.title.endsWith('*')));
});
test('required notice is selected ahead of a later unnumbered legacy Video title',async()=>{
 const s=setup([item(notice),item('Video: Hình thức nhà nước',{type:'video'})]);
 await s.until(()=>s.opened.length>0);assert.deepEqual(s.opened,[0]);assert.equal(s.plays.length,0);
 await s.until(()=>s.phase().includes('Hiển thị nội dung'));
});
test('numbered Video 1 then Video 2 are found and opened instead of a later unnumbered video',async()=>{
 const second='Video 2: Nhà nước pháp quyền';
 const s=setup([item(numbered,{type:'video'}),item(second,{type:'video'}),item('Video: Hình thức nhà nước',{type:'video'})]);
 await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[0]);
 s.update(0,2,'Đã hoàn thành');s.refresh();await s.until(()=>s.plays.length===2);
 assert.deepEqual(s.opened,[0,1]);assert.equal(s.next,0);
});
test('required reading and channel complete by real LMS report before numbered video is selected',async()=>{
 const s=setup([item(reading,{minimum:0.05}),item(channel,{minimum:0.05}),item(numbered,{type:'video',minimum:10})],{credit:true});
 await s.until(()=>s.plays.length===1,100);assert.deepEqual(s.opened,[0,1,2]);
 assert.equal(s.items[0].status,'Đã hoàn thành');assert.equal(s.items[1].status,'Đã hoàn thành');assert.match(s.metric('required-summary'),/2 \/ 3/);
});
test('page local display clock advances but never increments LMS minutes on its own',async()=>{
 const s=setup([item(reading)]);await s.until(()=>s.phase().includes('Hiển thị nội dung'));await s.run(16);
 assert.equal(s.metric('watched'),'0:08');assert.equal(s.metric('recorded'),'0:00');assert.equal(s.metric('remaining'),'2:00');assert.equal(s.metric('estimated'),'1:52');
 assert.equal(s.items[0].status,'Chưa hoàn thành');assert.equal(s.progressVisits,1);
});
test('foreground loss is excluded and an eligible long gap triggers a real progress read without credit',async()=>{
 const s=setup([item(reading)]);await s.until(()=>s.phase().includes('Hiển thị nội dung'));await s.run(10);
 const before=s.metric('watched');s.front=false;await s.tick(120000);assert.equal(s.metric('watched'),before);
 assert.equal(s.progressVisits,1);s.front=true;await s.tick();await s.tick(120000);assert.equal(s.metric('watched'),before);
 await s.until(()=>s.progressVisits===2);assert.equal(s.items[0].minutes,0);assert.equal(s.items[0].status,'Chưa hoàn thành');
 await s.until(()=>s.phase().includes('Hiển thị nội dung'));await s.run(2);assert.equal(s.metric('watched'),'0:06');
});
test('empty reading body is not accepted just because sidebar and header have selected title',async()=>{
 const s=setup([item(reading)],{emptyBody:true});await s.run(20);assert.equal(s.metric('watched'),'0:00');
 await s.tick(61000);assert.match(s.message(),/Chưa xác nhận được đúng nội dung/);assert.equal(s.opened.length,1);
});
test('new selected label with old reading body waits for the actual content swap',async()=>{
 const s=setup([item('Tài liệu cũ',{required:false,minimum:null}),item(reading)],{initial:0,delayBody:true});
 await s.run(20);assert.deepEqual(s.opened,[1]);assert.equal(s.metric('watched'),'0:00');assert.match(s.phase(),/Tải đúng nội dung/);
 s.pendingBodies.shift()();await s.until(()=>s.phase().includes('Hiển thị nội dung'));await s.run(4);assert.equal(s.metric('watched'),'0:02');
});
test('local display reaching minimum cannot complete or skip an unconfirmed reading',async()=>{
 const s=setup([item(reading,{minimum:0.05}),item(numbered,{type:'video'})]);
 await s.until(()=>s.phase().includes('Hiển thị nội dung'));await s.run(8);await s.until(()=>s.progressVisits===2);
 await s.until(()=>s.phase().includes('Hiển thị nội dung'));const visits=s.progressVisits;await s.run(12);
 assert.deepEqual(s.opened,[0]);assert.equal(s.items[0].status,'Chưa hoàn thành');assert.equal(s.progressVisits,visits);
 assert.match(s.metric('lms-read'),/vẫn chờ trạng thái LMS/);assert.equal(s.plays.length,0);
});
test('literal red star in table matches native sidebar marker without putting star into title',async()=>{
 const s=setup([item(reading)],{literalStar:true});await s.until(()=>s.phase().includes('Hiển thị nội dung'));
 assert.equal(s.metric('lesson'),reading);assert.deepEqual(s.opened,[0]);
});
test('three unchanged LMS rereads after sufficient page display hand off rather than loop forever',async()=>{
 const s=setup([item(reading,{minimum:0.05}),item(numbered,{type:'video'})]);
 await s.until(()=>s.phase().includes('Hiển thị nội dung'));await s.run(160);
 assert.match(s.phase(),/Chờ bạn thực hiện/);assert.match(s.message(),/sau 3 lần đọc lại/);
 const visits=s.progressVisits;await s.run(140);assert.equal(s.progressVisits,visits);assert.deepEqual(s.opened,[0]);
 assert.equal(s.metric('recorded'),'0:00');assert.equal(s.items[0].status,'Chưa hoàn thành');
 s.update(0,0.01);s.refresh();await s.until(()=>s.phase().includes('Hiển thị nội dung'));
 s.update(0,0.05,'Đã hoàn thành');s.refresh();await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[0,1]);
});
test('optional videos and reading pages are skipped even when unfinished',async()=>{
 const s=setup([item('Video 1: Tuỳ chọn',{type:'video',required:false}),item('Bài đọc: Tuỳ chọn',{required:false}),item(reading)]);
 await s.until(()=>s.phase().includes('Hiển thị nội dung'));assert.deepEqual(s.opened,[2]);assert.equal(s.plays.length,0);
});
test('survey remains open without answering or switching tabs during user input',async()=>{
 const s=setup([item(survey,{type:'survey'}),item(numbered,{type:'video'})],{surveyNoViewer:true});
 await s.until(()=>s.phase().includes('Chờ bạn thực hiện'));s.document.getElementById('survey-answer').value='Câu trả lời của tôi';
 await s.run(650);assert.deepEqual(s.opened,[0]);assert.equal(s.progressVisits,1);assert.equal(s.answers,0);
 assert.equal(s.document.getElementById('survey-answer').value,'Câu trả lời của tôi');assert.equal(s.root.getElementById('refresh').disabled,false);
 assert.match(s.message(),/bấm Đọc lại LMS/);
 s.update(0,2,'Đã hoàn thành');s.refresh();await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[0,1]);
});
test('required content without readable time condition opens then waits for explicit action',async()=>{
 const s=setup([item('Xác nhận đã đọc hướng dẫn',{minimum:null}),item(numbered,{type:'video'})]);
 await s.until(()=>s.phase().includes('Chờ bạn thực hiện'));await s.run(150);
 assert.equal(s.metric('required'),'--:--');assert.equal(s.metric('remaining'),'--:--');assert.deepEqual(s.opened,[0]);assert.equal(s.progressVisits,1);
});
test('explicit reread of an incomplete survey avoids reloading the retained user form',async()=>{
 const s=setup([item(survey,{type:'survey'}),item(numbered,{type:'video'})],{surveyNoViewer:true});
 await s.until(()=>s.phase().includes('Chờ bạn thực hiện'));const input=s.document.getElementById('survey-answer');input.value='Bản nháp';
 s.refresh();await s.until(()=>s.progressVisits===2);await s.until(()=>s.phase().includes('Chờ bạn thực hiện'));
 assert.deepEqual(s.opened,[0]);assert.equal(s.document.getElementById('survey-answer'),input);assert.equal(input.value,'Bản nháp');assert.equal(s.answers,0);
});
test('required PDF iframe is treated as visible content with LMS-confirmed completion',async()=>{
 const s=setup([item('Bài giảng (PDF): Tài liệu bắt buộc',{type:'pdf',minimum:0.05}),item(numbered,{type:'video'})],{credit:true});
 await s.until(()=>s.plays.length===1,100);assert.deepEqual(s.opened,[0,1]);assert.equal(s.items[0].status,'Đã hoàn thành');
});
test('no detected required marker stops with a diagnostic rather than declaring completion',async()=>{
 const s=setup([item(numbered,{type:'video',required:false})]);await s.run(15);
 assert.deepEqual(s.opened,[]);assert.equal(s.plays.length,0);assert.match(s.message(),/Chưa nhận diện được mục sao đỏ/);
});
test('all mandatory items reported complete stops despite optional unfinished content',async()=>{
 const s=setup([item(reading,{status:'Đã hoàn thành',minutes:2}),item(numbered,{type:'video',status:'Đã hoàn thành',minutes:2}),item('Bài đọc khác',{required:false})]);
 await s.run(15);assert.deepEqual(s.opened,[]);assert.match(s.message(),/tất cả mục có sao đỏ/);assert.match(s.metric('required-summary'),/2 \/ 2/);
});
test('unknown earliest mandatory status blocks later playable video',async()=>{
 const s=setup([item(reading,{status:'Bị khóa'}),item(numbered,{type:'video'})]);await s.run(15);
 assert.deepEqual(s.opened,[]);assert.equal(s.plays.length,0);assert.match(s.message(),/Chưa xác định được trạng thái/);
});
test('a missing mandatory menu link cannot fall through to another video',async()=>{
 const s=setup([item(reading),item(numbered,{type:'video'})]);s.document.querySelector('[data-item="0"]').remove();await s.run(50);
 assert.deepEqual(s.opened,[]);assert.equal(s.plays.length,0);assert.match(s.message(),/Chưa tìm thấy liên kết/);
});
test('course change clears required page target and its local display clock',async()=>{
 const s=setup([item(reading)]);await s.until(()=>s.phase().includes('Hiển thị nội dung'));await s.run(8);
 s.root.getElementById('auto-start').checked=false;s.root.getElementById('auto-start').dispatchEvent(new s.window.Event('change'));
 s.path='/learn/lop-hoc/chi-tiet/11111111-1111-1111-1111-111111111111';await s.tick();
 assert.equal(s.metric('watched'),'0:00');assert.equal(s.metric('required'),'--:--');assert.equal(s.metric('lesson'),'Chưa chọn nội dung');
});
test('native green header identifies retained numbered video when sidebar has no selected class',async()=>{
 const s=setup([item(numbered,{type:'video'})],{noSelected:true});await s.until(()=>s.plays.length===1);
 s.time=37;s.update(0,1);s.refresh();await s.until(()=>s.plays.length===2);
 assert.deepEqual(s.opened,[0]);assert.equal(s.time,37);assert.equal(s.metric('recorded'),'1:00');
});
test('nested course span in native heading permits full reading flow and local clock',async()=>{
 const s=setup([item(reading)],{nestedCourseTitle:true});await s.until(()=>s.phase().includes('Hiển thị nội dung'));
 await s.run(8);assert.deepEqual(s.opened,[0]);assert.equal(s.metric('watched'),'0:04');assert.equal(s.metric('recorded'),'0:00');
});
test('nested course heading retains numbered native video position across a reread without selected class',async()=>{
 const s=setup([item(numbered,{type:'video'})],{nestedCourseTitle:true,noSelected:true});await s.until(()=>s.plays.length===1);
 s.time=37;s.update(0,1);s.refresh();await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[0]);assert.equal(s.time,37);assert.equal(s.metric('recorded'),'1:00');
});
