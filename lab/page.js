/* Runs only on the loopback mock server. Independent of extension internals. */
(() => {
 'use strict';
 const scenario=new URLSearchParams(location.search).get('scenario')||'pipeline';
 let selected=null,view='content',items=[],chain=Promise.resolve(),busy=false,dynamic=0;
 const element=id=>document.getElementById(id);
 const api=(name,body)=>{
  const request=()=>fetch('/api/'+name+'?scenario='+encodeURIComponent(scenario),body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>{if(!r.ok)throw new Error('Mock API '+r.status);return r.json();});
  chain=chain.catch(()=>{}).then(request);return chain;
 };
 const state=()=>{const video=element('TNContentView');return {index:selected,visible:view==='content'&&document.visibilityState==='visible',playing:video instanceof HTMLVideoElement&&!video.paused&&!video.ended};};
 const error=e=>{element('fixture-error').textContent=e.message;};
 const display=next=>{view=next;element('content').style.display=next==='content'?'flex':'none';element('progress').style.display=next==='progress'?'block':'none';};
 const lessonOpens=[];window.__vnuLabLessonOpens=lessonOpens;
 function open(index){
  lessonOpens.push(index);
  selected=index;const item=items[index];
  for(const a of document.querySelectorAll('[data-item]'))a.parentElement.classList.toggle('content-selected',Number(a.dataset.item)===index);
  element('heading').textContent=item.title;element('payload').replaceChildren();
  let body;
  const unmet=(item.prerequisites || []).filter(i=>items[i].status!=='Đã hoàn thành');
  if(unmet.length){
   const box=document.createElement('div'),h=document.createElement('h4'),wrap=document.createElement('div'),ul=document.createElement('ul');
   h.textContent='Cần hoàn thành các nội dung sau để tiếp tục.';ul.className='no-padding';
   for(const i of unmet){const li=document.createElement('li');li.textContent=items[i].title;ul.append(li);}
   wrap.append(ul);box.append(h,wrap);element('payload').append(box);api('state',state()).catch(error);return;
  }else if(item.kind==='video'){
   body=document.createElement('video');body.controls=true;body.muted=true;body.loop=scenario==='controls';body.preload='auto';body.src='/clip.webm?lesson='+index+'&scenario='+scenario;
   for(const name of ['playing','pause','ended'])body.addEventListener(name,()=>{api('state',state()).catch(error);});
  }else if(['survey','iframe'].includes(item.kind)){
   body=document.createElement('iframe');body.src='/frame?lesson='+index+'&scenario='+scenario;body.title='Khung mô phỏng';
  }else{body=document.createElement('div');body.textContent='Nội dung mô phỏng: '+item.title;}
  body.id='TNContentView';element('payload').append(body);api('state',state()).catch(error);
 }
 function table(rows){
  const t=document.createElement('table'),header=document.createElement('tr');
  for(const text of ['Tên','Điều kiện hoàn thành','Điểm số','Hệ số','Tổng thời gian truy cập (phút)','Tổng số lượt xem','Trạng thái']){const cell=document.createElement('td');cell.textContent=text;header.append(cell);}t.append(header);
  let section=null;
  for(const item of rows){
   if(item.section && item.section!==section){
    section=item.section;const folder=document.createElement('tr');
    for(let i=0;i<7;i++){const cell=document.createElement('td');cell.textContent=i===0?section:'';folder.append(cell);}t.append(folder);
   }
   const row=document.createElement('tr');
   const values=[item.title,'Phải học tối thiểu '+item.requiredMinutes+' (phút)','---','---',String(item.minutes),'1',item.status];
   values.forEach((text,i)=>{const cell=document.createElement('td');cell.textContent=text;if(i===0&&item.required){const star=document.createElement('span');star.className='content-required';cell.append(star);}row.append(cell);});t.append(row);
  }
  element('progress').replaceChildren(t);
 }
 element('progress-tab').addEventListener('click',async()=>{
  display('progress');element('progress').textContent='Đang đọc server mô phỏng…';
  try{await api('state',state());items=await api('progress');table(items);}catch(e){error(e);}
 });
 element('content-tab').addEventListener('click',()=>{display('content');api('state',state()).catch(error);});
 const menuEvents=[];window.__vnuLabMenuEvents=menuEvents;
 function leaf(item){
  const div=document.createElement('div');div.className='__lesson-name';const a=document.createElement('a');
  // Exercise both the original native href and a structural leaf fallback.
  if(item.index!==3)a.href='javascript:void(0)';a.dataset.item=item.index;a.textContent=item.title;
  if(item.required){const star=document.createElement('span');star.className='content-required';a.append(star);}
  a.addEventListener('click',()=>open(item.index));div.append(a);return div;
 }
 function folder(title,children){
  const wrapper=document.createElement('div');wrapper.className='class-lesson-child';
  const inner=document.createElement('div'),head=document.createElement('div');head.className='__lesson-name-child';
  const arrow=document.createElement('span');arrow.className='arrow';const icon=document.createElement('i');icon.className='fa fa-chevron-down';arrow.append(icon);
  const label=document.createElement('a');label.textContent=title;label.addEventListener('click',()=>menuEvents.push({type:'folder-title',title}));
  head.append(arrow,label);inner.append(head);wrapper.append(inner);
  arrow.addEventListener('click',()=>{if(icon.className.includes('fa-chevron-up'))return;
   menuEvents.push({type:'expand',title});icon.className='fa fa-chevron-up';
   const body=document.createElement('div');body.className='__lesson-description';body.append(...children());inner.append(body);
  });return wrapper;
 }
 api('progress').then(rows=>{
  items=rows;
  const menu=element('tnContentList');
  if(scenario==='controls')menu.append(...items.map(leaf));
  else menu.append(folder('Bài 1. Mục trước',()=>items.slice(0,2).map(leaf)),folder('Bài 2. Nội dung bắt buộc',()=>[
   folder('2.2 Nội dung',()=>[
    folder('2.2.1 Bài giảng',()=>items.slice(2,4).map(leaf)),
    folder('2.2.2 Hoạt động',()=>items.slice(4,6).map(leaf)),
    folder('2.2.3 Tài liệu',()=>items.slice(6,8).map(leaf))
   ])
  ]));
 }).catch(error);
 setInterval(async()=>{if(busy)return;busy=true;try{
  if(selected!==null&&items[selected]?.kind==='dynamic'&&view==='content')element('TNContentView').textContent='Nội dung mô phỏng · bộ đếm '+(++dynamic);
  await api('state',state());
 }catch(e){error(e);}finally{busy=false;}},100);
})();
