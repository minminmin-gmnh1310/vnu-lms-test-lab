// Failure and recovery boundaries; all DOM/media/timing are simulated in Node.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const {setup,item}=require('./required-fixture.cjs');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(process.env.VNU_RUNTIME_DIR||path.join(__dirname,'..'),'lms.js'),'utf8'),c);
const L=vm.runInContext('VnuLms',c),dom=()=>parseHTML('<html><body><div id="tnContentList"></div></body></html>').document;
const visible=e=>{for(let n=e;n;n=n.parentElement)if(n.style.display==='none'||n.hasAttribute('hidden'))return false;return true};
function leaf(d,title,required=false){const head=d.createElement('div');head.className='__lesson-name';const a=d.createElement('a');a.setAttribute('href','javascript:void(0)');a.textContent=title;if(required){const star=d.createElement('span');star.className='content-required';a.append(star)}head.append(a);return head;}
function folder(d,title,children,calls,options={}){
 const outer=d.createElement('div'),inner=d.createElement('div'),head=d.createElement('div'),arrow=d.createElement('span'),icon=d.createElement('i'),label=d.createElement('a');
 outer.className='class-lesson-child';head.className='__lesson-name-child';arrow.className='arrow';icon.className='fa fa-chevron-down';label.textContent=title;arrow.append(icon);head.append(arrow,label);inner.append(head);outer.append(inner);
 arrow.addEventListener('click',()=>{calls.push(title);if(options.stuck)return;icon.className='fa fa-chevron-up';const body=d.createElement('div');body.className='__lesson-description';body.append(...children());inner.append(body)});return outer;
}
function nested(d,depth,last,calls){let make=()=>[last];for(let i=depth;i>0;i--){const next=make,title='Cấp '+i;make=()=>[folder(d,title,next,calls)]}return make()[0];}
const done=()=>item('Bài đã hoàn thành',{minutes:1,minimum:0.05,status:'Đã hoàn thành'});
const video=title=>item(title,{type:'video',minimum:0.05});
const stopped=s=>s.phase().includes('Đã dừng');

