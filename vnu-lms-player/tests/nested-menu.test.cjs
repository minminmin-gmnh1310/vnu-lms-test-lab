// Native wrapper/arrow/heading structure was checked against VNU's public
// Angular bundle on 2026-10-26. Data, href variants, layout, time and server
// responses below are fixtures, not an authenticated test on VNU.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom');
const {setup,item}=require('./required-fixture.cjs');
const dir=process.env.VNU_RUNTIME_DIR||path.join(__dirname,'..');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(dir,'lms.js'),'utf8'),c);
const L=vm.runInContext('VnuLms',c),dom=html=>parseHTML('<html><body>'+html+'</body></html>').document;
const visible=e=>{for(let n=e;n;n=n.parentElement)if(n.style.display==='none'||n.hasAttribute('hidden'))return false;return true};
const title='Video 1: Khái niệm, đặc điểm bộ máy nhà nước';
const leaf=(name,id,href='href="javascript:void(0)"')=>`<div class="class-lesson"><div><div class="__lesson-name"><a id="${id}" ${href}>${name}<span class="content-required">&nbsp;</span></a></div></div></div>`;
const group=(name,body,open=true,klass='__lesson-name-child')=>`<div class="class-lesson-child"><div><div class="${klass}"><span class="arrow"><i class="fa fa-chevron-${open?'up':'down'}"></i></span><a>${name}</a></div><div class="__lesson-description" ${open?'':'style="display:none"'}>${body}</div></div></div>`;
const head=name=>`<div class="headcontent"><div class="col-md-10"><span>${name}<span>(Môn học)</span></span></div></div>`;
const collectClicks=d=>{const result=[];for(const a of d.querySelectorAll('a[id]'))a.addEventListener('click',()=>result.push(a.id));return result};

for(const href of ['', 'href="#"', 'href="javascript:;"'])test('native nested leaf is reachable with '+(href||'no href'),()=>{
 const d=dom('<div id="tnContentList">'+group('Bài 2',group('2.2 Nội dung 1',group('2.2.1 Bài giảng',leaf(title,'target',href))))+'</div>');
 const clicks=collectClicks(d);assert.equal(L.openItem(d,title,visible,{section:'2.2.1 Bài giảng'}),'clicked');assert.deepEqual(clicks,['target']);
 assert.equal(L.links(d).length,1);assert.equal(L.links(d)[0].id,'target');
});
test('structural fallback never treats a folder title, external URL or plain outside anchor as a lesson',()=>{
 const d=dom('<a id="outside">'+title+'</a><div id="tnContentList">'+group(title,'')+leaf(title,'external','href="https://example.test/file"')+'<a id="unscoped">'+title+'</a></div>');
 assert.equal(L.links(d,title).length,0);assert.deepEqual(collectClicks(d),[]);
});
test('exact section chooses the right nested control even if the report title is unique',()=>{
 const d=dom('<div id="tnContentList">'+group('1.2 Bài giảng',leaf(title,'wrong'))+group('2.2.1 Bài giảng',leaf(title,'right'))+'</div>');
 const clicks=collectClicks(d);assert.equal(L.openItem(d,title,visible,{section:'2.2.1 Bài giảng'}),'clicked');assert.deepEqual(clicks,['right']);
});
test('content parents with children also provide a native section scope',()=>{
 const d=dom('<div id="tnContentList">'+group('1.2 Nội dung',leaf(title,'wrong'),true,'__lesson-name')+group('2.2 Nội dung',leaf(title,'right'),true,'__lesson-name')+'</div>');
 const clicks=collectClicks(d);assert.equal(L.openItem(d,title,visible,{section:'2.2 Nội dung',titleDuplicate:true}),'clicked');assert.deepEqual(clicks,['right']);
});
test('numbered target branch expands before an unrelated earlier chapter',()=>{
 const d=dom('<div id="tnContentList">'+group('Bài 1. Mục đã học','',false)+group('Bài 2. Bộ máy, chức năng','',false)+'</div>');
 const calls=[];for(const [i,e] of [...d.querySelectorAll('.arrow')].entries())e.addEventListener('click',()=>calls.push(i));
 assert.equal(L.openItem(d,title,visible,{section:'2.2.1 Bài giảng'}),'expanded');assert.deepEqual(calls,[1]);
});
test('deepest numbered parent expands before its unrelated siblings',()=>{
 const d=dom('<div id="tnContentList">'+group('Bài 2',group('2.1 Giới thiệu','',false)+group('2.2 Nội dung 1','',false)+group('2.3 Nội dung 2','',false))+'</div>');
 const calls=[];for(const e of d.querySelectorAll('.arrow'))e.addEventListener('click',()=>calls.push(e.parentElement.querySelector('a').textContent));
 assert.equal(L.openItem(d,title,visible,{section:'2.2.1 Bài giảng'}),'expanded');assert.deepEqual(calls,['2.2 Nội dung 1']);
});
test('a hidden mounted lesson expands its own ancestor instead of an earlier unrelated folder',()=>{
 const d=dom('<div id="tnContentList">'+group('Mục khác','',false)+group('Mục chứa bài',leaf(title,'target'),false)+'</div>');
 const calls=[];for(const [i,e] of [...d.querySelectorAll('.arrow')].entries())e.addEventListener('click',()=>calls.push(i));
 assert.equal(L.openItem(d,title,visible),'expanded');assert.deepEqual(calls,[1]);
});
test('invisible formatting in a copied title does not hide the native lesson',()=>{
 const d=dom('<div id="tnContentList">'+leaf('Video 1: Khái\u200b niệm, đặc điểm bộ máy nhà nước','target')+'</div>');
 const clicks=collectClicks(d);assert.equal(L.openItem(d,title,visible),'clicked');assert.deepEqual(clicks,['target']);
});
test('formatting normalization never resolves two same-section lessons by guessing',()=>{
 const d=dom('<div id="tnContentList">'+group('2.2.1 Bài giảng',leaf(title,'one')+leaf(title+'\ufeff','two'))+'</div>');
 const clicks=collectClicks(d);assert.equal(L.openItem(d,title,visible,{section:'2.2.1 Bài giảng',titleDuplicate:true}),'ambiguous');assert.deepEqual(clicks,[]);
});
test('native selected marker confirms a no-href duplicate only inside the right section',()=>{
 const d=dom('<div id="tnContentList">'+group('1.2 Bài giảng',leaf(title,'wrong',''))+group('2.2.1 Bài giảng',leaf(title,'right',''))+'</div>');
 d.getElementById('wrong').parentElement.classList.add('content-selected');
 const options={section:'2.2.1 Bài giảng',titleDuplicate:true};assert.equal(L.selected(d,title,visible,options),false);
 d.getElementById('right').parentElement.classList.add('content-selected');assert.equal(L.selected(d,title,visible,options),true);
});
test('duplicate numbered branch controls remain ambiguous',()=>{
 const d=dom('<div id="tnContentList">'+group('Bài 2. Lớp A','',false)+group('Bài 2. Lớp B','',false)+'</div>');
 assert.equal(L.openItem(d,title,visible,{section:'2.2.1 Bài giảng'}),'ambiguous');
});

