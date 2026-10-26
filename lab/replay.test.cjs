const {test}=require('node:test'),assert=require('node:assert/strict');
const {replay}=require('./replay.cjs');
function verified(s){
 assert.deepEqual(s.state.errors,[]);assert.equal(s.document.getElementById('fixture-error').textContent,'');
 assert.ok(s.panel.getElementById('engine').textContent.includes('Đã dừng'),s.panel.getElementById('status').textContent);
 assert.ok(s.model.report().filter(it=>it.required).every(it=>it.status==='Đã hoàn thành'));
 assert.equal(s.panel.getElementById('pending').hidden,true,s.panel.getElementById('pending-list').textContent);
 assert.equal(s.model.submissions,0);
}
test('CI fixture and full extension agree on all required rows after final audit',async()=>{
 const s=await replay();verified(s);assert.deepEqual([...s.window.__vnuLabLessonOpens],[2,3,4,5,4,6,7]);
 assert.ok(s.window.__vnuLabMenuEvents.some(e=>e.title==='1.1 Mục cũ'));
 assert.equal(s.window.__vnuLabMenuEvents.length,7);
});
test('full extension completes the CI deep-tree fixture including prerequisite return',async()=>{
 const s=await replay('deep');verified(s);
 assert.equal(s.window.__vnuLabMenuEvents.filter(e=>e.title.startsWith('Nhánh sâu')).length,12);
 assert.equal(s.window.__vnuLabMenuEvents.length,19);assert.ok(s.window.__vnuLabMenuEvents.every(e=>e.type==='expand'));
 assert.deepEqual([...s.window.__vnuLabLessonOpens],[2,3,4,5,4,6,7]);
});
test('replay of CI 1.0.4 inconsistent folder layout retains the completed-but-unmatched row',async()=>{
 let changed=false;
 const s=await replay('pipeline',{onTick:({document:d})=>{
  if(changed)return;
  const heading=[...d.querySelectorAll('.__lesson-name-child')].find(e=>e.querySelector('a')?.textContent==='1.1 Mục cũ');
  const inner=heading?.parentElement,body=inner?.querySelector('.__lesson-description');
  if(body){const wrapper=inner.parentElement;wrapper.replaceWith(...body.children);changed=true;}
 }});
 assert.equal(changed,true);assert.ok(s.model.report().filter(it=>it.required).every(it=>it.status==='Đã hoàn thành'));
 assert.equal(s.panel.getElementById('pending').hidden,false);assert.match(s.panel.getElementById('pending-list').textContent,/Video: Đã hoàn thành/);
 assert.doesNotMatch(s.panel.getElementById('status').textContent,/LMS ghi Đã hoàn thành cho tất cả/);
});