for(const depth of [40,64])test('required leaf and final audit work at '+depth+' nested levels',async()=>{
 const s=setup([video('Video: Lá cuối')],{continuous:true,credit:true}),d=s.document,menu=d.getElementById('tnContentList'),saved=menu.firstElementChild,calls=[];
 menu.replaceChildren(nested(d,depth,saved,calls));await s.until(()=>stopped(s),depth*3+180);
 assert.equal(calls.length,depth);assert.deepEqual(s.opened,[0]);assert.deepEqual(s.plays,[0]);assert.equal(s.items[0].status,'Đã hoàn thành');assert.equal(s.root.getElementById('pending').hidden,true);
});
test('512 valid folders finish without opening their optional leaves',async()=>{
 const s=setup([video('Video: Cuối danh sách')],{continuous:true,credit:true}),d=s.document,menu=d.getElementById('tnContentList'),saved=menu.firstElementChild,calls=[];menu.replaceChildren();
 for(let i=0;i<512;i++)menu.append(folder(d,'Nhánh '+i,()=>[i===511?saved:leaf(d,'Tùy chọn '+i)],calls));
 await s.until(()=>stopped(s),750);assert.equal(calls.length,512);assert.deepEqual(s.opened,[0]);assert.equal(s.root.getElementById('pending').hidden,true);
});
test('identically named sibling folders do not share an expansion retry key',async()=>{
 const s=setup([video('Video: Đích duy nhất')]),d=s.document,menu=d.getElementById('tnContentList'),saved=menu.firstElementChild,calls=[];
 menu.replaceChildren(folder(d,'Bài giảng',()=>[leaf(d,'Tùy chọn')],calls),folder(d,'Bài giảng',()=>[saved],calls));
 await s.until(()=>s.playing,100);assert.equal(calls.length,2);assert.deepEqual(s.opened,[0]);
});
test('one stuck collapsed folder does not delay another openable folder for eight seconds',()=>{
 const d=dom(),calls=[],state={},menu=d.getElementById('tnContentList');
 menu.append(folder(d,'Kẹt',()=>[],calls,{stuck:true}),folder(d,'Khả dụng',()=>[leaf(d,'Bài')],calls));
 assert.equal(L.scanMenu(d,visible,0,state).kind,'expanded');assert.equal(L.scanMenu(d,visible,500,state).kind,'expanded');assert.deepEqual(calls,['Kẹt','Khả dụng']);
});
test('a loading expanded branch does not block expansion of an unrelated branch',()=>{
 const d=dom(),calls=[],state={},menu=d.getElementById('tnContentList');menu.append(folder(d,'Tải chậm',()=>[],calls),folder(d,'Bài khác',()=>[leaf(d,'Bài')],calls));
 L.scanMenu(d,visible,0,state);assert.equal(L.scanMenu(d,visible,500,state).kind,'expanded');assert.deepEqual(calls,['Tải chậm','Bài khác']);
});
test('loading budget restarts if previously loaded children disappear again',()=>{
 const d=dom(),calls=[],state={},menu=d.getElementById('tnContentList'),branch=folder(d,'Thay DOM',()=>[],calls);menu.append(branch);
 L.scanMenu(d,visible,0,state);L.scanMenu(d,visible,500,state);const body=branch.querySelector('.__lesson-description');body.append(leaf(d,'Bài đã tải'));L.scanMenu(d,visible,2000,state);
 body.replaceChildren();L.scanMenu(d,visible,7000,state);const result=L.scanMenu(d,visible,10000,state);assert.equal(result.kind,'waiting');assert.equal(result.blocked.length,0);
});
test('a temporarily missing menu waits and resumes when its DOM is replaced',()=>{
 const d=dom(),state={},menu=d.getElementById('tnContentList');menu.append(leaf(d,'Bài',true));L.scanMenu(d,visible,0,state);menu.remove();
 assert.equal(L.scanMenu(d,visible,1000,state).kind,'waiting');d.body.append(menu);L.scanMenu(d,visible,2000,state);const result=L.scanMenu(d,visible,3100,state);assert.equal(result.kind,'ready');assert.equal(result.blocked.length,0);
});
test('a missing menu preserves known items and reports an unresolved branch after its grace period',()=>{
 const d=dom(),state={},menu=d.getElementById('tnContentList');menu.append(leaf(d,'Bài bắt buộc',true));L.scanMenu(d,visible,0,state);menu.remove();L.scanMenu(d,visible,1000,state);
 const result=L.scanMenu(d,visible,9100,state);assert.equal(result.kind,'ready');assert.equal(result.available,false);assert.equal(result.items.length,1);assert.equal(result.blocked.length,1);
});
test('a hidden menu during audit cannot immediately erase a pending scan',()=>{
 const d=dom(),state={},menu=d.getElementById('tnContentList');menu.append(leaf(d,'Bài',true));L.scanMenu(d,visible,0,state);menu.style.display='none';
 assert.equal(L.scanMenu(d,visible,500,state).kind,'waiting');menu.style.display='block';assert.equal(L.scanMenu(d,visible,1100,state).blocked.length,0);
});
for(const order of [false,true])test('scoped report rows take priority over unscoped duplicates; reversed='+order,()=>{
 const items=[{title:'Video: Chung',required:true,path:['mục a']},{title:'Video: Chung',required:true,path:['mục b']}];
 const rows=[{title:'Video: Chung',section:null},{title:'Video: Chung',section:'Mục A'}];if(order){items.reverse();rows.reverse();}
 assert.equal(L.unreportedMenuItems({items},{requiredItems:rows}).length,0);
});
test('an explicitly wrong section remains unmatched even when the title is unique',()=>{
 assert.equal(L.unreportedMenuItems({items:[{title:'Video: A',required:true,path:['bài 1']}]},{requiredItems:[{title:'Video: A',section:'1.1 Mục cũ'}]}).length,1);
});
test('a broad ancestor row cannot steal a leaf needed by a deeper scoped row',()=>{
 const items=[{title:'Video: Chung',required:true,path:['cha','con']},{title:'Video: Chung',required:true,path:['cha']}];
 const rows=[{title:'Video: Chung',section:'Cha'},{title:'Video: Chung',section:'Con'}];assert.equal(L.unreportedMenuItems({items},{requiredItems:rows}).length,0);
});
test('optional same-title leaves cannot consume mandatory report matches',()=>{
 const extras=L.unreportedMenuItems({items:[{title:'Video: A',required:false,path:['mục a']},{title:'Video: A',required:true,path:['mục b']}]},{requiredItems:[{title:'Video: A',section:'Mục B'}]});assert.equal(extras.length,0);
});
test('a missing report row covers only one of two equal required menu leaves',async()=>{
 const s=setup([video('Video: A'),done()],{continuous:true});await s.until(()=>s.playing);const a=s.document.querySelector('[data-item="0"]');
 s.document.getElementById('tnContentList').append(a.parentElement.cloneNode(true));s.document.querySelector('[data-row="0"]').remove();s.refresh();await s.until(()=>stopped(s),120);
 assert.match(s.metric('pending-summary'),/Mục còn tồn: 2 /);assert.equal(s.items[0].status,'Chưa hoàn thành');
});
test('Stop while a branch is loading prevents later available siblings from opening',async()=>{
 const s=setup([done()],{continuous:true}),d=s.document,calls=[];d.getElementById('tnContentList').append(folder(d,'Đang tải',()=>[],calls),folder(d,'Tiếp theo',()=>[leaf(d,'Bài')],calls));
 await s.until(()=>calls.length===1,80);s.root.getElementById('stop').click();await s.run(100);assert.equal(calls.length,1);assert.ok(stopped(s));
});
for(const seed of [7,31,97,2026])test('deterministic mixed tree preserves all leaves and one-to-one report coverage; seed='+seed,()=>{
 const d=dom(),state={},calls=[],expected=[];let value=seed;
 const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296};
 const make=(depth,ancestors)=>{
  const title='Thư mục '+depth+'-'+Math.floor(random()*4),own=[...ancestors,L.titleKey(title)];
  return folder(d,title,()=>{
   const result=[];for(let i=0;i<2;i++){
    if(depth<7&&random()<0.52)result.push(make(depth+1,own));
    else {const name='Bài '+Math.floor(random()*6),required=random()>0.25;result.push(leaf(d,name,required));if(required)expected.push({title:name,section:title,path:own});}
   }return result;
  },calls);
 };
 d.getElementById('tnContentList').append(make(1,[]));let result;
 for(let i=0;i<800;i++){result=L.scanMenu(d,visible,i*500,state);if(result.kind==='ready')break;}
 assert.equal(result.kind,'ready');assert.equal(result.blocked.length,0);assert.equal(result.items.filter(it=>it.required).length,expected.length);
 assert.equal(L.unreportedMenuItems(result,{requiredItems:expected}).length,0);
 if(expected.length)assert.equal(L.unreportedMenuItems(result,{requiredItems:expected.slice(1)}).length,1);
});