function folder(document,name,children,calls){
 const wrapper=document.createElement('div');wrapper.className='class-lesson-child';
 const inner=document.createElement('div'),heading=document.createElement('div');heading.className='__lesson-name-child';
 const arrow=document.createElement('span');arrow.className='arrow';const icon=document.createElement('i');icon.className='fa fa-chevron-down';arrow.append(icon);
 const label=document.createElement('a');label.textContent=name;label.addEventListener('click',()=>{throw new Error('Folder title must not be clicked')});
 heading.append(arrow,label);inner.append(heading);wrapper.append(inner);
 arrow.addEventListener('click',()=>{calls.push(name);icon.className='fa fa-chevron-up';const body=document.createElement('div');body.className='__lesson-description';body.append(...children());inner.append(body)});
 return wrapper;
}
for(const [count,step] of [[70,500],[40,2000]])test(`discovery reaches a late required lesson after ${count} folders at ${step}ms per callback`,async()=>{
 const s=setup([item(title,{type:'video',minimum:10})]);
 const d=s.document,menu=d.getElementById('tnContentList'),saved=menu.firstElementChild,calls=[];menu.replaceChildren();
 for(let i=0;i<count;i++)menu.append(folder(d,'Mục '+i,()=>i===count-1?[saved]:[],calls));
 for(let i=0;i<count+20&&!s.playing;i++)await s.tick(step);
 assert.equal(s.playing,true,s.message());assert.deepEqual(s.opened,[0]);assert.equal(calls.length,count);
});
test('Stop during nested discovery prevents later arrows and lesson opens',async()=>{
 const s=setup([item(title,{type:'video'})]),d=s.document,menu=d.getElementById('tnContentList'),saved=menu.firstElementChild,calls=[];
 menu.replaceChildren(folder(d,'Bài 2',()=>[folder(d,'2.2 Nội dung',()=>[saved],calls)],calls));
 await s.until(()=>calls.length===1);s.root.getElementById('stop').click();await s.run(50);
 assert.equal(calls.length,1);assert.deepEqual(s.opened,[]);assert.equal(s.playing,false);
});
test('a trusted manual choice of a no-href native leaf yields control to the user',async()=>{
 const s=setup([item(title,{type:'video'}),item('Video 2: Bài tự chọn',{type:'video'})]);
 const second=s.document.querySelector('[data-item="1"]');second.removeAttribute('href');
 await s.until(()=>s.playing);
 const event=new s.window.Event('pointerdown',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});second.dispatchEvent(event);second.click();
 await s.run(10);assert.match(s.message(),/chọn bài thủ công/);assert.deepEqual(s.opened,[0,1]);assert.deepEqual(s.plays,[0]);
});
test('four-level lazy menu visits every required video, reading and PDF in report order',async()=>{
 const items=[item('Video đã xong',{type:'video',minutes:2,status:'Đã hoàn thành'}),
  ...Array.from({length:5},(_,i)=>item('Video '+(i+1)+': Nội dung '+(i+1),{type:'video',minimum:0.05})),
  item('Bài đọc 1: Giải pháp',{minimum:0.05}),item('Bài đọc 2: Vai trò',{minimum:0.05}),
  item('Học liệu tùy chọn',{required:false,type:'pdf'}),item('Bài giảng (PDF): Bộ máy',{type:'pdf',minimum:0.05})];
 const s=setup(items,{credit:true,productionDefaults:true}),d=s.document,menu=d.getElementById('tnContentList');
 const leaves=[...menu.children],calls=[];
 // Deliberately vary only native leaf attributes. Folder titles still have no
 // href and must remain expansion controls, not activities.
 leaves[2].querySelector('a').removeAttribute('href');leaves[6].querySelector('a').setAttribute('href','#');
 menu.replaceChildren(folder(d,'Bài 1. Mục trước',()=>[leaves[0]],calls),folder(d,'Bài 2. Bộ máy, chức năng',()=>[
  folder(d,'2.2 Nội dung 1',()=>[
   folder(d,'2.2.1 Bài giảng',()=>leaves.slice(1,6),calls),
   folder(d,'2.2.2 Bài đọc bắt buộc',()=>leaves.slice(6,8),calls),
   folder(d,'2.2.3 Học liệu mở rộng',()=>[leaves[8]],calls),
   folder(d,'2.2.4 Tài liệu bắt buộc',()=>[leaves[9]],calls)
  ],calls)
 ],calls));
 const row=(before,name)=>{const tr=d.createElement('tr');for(let i=0;i<7;i++){const td=d.createElement('td');td.textContent=i===0?name:'';tr.append(td)}d.querySelector(`[data-row="${before}"]`).before(tr)};
 row(1,'2.2.1 Bài giảng');row(6,'2.2.2 Bài đọc bắt buộc');row(8,'2.2.3 Học liệu mở rộng');row(9,'2.2.4 Tài liệu bắt buộc');
 await s.until(()=>s.metric('required-summary').includes('9 / 9')&&s.phase().includes('Đã dừng'),1000);
 assert.deepEqual(s.opened,[1,2,3,4,5,6,7,9]);assert.deepEqual(s.plays,[1,2,3,4,5]);
 assert.equal(items[8].status,'Chưa hoàn thành');assert.equal(s.answers,0);
 assert.ok(calls.includes('Bài 1. Mục trước'));assert.ok(calls.includes('2.2.3 Học liệu mở rộng'));
 assert.equal(calls[0],'Bài 2. Bộ máy, chức năng','Required work remains ahead of the final audit');
});
test('native not-yet-open banner is reported promptly and later available content continues',async()=>{
 const s=setup([item('3.1 Giới thiệu bài học',{minimum:1}),item(title,{type:'video'})],{continuous:true,onLoad:(s,body,i)=>{
  if(i===0){const h=s.document.createElement('h4');h.textContent='Nội dung sẽ bắt đầu vào: 02/11/2026 00:00';body.replaceWith(h)}
 }});
 await s.until(()=>s.playing,70);assert.deepEqual(s.opened,[0,1]);
 assert.match(s.metric('pending-list'),/02\/11\/2026 00:00/);assert.match(s.metric('pending-list'),/LMS chưa mở/);
 assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('availability is never inferred from another lesson or a quotation inside the actual reader',()=>{
 const d=dom('<div id="tnContentView">'+head(title)+'<h4>Nội dung sẽ bắt đầu vào: 02/11/2026 00:00</h4></div>');
 assert.equal(L.availability(d,'Bài khác',visible),null);
 const banner=d.querySelector('h4'),body=d.createElement('div');body.id='TNContentView';banner.replaceWith(body);body.append(banner);
 assert.equal(L.availability(d,title,visible),null);
});
test('diagnostics list missing and nested matches without copying external URLs',async()=>{
 const s=setup([item(title)]);await s.until(()=>s.opened.length===1);
 const d=s.document,a=d.createElement('a');a.textContent='Tài liệu khác';a.setAttribute('href','https://example.test/file?secret=do-not-log');d.getElementById('tnContentList').append(a);
 s.root.getElementById('diagnose').click();const text=s.metric('diagnostic');
 assert.match(text,/Đối chiếu menu con/);assert.match(text,/"nameMatches":1/);assert.match(text,/"visibleMatches":1/);assert.match(text,/Tài liệu khác/);assert.doesNotMatch(text,/do-not-log/);
});
