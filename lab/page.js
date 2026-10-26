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
 function open(index){
  selected=index;const item=items[index];
  for(const a of document.querySelectorAll('[data-item]'))a.parentElement.classList.toggle('content-selected',Number(a.dataset.item)===index);
  element('heading').textContent=item.title;element('payload').replaceChildren();
  let body;
  if(item.kind==='video'){
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
  for(const item of rows){
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
 api('progress').then(rows=>{
  items=rows;
  for(const item of items){const div=document.createElement('div');div.className='__lesson-name';const a=document.createElement('a');a.href='javascript:void(0)';a.dataset.item=item.index;a.textContent=item.title;
   if(item.required){const star=document.createElement('span');star.className='content-required';a.append(star);}a.addEventListener('click',()=>open(item.index));div.append(a);element('tnContentList').append(div);}
 }).catch(error);
 setInterval(async()=>{if(busy)return;busy=true;try{
  if(selected!==null&&items[selected]?.kind==='dynamic'&&view==='content')element('TNContentView').textContent='Nội dung mô phỏng · bộ đếm '+(++dynamic);
  await api('state',state());
 }catch(e){error(e);}finally{busy=false;}},100);
})();
