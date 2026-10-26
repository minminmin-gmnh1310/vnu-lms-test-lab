// Deep trees and prerequisite gates are simulated. Native gate markup/text
// was checked against VNU's public Angular bundle and vi-VN.json on 2026-10-26.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom'),{setup,item}=require('./required-fixture.cjs');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(process.env.VNU_RUNTIME_DIR||path.join(__dirname,'..'),'lms.js'),'utf8'),c);
const L=vm.runInContext('VnuLms',c),dom=html=>parseHTML('<html><body>'+html+'</body></html>').document;
const visible=e=>{for(let n=e;n;n=n.parentElement)if(n.style.display==='none'||n.hasAttribute('hidden'))return false;return true};
const video=title=>item(title,{type:'video',minimum:0.05});
const done=()=>item('Bài đã xong',{minutes:1,status:'Đã hoàn thành',minimum:0.05});
const stopped=s=>s.phase().includes('Đã dừng');
function gate(document,titles){
 const box=document.createElement('div'),h=document.createElement('h4');h.textContent='Cần hoàn thành các nội dung sau để tiếp tục.';
 const wrap=document.createElement('div'),ul=document.createElement('ul');ul.className='no-padding';
 for(const title of titles){const li=document.createElement('li'),icon=document.createElement('i');icon.className='fas fa-angle-right';li.append(icon,document.createTextNode('\u00a0'+title));ul.append(li)}
 wrap.append(ul);box.append(h,wrap);return box;
}
function folder(document,title,children,calls,options={}){
 const wrapper=document.createElement('div'),inner=document.createElement('div'),head=document.createElement('div');
 wrapper.className='class-lesson-child';head.className='__lesson-name-child';
 const arrow=document.createElement('span'),icon=document.createElement('i'),label=document.createElement('a');arrow.className='arrow';icon.className='fa fa-chevron-down';arrow.append(icon);label.textContent=title;
 head.append(arrow,label);inner.append(head);wrapper.append(inner);
 if(options.disabled)head.setAttribute('aria-disabled','true');
 arrow.addEventListener('click',()=>{calls.push(title);if(options.stuck)return;icon.className='fa fa-chevron-up';const body=document.createElement('div');body.className='__lesson-description';body.append(...children());inner.append(body)});
 return wrapper;
}
function nested(document,depth,leaf,calls){
 let make=()=>[leaf];for(let i=depth;i>=1;i--){const previous=make,name='Nhánh '+i;make=()=>[folder(document,name,previous,calls)]}return make()[0];
}
function gatedSetup(titles,dependencies,options={}){
 return setup(titles.map(video),{continuous:true,credit:true,...options,onLoad:(s,body,index)=>{
  const missing=(dependencies[index]||[]).filter(i=>s.items[i].status!=='Đã hoàn thành');
  if(missing.length)body.replaceWith(gate(s.document,missing.map(i=>s.items[i].title)));
  options.onLoad?.(s,body,index);
 }});
}

