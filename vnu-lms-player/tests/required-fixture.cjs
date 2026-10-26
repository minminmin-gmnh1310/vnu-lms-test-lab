// Real marker/heading/viewer selectors from the public Angular template;
// layout, media, focus, time and server credit are simulated, not Edge tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom'),f=require('./lms-fixture.cjs');
const scripts=['controller.js','lms.js','queue.js','player.js'].map(n=>fs.readFileSync(path.join(process.env.VNU_RUNTIME_DIR||path.join(__dirname,'..'),n),'utf8'));
const flush=()=>new Promise(setImmediate);
const item=(title,options={})=>({title,required:true,minutes:0,status:'Chưa hoàn thành',minimum:2,...options});
const notice='📌 NHỮNG THÔNG TIN ĐẶC BIỆT QUAN TRỌNG CẦN ĐỌC';
const channel='🌐 KÊNH HỖ TRỢ KỸ THUẬT';
const reading='Bài đọc: Lời chào và hướng dẫn tham gia học tập';
const numbered='Video 1: Khái niệm, đặc trưng, vai trò của nhà nước';
const survey='Phiếu khảo sát trước khi bắt đầu học phần';
function setup(items=[item(notice,{minutes:0.3}),item(channel,{minimum:1}),item(reading),item(numbered,{minimum:10,type:'video'})],options={}){
 const rows=items.map((it,i)=>`<tr data-row="${i}"><td>${it.title}${it.required?(options.literalStar?' *':'<span class="content-required">&nbsp;</span>'):''}</td><td>${it.minimum===null?'---':'Phải học tối thiểu '+it.minimum+' (phút)'}</td><td>---</td><td>---</td><td>${it.minutes}</td><td>1</td><td>${it.status}</td></tr>`).join('');
 const anchors=items.map((it,i)=>`<div class="__lesson-name"><a data-item="${i}" href="javascript:void(0)">${it.title}${it.required?'<span class="content-required">&nbsp;</span>':''}</a></div>`).join('');
 const {window,document}=parseHTML(`<html><body><nav><a id="content-tab" href="javascript:void(0)">NỘI DUNG</a><a id="progress-tab" href="javascript:void(0)">TIẾN TRÌNH HỌC TẬP</a></nav><section id="content"><div id="tnContentList">${anchors}</div><div id="tnContentView"><app-class-content-view><div class="headcontent row"><div class="col-md-10"><span id="title"></span><span>(Môn học)</span></div></div><div id="payload"></div></app-class-content-view></div></section><section id="progress" style="display:none"><table>${f.header}${rows}</table></section></body></html>`);
 const s={window,document,items,clock:0,front:options.front!==false,visible:options.visible!==false,view:'content',index:null,playing:false,time:0,plays:[],opened:[],progressVisits:0,next:0,answers:0,serverSeconds:items.map(()=>0),pendingBodies:[],timeouts:[],path:f.course,ended:false,mediaError:null,freeze:false,width:options.width||1280,height:options.height||900,scrolls:[]};
 Object.defineProperties(window,{innerWidth:{get:()=>s.width,configurable:true},innerHeight:{get:()=>s.height,configurable:true}});
 Object.defineProperty(document,'baseURI',{value:'https://lms.vnu.edu.vn'+f.course});
 Object.defineProperty(document,'visibilityState',{get:()=>s.visible?'visible':'hidden'});document.hasFocus=()=>s.front;
 window.HTMLElement.prototype.getClientRects=function(){for(let n=this;n;n=n.parentElement)if(n.style.display==='none'||n.hasAttribute('hidden'))return [];return [{}]};
 const show=view=>{s.view=view;document.getElementById('content').style.display=view==='content'?'block':'none';document.getElementById('progress').style.display=view==='progress'?'block':'none'};
 s.update=(i,minutes,status='Chưa hoàn thành')=>{items[i].minutes=minutes;items[i].status=status;const r=document.querySelector(`[data-row="${i}"]`);r.children[4].textContent=String(minutes);r.children[6].textContent=status};
 document.getElementById('content-tab').addEventListener('click',()=>show('content'));
 document.getElementById('progress-tab').addEventListener('click',()=>{
  s.progressVisits++;show('progress');
  if(options.credit)for(const [i,it] of items.entries())if(it.type!=='survey'||options.creditSurvey){
   const minutes=(it.initialMinutes??it.minutes)+s.serverSeconds[i]/60;
   s.update(i,Number(minutes.toFixed(3)),Number.isFinite(it.minimum)&&minutes>=it.minimum?'Đã hoàn thành':'Chưa hoàn thành');
  }
  options.onProgress?.(s);
 });
 for(const it of items)it.initialMinutes=it.minutes;
 s.load=i=>{
  const it=items[i];s.index=i;s.playing=false;s.time=0;s.ended=false;s.mediaError=options.mediaErrors?.[i]||null;s.freeze=false;
  for(const a of document.querySelectorAll('[data-item]'))a.parentElement.classList.toggle('content-selected',Number(a.dataset.item)===i);
  if(options.noSelected)for(const a of document.querySelectorAll('[data-item]'))a.parentElement.classList.remove('content-selected');
  const title=document.getElementById('title');title.textContent=it.title;
  if(options.nestedCourseTitle){const course=document.createElement('span');course.textContent='(Môn học (2026-2027))';title.append(course);}
  const render=()=>{
   const payload=document.getElementById('payload');payload.replaceChildren();
   const tag=it.type==='video'?'video':it.type==='pdf'||it.type==='survey'&&options.surveyIframe?'iframe':'div';
   const body=document.createElement(tag);body.id=options.surveyNoViewer && it.type==='survey'?'survey-body':'TNContentView';
   if(tag==='video'){
    Object.setPrototypeOf(body,window.HTMLVideoElement.prototype);
    Object.defineProperties(body,{paused:{get:()=>!s.playing},ended:{get:()=>s.ended},readyState:{get:()=>2},currentTime:{get:()=>s.time,set:v=>s.time=v},error:{get:()=>s.mediaError}});
    const source=document.createElement('source');source.setAttribute('src','/item-'+i+'.mp4');body.append(source);
    body.currentSrc='https://lms.vnu.edu.vn/item-'+i+'.mp4';body.duration=1466;body.playbackRate=1;
    body.pause=()=>{s.playing=false};body.play=()=>{s.plays.push(i);if(options.play)return options.play(s,body,i);s.playing=true;return Promise.resolve()};
   }else if(tag==='iframe')body.setAttribute('src','https://example.test/document-'+i+'.pdf');
   else if(it.type==='survey'){
    const label=document.createElement('p');label.textContent='Câu hỏi khảo sát cần bạn trả lời';
    const input=document.createElement('input');input.id='survey-answer';
    const button=document.createElement('button');button.textContent='Nộp câu trả lời';button.addEventListener('click',()=>s.answers++);
    body.append(label,input,button);
   }else body.textContent=options.emptyBody?'':'Nội dung thực tế của '+it.title;
   payload.append(body);options.onLoad?.(s,body,i);
  };
  if(options.delayBody && s.booted)s.pendingBodies.push(render);else render();
 };
 for(const a of document.querySelectorAll('[data-item]'))a.addEventListener('click',()=>{const i=Number(a.dataset.item);s.opened.push(i);s.load(i)});
 if(options.initial!==undefined)s.load(options.initial);
 const context=vm.createContext({document,window,chrome:options.chrome,location:{get pathname(){return s.path}},HTMLVideoElement:window.HTMLVideoElement,URL,performance:{now:()=>s.clock},getComputedStyle:e=>({visibility:e.style.visibility||'visible',display:e.style.display||'block'}),setInterval:cb=>s.interval=cb,setTimeout:cb=>s.timeouts.push(cb),Promise,WeakMap,Map,Set,Number,Math,String,JSON});
 for(const script of scripts)vm.runInContext(script,context);s.booted=true;
 s.root=document.getElementById('vnu-lecture-helper').shadowRoot;s.context=context;
 const mode=s.root.getElementById('continuous');if(mode&&!options.productionDefaults){mode.checked=options.continuous===true;mode.dispatchEvent(new window.Event('change'));}
 const recovery=s.root.getElementById('mute-recovery');if(recovery&&!options.productionDefaults)recovery.checked=options.muteRecovery===true;
 const visibility=s.root.getElementById('visible-mode');if(visibility&&!options.productionDefaults)visibility.checked=options.visibleMode===true;
 s.tick=async(ms=500)=>{
  if(ms<=5000 && s.index!==null && s.view==='content' && s.visible){
   const it=items[s.index];if((s.front||options.serverRequiresFocus===false)&&(it.type!=='video' || s.playing))s.serverSeconds[s.index]+=ms/1000;
   if(it.type==='video' && s.playing&&!s.freeze)s.time+=ms/1000;
  }
  s.clock+=ms;s.interval();await flush();
 };
 s.run=async(n=20)=>{for(let i=0;i<n;i++)await s.tick()};
 s.until=async(predicate,n=60)=>{for(let i=0;i<n&&!predicate();i++)await s.tick();assert.ok(predicate(),s.message())};
 s.message=()=>s.root.getElementById('status').textContent;
 s.metric=id=>s.root.getElementById(id).textContent;
 s.phase=()=>s.root.getElementById('engine').textContent;
 s.refresh=()=>s.root.getElementById('refresh').click();
 s.report=()=>vm.runInContext('VnuLms',context).progress(document,()=>true);
 s.resize=(width,height)=>{s.width=width;s.height=height;s.window.dispatchEvent(new s.window.Event('resize'));};
 return s;
}

module.exports={setup,item,notice,channel,reading,numbered,survey};