for(const depth of [8,24])test('lazy tree of '+depth+' levels opens the required leaf and audits every branch',async()=>{
 const s=setup([video('Video: Lá sâu')],{continuous:true,credit:true}),d=s.document,menu=d.getElementById('tnContentList'),leaf=menu.firstElementChild,calls=[];
 menu.replaceChildren(nested(d,depth,leaf,calls));await s.until(()=>stopped(s),depth*3+180);
 assert.equal(calls.length,depth);assert.deepEqual(s.opened,[0]);assert.deepEqual(s.plays,[0]);assert.equal(s.items[0].status,'Đã hoàn thành');
 assert.equal(s.root.getElementById('pending').hidden,true);
});
test('a course with more than 256 folders can reach a later required activity',async()=>{
 const s=setup([video('Video: Sau 270 mục')]),d=s.document,menu=d.getElementById('tnContentList'),leaf=menu.firstElementChild,calls=[];menu.replaceChildren();
 for(let i=0;i<270;i++)menu.append(folder(d,'Mục '+i,()=>i===269?[leaf]:[],calls));
 await s.until(()=>s.playing,310);assert.equal(calls.length,270);assert.deepEqual(s.opened,[0]);
});
test('viewer breadcrumbs confirm the exact leaf at arbitrary depth',async()=>{
 const s=setup([video('Video: Bài con')],{onLoad:(s,body)=>{s.document.getElementById('title').textContent='Cha » Nhánh » Phần nhỏ » Video: Bài con'}});
 await s.until(()=>s.playing);assert.deepEqual(s.plays,[0]);
 assert.equal(L.viewerMatches(s.document,'Video: Một bài khác',visible),false);
});
test('native gate identifies prerequisite titles without treating its list as playable content',()=>{
 const d=dom('<div id="tnContentView"><div class="headcontent"><div class="col-md-10"><span>Bài bị chặn</span></div></div></div>');
 d.getElementById('tnContentView').append(gate(d,['Video: A','Bài đọc: B']));
 const blocked=L.blocker(d,'Bài bị chặn',visible);assert.equal(blocked.kind,'prerequisite');assert.deepEqual([...blocked.titles],['Video: A','Bài đọc: B']);
 assert.equal(L.pageSnapshot(d,'Bài bị chặn',visible),null);
});
test('a gate quotation inside a reader and a gate belonging to another lesson are ignored',()=>{
 const d=dom('<div id="tnContentView"><div class="headcontent"><div class="col-md-10"><span>Bài đang đọc</span></div></div><div id="TNContentView"></div></div>');
 d.getElementById('TNContentView').append(gate(d,['Video: A']));assert.equal(L.blocker(d,'Bài đang đọc',visible),null);assert.equal(L.blocker(d,'Bài khác',visible),null);
});
test('a reversed prerequisite chain resolves C, then A, then the original blocked B',async()=>{
 const s=gatedSetup(['Video: B','Video: A','Video: C'],{0:[1],1:[2]});
 await s.until(()=>stopped(s),350);assert.deepEqual(s.opened,[0,1,2,1,0]);assert.deepEqual(s.plays,[2,1,0]);
 assert.ok(s.items.every(it=>it.status==='Đã hoàn thành'));assert.equal(s.root.getElementById('pending').hidden,true);assert.equal(s.answers,0);
});
test('all listed prerequisites must complete before reopening the blocked activity',async()=>{
 const s=gatedSetup(['Video: B','Video: A','Video: C'],{0:[1,2]});
 await s.until(()=>stopped(s),350);assert.deepEqual(s.opened,[0,1,2,0]);assert.deepEqual(s.plays,[1,2,0]);
});
test('an optional row explicitly named by a native gate is a necessary prerequisite',async()=>{
 const s=setup([video('Video: B'),{...video('Video: A'),required:false}],{continuous:true,credit:true,onLoad:(s,body,i)=>{
  if(i===0&&s.items[1].status!=='Đã hoàn thành')body.replaceWith(gate(s.document,['Video: A']));
 }});
 await s.until(()=>stopped(s),250);assert.deepEqual(s.opened,[0,1,0]);assert.deepEqual(s.plays,[1,0]);assert.ok(s.items.every(it=>it.status==='Đã hoàn thành'));
});
test('a missing prerequisite remains pending and does not cause a false all-complete result',async()=>{
 const s=setup([video('Video: B')],{continuous:true,onLoad:(s,body)=>body.replaceWith(gate(s.document,['Video: Chưa có trong bảng']))});
 await s.until(()=>stopped(s),100);assert.deepEqual(s.opened,[0]);assert.deepEqual(s.plays,[]);assert.match(s.metric('pending-list'),/Chưa có trong bảng/);assert.doesNotMatch(s.message(),/tất cả mục có sao đỏ/);
 const visits=s.progressVisits;await s.run(300);assert.equal(s.progressVisits,visits);
});
test('a prerequisite cycle stops with both activities pending instead of looping',async()=>{
 const s=gatedSetup(['Video: A','Video: B'],{0:[1],1:[0]});await s.until(()=>stopped(s),100);
 assert.deepEqual(s.opened,[0,1]);assert.deepEqual(s.plays,[]);assert.match(s.metric('pending-summary'),/2/);assert.ok(s.items.every(it=>it.status!=='Đã hoàn thành'));
});
test('a gate still shown when its prerequisite is complete receives at most one delayed retry',async()=>{
 const s=setup([video('Video: B'),{...video('Video: A'),minutes:1,status:'Đã hoàn thành'}],{continuous:true,onLoad:(s,body,i)=>{
  if(i===0)body.replaceWith(gate(s.document,['Video: A']));
 }});
 await s.until(()=>stopped(s),180);assert.deepEqual(s.opened,[0,0]);assert.deepEqual(s.plays,[]);assert.match(s.metric('pending-list'),/Đang chờ điều kiện/);
});
test('local elapsed minutes do not unlock a gate while LMS status remains incomplete',async()=>{
 const s=setup([video('Video: B'),{...video('Video: A'),minimum:10}],{continuous:true,onLoad:(s,body,i)=>{
  if(i===0)body.replaceWith(gate(s.document,['Video: A']));
 }});
 await s.until(()=>s.playing);s.update(1,99,'Chưa hoàn thành');s.refresh();await s.until(()=>s.playing);await s.run(10);
 assert.equal(s.opened.filter(i=>i===0).length,1);assert.ok(s.plays.every(i=>i===1));assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('final audit discovers a required leaf omitted from an otherwise complete report',async()=>{
 const s=setup([done(),video('Video: Bị sót')],{continuous:true}),d=s.document,menu=d.getElementById('tnContentList'),leaves=[...menu.children],calls=[];
 d.querySelector('[data-row="1"]').remove();menu.replaceChildren(leaves[0],nested(d,10,leaves[1],calls));
 await s.until(()=>stopped(s),160);assert.equal(calls.length,10);assert.deepEqual(s.opened,[]);assert.match(s.metric('pending-list'),/Video: Bị sót/);assert.match(s.metric('menu-state'),/chưa đối chiếu/);assert.doesNotMatch(s.message(),/tất cả mục có sao đỏ/);
});
test('new report rows revealed during audit are processed before stopping',async()=>{
 let savedRow=null;
 const s=setup([done(),video('Video: Mới tải')],{continuous:true,onProgress:s=>{
  if(savedRow&&s.document.querySelector('#tnContentList [data-item="1"]')){s.document.querySelector('table').append(savedRow);savedRow=null;}
  for(const [i,it] of s.items.entries())if(s.document.querySelector(`[data-row="${i}"]`)){
   const minutes=it.initialMinutes+s.serverSeconds[i]/60;s.update(i,Number(minutes.toFixed(3)),minutes>=it.minimum?'Đã hoàn thành':'Chưa hoàn thành');
  }
 }}),d=s.document,menu=d.getElementById('tnContentList'),leaves=[...menu.children],calls=[];
 savedRow=d.querySelector('[data-row="1"]');savedRow.remove();menu.replaceChildren(leaves[0],nested(d,10,leaves[1],calls));
 await s.until(()=>stopped(s),220);assert.deepEqual(s.opened,[1]);assert.equal(s.items[1].status,'Đã hoàn thành');assert.equal(s.root.getElementById('pending').hidden,true);
});
test('a locked branch prevents all-complete even when the visible report is complete',async()=>{
 const s=setup([done()],{continuous:true}),d=s.document,calls=[];
 d.getElementById('tnContentList').append(folder(d,'Nhánh chưa mở',()=>[],calls,{disabled:true}));
 await s.until(()=>stopped(s),100);assert.deepEqual(calls,[]);assert.match(s.metric('pending-list'),/Nhánh chưa mở/);assert.doesNotMatch(s.message(),/tất cả mục có sao đỏ/);
});
test('expanded native arrow with no loaded children stays unverified',async()=>{
 const s=setup([done()],{continuous:true}),d=s.document,calls=[];
 d.getElementById('tnContentList').append(folder(d,'Nhánh chưa tải',()=>[],calls));await s.until(()=>stopped(s),100);
 assert.equal(calls.length,1);assert.match(s.metric('pending-list'),/chưa có mục con/);assert.doesNotMatch(s.message(),/tất cả mục có sao đỏ/);
});
test('a required row disappearing from a later report cannot silently become complete',async()=>{
 const s=setup([video('Video: A'),done()],{continuous:true});await s.until(()=>s.playing);
 s.document.querySelector('[data-row="0"]').remove();s.refresh();await s.until(()=>stopped(s),100);
 assert.match(s.metric('pending-list'),/không có trong báo cáo|chưa đối chiếu/);assert.doesNotMatch(s.message(),/tất cả mục có sao đỏ/);assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('Stop during final audit cancels subsequent expansions',async()=>{
 const s=setup([done()],{continuous:true}),d=s.document,calls=[],leaf=d.createElement('div');leaf.className='__lesson-name';
 d.getElementById('tnContentList').append(nested(d,12,leaf,calls));await s.until(()=>calls.length>0,80);
 s.root.getElementById('stop').click();const count=calls.length;await s.run(100);assert.equal(calls.length,count);assert.ok(stopped(s));
});
test('an unchanged collapsed arrow recreated by the app is not clicked repeatedly',()=>{
 const d=dom('<div id="tnContentList"></div>'),calls=[],attempts=new Set();
 for(let i=0;i<3;i++){
  d.getElementById('tnContentList').replaceChildren(folder(d,'Mục A',()=>[],calls,{stuck:true}));
  assert.equal(L.openItem(d,'Video: Chưa có',visible,{expandedPaths:attempts}),i===0?'expanded':'expanding');
 }
 assert.equal(calls.length,1);
});
test('an optional prerequisite can itself depend on another optional prerequisite',async()=>{
 const titles=['Video: B','Video: A','Video: C'];
 const s=setup(titles.map((title,i)=>({...video(title),required:i===0})),{continuous:true,credit:true,onLoad:(s,body,i)=>{
  const need=i===0?1:i===1?2:null;if(need!==null&&s.items[need].status!=='Đã hoàn thành')body.replaceWith(gate(s.document,[titles[need]]));
 }});
 await s.until(()=>stopped(s),350);assert.deepEqual(s.opened,[0,1,2,1,0]);assert.deepEqual(s.plays,[2,1,0]);assert.ok(s.items.every(it=>it.status==='Đã hoàn thành'));
});
test('ambiguous prerequisite names are retained without opening either optional lookalike',async()=>{
 const s=setup([video('Video: B'),{...video('Video: A'),required:false},{...video('Video: A'),required:false}],{continuous:true,onLoad:(s,body,i)=>{
  if(i===0)body.replaceWith(gate(s.document,['Video: A']));
 }});
 await s.until(()=>stopped(s),100);assert.deepEqual(s.opened,[0]);assert.deepEqual(s.plays,[]);assert.match(s.metric('pending-list'),/Video: A/);
});
test('audit flags a stuck arrow but never clicks its recreated copy again',()=>{
 const d=dom('<div id="tnContentList"></div>'),state={},calls=[];
 for(const time of [0,500,8500,9600]){
  d.getElementById('tnContentList').replaceChildren(folder(d,'Nhánh kẹt',()=>[],calls,{stuck:true}));
  const result=L.scanMenu(d,visible,time,state);if(time===9600){assert.equal(result.kind,'ready');assert.equal(result.blocked.length,1);}
 }
 assert.equal(calls.length,1);
});
test('audit waits for children appended after an expanded arrow rather than finishing early',async()=>{
 const s=setup([done()],{continuous:true}),d=s.document,calls=[];
 const branch=folder(d,'Nhánh tải chậm',()=>[],calls);d.getElementById('tnContentList').append(branch);
 await s.until(()=>calls.length===1);await s.run(6);assert.equal(stopped(s),false);
 const leaf=d.createElement('div');leaf.className='__lesson-name';const a=d.createElement('a');a.setAttribute('href','javascript:void(0)');a.textContent='Bài còn thiếu';const star=d.createElement('span');star.className='content-required';a.append(star);leaf.append(a);branch.querySelector('.__lesson-description').append(leaf);
 await s.until(()=>stopped(s),100);assert.match(s.metric('pending-list'),/Bài còn thiếu/);assert.doesNotMatch(s.message(),/tất cả mục có sao đỏ/);
});
test('hidden-tab time does not consume the per-branch audit loading budget',async()=>{
 const s=setup([done()],{continuous:true}),d=s.document,calls=[];
 const branch=folder(d,'Nhánh chậm',()=>[],calls);d.getElementById('tnContentList').append(branch);
 await s.until(()=>calls.length===1);await s.run(2);s.front=false;await s.tick();await s.tick(120000);s.front=true;await s.tick();
 assert.equal(stopped(s),false);assert.doesNotMatch(s.metric('pending-list'),/chưa có mục con/);
 s.root.getElementById('stop').click();assert.ok(stopped(s));
});
test('semantic aria-controls folders are included in the final audit',()=>{
 const d=dom('<div id="tnContentList"><button aria-controls="group" aria-expanded="false">Nhánh ARIA</button></div>'),state={};
 const button=d.querySelector('button');let calls=0;button.addEventListener('click',()=>{
  calls++;button.setAttribute('aria-expanded','true');const group=d.createElement('div');group.id='group';
  const leaf=d.createElement('div');leaf.className='__lesson-name';const a=d.createElement('a');a.setAttribute('href','javascript:void(0)');a.textContent='Bài con';const star=d.createElement('span');star.className='content-required';a.append(star);leaf.append(a);group.append(leaf);d.getElementById('tnContentList').append(group);
 });
 assert.equal(L.scanMenu(d,visible,0,state).kind,'expanded');L.scanMenu(d,visible,500,state);const result=L.scanMenu(d,visible,1600,state);
 assert.equal(result.kind,'ready');assert.equal(result.items.filter(it=>it.required).length,1);assert.equal(calls,1);
});
test('unreported duplicate leaves cannot both be covered by one report row',()=>{
 const snapshot={items:[{title:'Video: A',required:true,path:['phần 1']},{title:'Video: A',required:true,path:['phần 1']}]};
 const extras=L.unreportedMenuItems(snapshot,{requiredItems:[{title:'Video: A',section:'Phần 1'}]});assert.equal(extras.length,1);
});
test('one disappearing required activity is not counted twice as both missing row and menu extra',async()=>{
 const s=setup([video('Video: A'),done()],{continuous:true});await s.until(()=>s.playing);s.document.querySelector('[data-row="0"]').remove();s.refresh();await s.until(()=>stopped(s),100);
 assert.match(s.metric('pending-summary'),/Mục còn tồn: 1 /);
});
test('a prerequisite banner without labels is reconsidered after actual LMS completion changes',async()=>{
 const s=setup([video('Video: B'),video('Video: A')],{continuous:true,credit:true,onLoad:(s,body,i)=>{
  if(i===0&&s.items[1].status!=='Đã hoàn thành')body.replaceWith(gate(s.document,[]));
 }});
 await s.until(()=>stopped(s),250);assert.deepEqual(s.opened,[0,1,0]);assert.deepEqual(s.plays,[1,0]);
});
test('audit does not expand an aria control pointing outside the LMS menu',()=>{
 const d=dom('<div id="tnContentList"><button aria-controls="outside" aria-expanded="false">Ngoài menu</button></div><div id="outside"></div>');
 let clicks=0;d.querySelector('button').addEventListener('click',()=>clicks++);const state={};L.scanMenu(d,visible,0,state);const result=L.scanMenu(d,visible,1100,state);
 assert.equal(clicks,0);assert.equal(result.folders.length,0);assert.equal(result.kind,'ready');
});
test('breadcrumb matching retains a leaf icon and a separator belonging to the actual title',()=>{
 const d=dom('<div id="tnContentView"><div class="headcontent"><div class="col-md-10"><span>Cha » Nhánh » 📌 Hướng dẫn » Phần A<span>(Môn học)</span></span></div></div></div>');
 assert.equal(L.viewerMatches(d,'📌 Hướng dẫn » Phần A',visible),true);assert.equal(L.viewerMatches(d,'Phần B',visible),false);
});
test('a branch inserted during recovery is audited before the final stop',async()=>{
 const s=setup([video('Video: Không ghi phút')],{continuous:true}),d=s.document;let inserted=false;
 for(let i=0;i<800&&!stopped(s);i++){
  if(!inserted&&s.phase().includes('Chờ thử lại')){
   inserted=true;const label=d.createElement('div');label.className='__lesson-name';const a=d.createElement('a');a.setAttribute('href','javascript:void(0)');a.textContent='Bài mới trong lúc chờ';const star=d.createElement('span');star.className='content-required';a.append(star);label.append(a);d.getElementById('tnContentList').append(label);
  }
  await s.tick();
 }
 assert.equal(inserted,true);assert.ok(stopped(s));assert.match(s.metric('pending-list'),/Bài mới trong lúc chờ/);assert.doesNotMatch(s.message(),/tất cả mục có sao đỏ/);
});
