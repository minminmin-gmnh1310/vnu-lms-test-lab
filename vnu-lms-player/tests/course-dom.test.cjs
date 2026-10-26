// Runs the complete extension against supplied progress/link HTML. Native media,
// layout, focus, storage and server-reported progress are explicitly simulated.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom'),f=require('./lms-fixture.cjs');
const scripts=['controller.js','lms.js','queue.js','player.js'].map(name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8'));
const flush=()=>new Promise(setImmediate);
function setup(options={}) {
 const {window,document}=parseHTML(`<html><body><nav>
  <li role="tab"><a id="content-tab" href="javascript:void(0)">NỘI DUNG</a></li>
  <li role="tab"><a id="progress-tab" href="javascript:void(0)">TIẾN TRÌNH HỌC TẬP</a></li></nav>
  <section id="content-view"><aside><li>${f.observedLink}</li><li><a href="javascript:void(0)">${f.firstTitle}</a></li>
    <li><a href="javascript:void(0)">${f.secondTitle}</a></li></aside>
  <video _ngcontent-c11 autoplay class="fill-content-video" id="TNContentView" controls><source type="video/mp4" src="/intro.mp4"></video>
  <button id="next"><i class="fas fa-arrow-right"></i>&nbsp;Tiếp theo</button></section>
  <section id="progress-view" style="display:none">${f.table(options.rows)}</section></body></html>`);
 const s={document,window,clock:0,front:true,visible:true,path:options.path||f.course,playing:false,ended:false,time:0,ready:2,
  plays:[],opened:[],next:0,progressVisits:0,contentVisits:0,view:'content',timeouts:[],stored:[],getCallback:null,swaps:[]};
 Object.defineProperty(document,'baseURI',{value:'https://lms.vnu.edu.vn'+f.course});
 Object.defineProperty(document,'visibilityState',{get:()=>s.visible?'visible':'hidden'});document.hasFocus=()=>s.front;
 window.HTMLElement.prototype.getClientRects=function(){
  for(let n=this;n;n=n.parentElement)if(n.style.display==='none'||n.hasAttribute('hidden'))return [];
  return [{}];
 };
 const v=document.getElementById('TNContentView');Object.setPrototypeOf(v,window.HTMLVideoElement.prototype);
 Object.defineProperties(v,{
  paused:{get:()=>!s.playing},ended:{get:()=>s.ended},readyState:{get:()=>s.ready},
  currentTime:{get:()=>s.time,set:x=>{s.time=x;if(x===0)s.ended=false}}
 });
 v.currentSrc='https://lms.vnu.edu.vn/intro.mp4';v.duration=300;v.playbackRate=1;v.error=null;
 v.pause=()=>s.playing=false;v.play=()=>{s.plays.push(v.currentSrc);s.playing=true;return options.play?options.play(s):Promise.resolve()};
 const showView=view=>{s.view=view;document.getElementById('content-view').style.display=view==='content'?'block':'none';document.getElementById('progress-view').style.display=view==='progress'?'block':'none'};
 document.getElementById('content-tab').addEventListener('click',()=>{s.contentVisits++;showView('content')});
 document.getElementById('progress-tab').addEventListener('click',()=>{s.progressVisits++;showView('progress');options.onProgress?.(s)});
 document.getElementById('next').addEventListener('click',()=>s.next++);
 const anchors=[...document.querySelectorAll('aside a')];
 for(const [index,a] of anchors.entries())a.addEventListener('click',()=>{
  s.opened.push(index);
  if(options.selectedBeforeSwap){for(const other of anchors)other.classList.remove('active');a.classList.add('active');}
  if(options.noSwap)return;
  const swap=()=>{const src=['/intro.mp4','/first.mp4','/second.mp4'][index];v.querySelector('source').setAttribute('src',src);
    if(!options.staleResource)v.currentSrc='https://lms.vnu.edu.vn'+src;
    s.time=options.positions?.[index]??0;s.ended=false;
    if(options.selected){for(const other of anchors)other.classList.remove('active');a.classList.add('active');}
    if(options.nativeSelected){for(const other of anchors){other.parentElement.classList.add('__lesson-name');other.parentElement.classList.remove('content-selected');}a.parentElement.classList.add('content-selected');}
  };
  if(options.delaySwap)s.swaps.push(swap);else swap();
 });
 // Arrow attributes and their toggle-only behavior were checked in the public
 // LMS Angular template (3.c87cf984f231e960590e.chunk.js, 2026-10-06).
 // Render timing, surrounding wrappers and server state remain simulated.
 if(options.collapsed){
  const sidebar=document.querySelector('aside');sidebar.id='tnContentList';
  const lessons=[...sidebar.children];for(const li of lessons){li.firstElementChild.parentElement.className='__lesson-name';li.remove();}
  s.folderClicks=0;s.folderTitleClicks=0;
  const section=options.sectionTitle || 'Thông tin về học phần Nhà nước và pháp luật đại cương';
  document.querySelectorAll('#progress-table tr')[2].firstElementChild.textContent=section;
  const makeFolder=(parent,title,reveal)=>{
    const wrapper=document.createElement('div'),head=document.createElement('div');head.className='__lesson-name-child';
    const arrow=document.createElement('span');arrow.className='arrow';const icon=document.createElement('i');icon.className='fa fa-chevron-down';arrow.append(icon);
    const a=document.createElement('a');a.textContent=title;a.addEventListener('click',()=>s.folderTitleClicks++);
    head.append(arrow,a);wrapper.append(head);parent.append(wrapper);
    arrow.addEventListener('click',()=>{s.folderClicks++;
      const apply=()=>{icon.className='fa fa-chevron-up';reveal(wrapper);};
      if(options.folderIgnore)return;
      if(options.folderDelay)s.swaps.push(apply);else apply();
    });return arrow;
  };
  s.folderArrow=makeFolder(sidebar,section,parent=>options.nestedFolder
    ?makeFolder(parent,'Phần giới thiệu',node=>node.append(...lessons))
    :parent.append(...lessons));
 }
 const chrome=options.storage?{runtime:{lastError:null},storage:{local:{
  get:(defaults,callback)=>{s.getCallback=value=>callback({vnuLmsContinuous:options.continuous===true,vnuLmsMuteRecovery:options.muteRecovery===true,vnuLmsVisibleMode:false,...value});if(!options.delayedStorage)s.getCallback({vnuLmsAutoStart:options.auto!==false})},
  set:(values,callback)=>{s.stored.push({...values});callback()}
 }}}:undefined;
 const context=vm.createContext({document,window,chrome,location:{get pathname(){return s.path}},HTMLVideoElement:window.HTMLVideoElement,
  URL,performance:{now:()=>s.clock},setInterval:callback=>s.interval=callback,setTimeout:callback=>s.timeouts.push(callback),
  getComputedStyle:e=>({visibility:e.style.visibility||'visible',display:e.style.display||'block'}),Promise,WeakMap,Map,Set,Number,Math,String,JSON});
 for(const script of scripts)vm.runInContext(script,context);
 s.context=context;s.v=v;s.root=document.getElementById('vnu-lecture-helper').shadowRoot;s.anchors=anchors;
 const mode=s.root.getElementById('continuous');if(mode){mode.checked=options.continuous===true;mode.dispatchEvent(new window.Event('change'));}
 const recovery=s.root.getElementById('mute-recovery');if(recovery)recovery.checked=options.muteRecovery===true;
 const visibility=s.root.getElementById('visible-mode');if(visibility)visibility.checked=false;
 s.stored.length=0;
 s.tick=async(ms=500)=>{s.clock+=ms;s.interval();await flush()};
 s.run=async(count=20)=>{for(let i=0;i<count;i++)await s.tick()};
 s.until=async(predicate,count=50)=>{for(let i=0;i<count&&!predicate();i++)await s.tick();assert.ok(predicate(),'condition did not become true: '+s.message())};
 s.message=()=>s.root.getElementById('status').textContent;
 s.start=()=>{s.inGesture=true;s.root.getElementById('start').click();s.inGesture=false;};s.stop=()=>s.root.getElementById('stop').click();
 s.update=(index,minutes,status='Chưa hoàn thành')=>{const row=document.querySelectorAll('#progress-table tr')[index===1?3:4];row.children[4].textContent=String(minutes);row.children[6].textContent=status};
 s.finish=()=>{s.time=v.duration;s.ended=true;s.playing=false};
 return s;
}
test('opening course automatically skips completed intro and plays first unfinished video',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[1]);assert.equal(s.plays[0],'https://lms.vnu.edu.vn/first.mp4');
 assert.equal(s.next,0);assert.match(s.message(),/cấu trúc học phần/);
});
test('partially learned earlier video takes precedence over zero-minute later video',async()=>{
 const s=setup({rows:f.row(f.firstTitle,2.5)+f.row(f.secondTitle,0),positions:{1:37}});await s.until(()=>s.plays.length===1);
 assert.deepEqual(s.opened,[1]);assert.equal(s.time,37);assert.equal(s.v.playbackRate,1);
});
test('LMS confirmed completion chooses next unfinished video through menu',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.update(1,5,'Đã hoàn thành');s.finish();await s.until(()=>s.plays.length===2);
 assert.deepEqual(s.opened,[1,2]);assert.equal(s.plays[1],'https://lms.vnu.edu.vn/second.mp4');assert.equal(s.next,0);
});
test('all videos complete stops without claiming whole course completion',async()=>{
 const s=setup({rows:f.row(f.firstTitle,5,'Đã hoàn thành')+f.row(f.secondTitle,5,'Đã hoàn thành')});await s.run(5);
 assert.equal(s.plays.length,0);assert.equal(s.opened.length,0);assert.match(s.message(),/tất cả mục có sao đỏ/);assert.match(s.message(),/bài kiểm tra/);
});
test('playback alone never rewrites a reported incomplete status',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.finish();await s.run(140);
 assert.equal(s.document.querySelectorAll('#progress-table tr')[3].children[6].textContent,'Chưa hoàn thành');
 assert.equal(s.plays.length,1);assert.deepEqual(s.opened,[1]);assert.match(s.message(),/chưa ghi nhận thêm/);
 assert.ok(s.progressVisits>=2,'one real progress-tab refresh expected');
});
test('server update after a delay is accepted, without replaying completed video',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.finish();await s.run(10);s.update(1,5,'Đã hoàn thành');
 await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[1,2]);
});
test('real additional minutes below threshold allow another playback of same unfinished video',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.update(1,1);s.finish();await s.until(()=>s.plays.length===2,160);
 assert.deepEqual(s.opened,[1,1]);assert.equal(s.time,0);assert.equal(s.v.playbackRate,1);assert.equal(s.plays[0],s.plays[1]);
 s.update(1,5,'Đã hoàn thành');s.finish();await s.until(()=>s.plays.length===3);assert.deepEqual(s.opened,[1,1,2]);
});
test('sufficient recorded minutes but incomplete status pauses for LMS conditions',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.update(1,5);s.finish();await s.run(140);
 assert.equal(s.plays.length,1);assert.match(s.message(),/dù đủ ngưỡng phút/);
});
test('stale currentSrc is not played until the declared new resource loads',async()=>{
 const s=setup({staleResource:true});await s.run(14);assert.deepEqual(s.opened,[1]);assert.equal(s.plays.length,0);
 s.v.currentSrc='https://lms.vnu.edu.vn/first.mp4';await s.until(()=>s.plays.length===1);
});
test('delayed target source never plays the old completed intro',async()=>{
 const s=setup({delaySwap:true});await s.run(20);assert.deepEqual(s.opened,[1]);assert.equal(s.plays.length,0);
 s.swaps.shift()();await s.until(()=>s.plays.length===1);assert.equal(s.plays[0],'https://lms.vnu.edu.vn/first.mp4');
});
test('unverified unchanged source times out with diagnostic advice',async()=>{
 const s=setup({noSwap:true});await s.run(12);await s.tick(61000);
 assert.equal(s.plays.length,0);assert.match(s.message(),/Chưa xác nhận được đúng nội dung/);
});
test('already open unfinished video can be identified by explicit selected marker',async()=>{
 const s=setup({noSwap:true});s.v.querySelector('source').setAttribute('src','/first.mp4');s.v.currentSrc='https://lms.vnu.edu.vn/first.mp4';
 s.anchors[1].setAttribute('aria-current','page');await s.until(()=>s.plays.length===1);assert.equal(s.plays[0],s.v.currentSrc);
});
test('unknown status of earliest video blocks skipping to next one',async()=>{
 const s=setup({rows:f.row(f.firstTitle,0,'Bị khóa')+f.row(f.secondTitle)});await s.run(6);
 assert.equal(s.plays.length,0);assert.equal(s.opened.length,0);assert.match(s.message(),/Chưa xác định được trạng thái/);
});
test('disabled first unfinished menu item blocks navigation',async()=>{
 const s=setup();s.anchors[1].parentElement.setAttribute('aria-disabled','true');await s.run(15);
 assert.equal(s.plays.length,0);assert.equal(s.opened.length,0);assert.match(s.message(),/đang bị khóa/);
});
test('ambiguous matching titles in menu cause no clicks',async()=>{
 const s=setup();s.anchors[1].parentElement.appendChild(s.anchors[1].cloneNode(true));await s.run(15);
 assert.equal(s.opened.length,0);assert.match(s.message(),/trùng tên/);
});
test('hidden lesson without declared opener asks for expanding the lesson',async()=>{
 const s=setup();s.anchors[1].parentElement.style.display='none';await s.run(15);
 assert.equal(s.opened.length,0);assert.match(s.message(),/Mở rộng mục/);
});
test('scanning does not navigate while LMS loses focus; foreground resumes selection',async()=>{
 const s=setup();s.front=false;await s.run(140);assert.equal(s.opened.length,0);assert.equal(s.plays.length,0);
 s.front=true;await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[1]);
});
test('course playback automatically pauses away and resumes on return',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.front=false;await s.tick();assert.equal(s.playing,false);
 await s.tick(600000);s.front=true;await s.tick();assert.equal(s.playing,true);assert.equal(s.plays.length,2);assert.deepEqual(s.opened,[1]);
});
test('manual native Pause is respected in course mode',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.v.pause();await s.run(10);
 assert.equal(s.playing,false);assert.equal(s.plays.length,1);assert.match(s.message(),/tạm dừng/);
});
test('Stop keeps current course stopped across later ticks',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.stop();await s.run(20);
 assert.equal(s.playing,false);assert.equal(s.plays.length,1);assert.equal(s.root.getElementById('start').disabled,false);
});
test('Stop then Start reselects and resumes the same known unfinished video',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.stop();await s.tick();s.start();
 await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[1,1]);assert.equal(s.playing,true);
});
test('pending play promise cannot revive a queue stopped by the user',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const s=setup({play:()=>pending});
 await s.until(()=>s.plays.length===1);s.stop();resolve();await flush();await s.run(5);assert.equal(s.playing,false);
});
test('completion review excludes time away from LMS and still waits for real update',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.finish();await s.tick();s.front=false;await s.tick();
 await s.tick(600000);s.front=true;await s.tick();assert.match(s.message(),/Đang đọc|đang chờ LMS/);assert.equal(s.plays.length,1);
 s.update(1,5,'Đã hoàn thành');await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[1,2]);
});
test('changing to a new course cancels old player before automatic selection',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.update(1,5,'Đã hoàn thành');
 s.path='/learn/lop-hoc/chi-tiet/11111111-1111-1111-1111-111111111111';await s.tick();assert.equal(s.playing,false);
 await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[1,2]);assert.equal(s.plays[1],'https://lms.vnu.edu.vn/second.mp4');
});
test('unknown recorded minutes never trigger an endless replay of a short video',async()=>{
 const s=setup({rows:f.row(f.firstTitle,'---')+f.row(f.secondTitle)});await s.until(()=>s.plays.length===1);
 s.update(1,1);s.finish();await s.run(140);assert.equal(s.plays.length,1);assert.match(s.message(),/Không đủ dữ liệu phút học/);
});
test('explicit lesson expander makes hidden first unfinished video reachable',async()=>{
 const s=setup();const li=s.anchors[1].parentElement;li.id='lesson-one';li.style.display='none';
 const button=s.document.createElement('button');button.textContent='Bài 1';button.setAttribute('aria-controls','lesson-one');button.setAttribute('aria-expanded','false');
 button.addEventListener('click',()=>{li.style.display='block';button.setAttribute('aria-expanded','true')});li.parentElement.prepend(button);
 await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[1]);
});
test('empty content after choosing a video stops without clicking Next or a nonvideo page',async()=>{
 const s=setup({noSwap:true});await s.run(10);s.v.remove();await s.tick(61000);
 assert.equal(s.plays.length,0);assert.equal(s.next,0);assert.match(s.message(),/Chưa xác nhận được đúng nội dung/);
});
test('autoplay rejection remains actionable and is not automatically retried',async()=>{
 const s=setup({play:()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}))});await s.run(20);
 assert.equal(s.plays.length,1);assert.equal(s.playing,false);assert.match(s.message(),/chặn tự phát/);
});
test('manual source change stops queue instead of treating another video as its target',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.v.querySelector('source').setAttribute('src','/other.mp4');s.v.currentSrc='https://lms.vnu.edu.vn/other.mp4';
 await s.tick();assert.equal(s.playing,false);assert.match(s.message(),/chuyển sang bài khác/);
});
test('signin route does not auto-run; opening a course in Angular SPA does',async()=>{
 const s=setup({path:'/signin'});await s.run(5);assert.equal(s.progressVisits,0);assert.equal(s.root.host.style.display,'none');
 s.path=f.course;await s.until(()=>s.plays.length===1);
});
test('session expiry pauses playback and hides panel',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.path='/signin';await s.tick();assert.equal(s.playing,false);assert.equal(s.root.host.style.display,'none');
});
test('saved auto-start disabled prevents automatic selection and Start still works',async()=>{
 const s=setup({storage:true,auto:false});await s.run(10);assert.equal(s.progressVisits,0);assert.equal(s.plays.length,0);
 assert.equal(s.root.getElementById('auto-start').checked,false);s.start();await s.until(()=>s.plays.length===1);
});
test('preference changes persist a boolean only and stop automatic playback',async()=>{
 const s=setup({storage:true});await s.until(()=>s.plays.length===1);const input=s.root.getElementById('auto-start');input.checked=false;
 input.dispatchEvent(new s.window.Event('change'));await s.run(5);assert.equal(s.playing,false);assert.deepEqual(s.stored,[{vnuLmsAutoStart:false}]);
 input.checked=true;input.dispatchEvent(new s.window.Event('change'));await s.until(()=>s.plays.length===2);
});
test('late preference read cannot start a second run after manual Start',async()=>{
 const s=setup({storage:true,delayedStorage:true});await s.run(5);assert.equal(s.progressVisits,0);s.start();await s.until(()=>s.plays.length===1);
 s.getCallback({vnuLmsAutoStart:true});await s.run(10);assert.equal(s.plays.length,1);assert.deepEqual(s.opened,[1]);
});
test('diagnostic reports target and recorded minutes without a media URL or credentials',async()=>{
 const s=setup({rows:f.row(f.firstTitle,2.5)+f.row(f.secondTitle)});await s.until(()=>s.plays.length===1);
 s.root.getElementById('diagnose').click();const text=s.root.getElementById('diagnostic').textContent;
 assert.match(text,/Phút LMS lúc chọn: 2.5/);assert.match(text,/Ngưỡng tối thiểu: 5/);assert.doesNotMatch(text,/http|cookie|token|first\.mp4|password/i);
});
test('newly selected sidebar marker does not authorize playing a stale loaded source',async()=>{
 const s=setup({delaySwap:true,selectedBeforeSwap:true});await s.run(20);
 assert.deepEqual(s.opened,[1]);assert.equal(s.plays.length,0,'old intro must stay paused until target source arrives');
 s.swaps.shift()();await s.until(()=>s.plays.length===1);assert.equal(s.plays[0],'https://lms.vnu.edu.vn/first.mp4');
});
test('temporarily hidden old video cannot lose the source baseline during target selection',async()=>{
 const s=setup({delaySwap:true});await s.until(()=>s.view==='content'&&s.contentVisits===1);
 s.v.style.display='none';await s.until(()=>s.opened.length===1);s.v.style.display='block';await s.run(8);
 assert.equal(s.plays.length,0,'old intro must not be accepted just because it was hidden at click time');
 s.swaps.shift()();await s.until(()=>s.plays.length===1);assert.equal(s.plays[0],'https://lms.vnu.edu.vn/first.mp4');
});
test('native autoplay that revives a hidden video during progress scan is paused',async()=>{
 const s=setup({rows:f.row(f.firstTitle,0,'Bị khóa')+f.row(f.secondTitle)});
 assert.equal(s.view,'progress');s.playing=true;await s.tick();assert.equal(s.playing,false);
});
test('continuously changing minutes do not block selecting the first unfinished video',async()=>{
 const s=setup();for(let i=0;i<15;i++){s.update(1,i/100);await s.tick()}
 assert.equal(s.plays.length,1);assert.deepEqual(s.opened,[1]);
});
test('restoring a course from browser back-forward cache restarts auto selection',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.window.dispatchEvent(new s.window.Event('pagehide'));assert.equal(s.playing,false);
 const event=new s.window.Event('pageshow');event.persisted=true;s.window.dispatchEvent(event);await s.until(()=>s.plays.length===2);
});
test('Stop during navigation prevents late native autoplay from restarting playback',async()=>{
 const s=setup({delaySwap:true});await s.until(()=>s.opened.length===1);s.stop();s.swaps.shift()();
 s.playing=true;s.v.dispatchEvent(new s.window.Event('play'));await s.run(3);
 assert.equal(s.playing,false);assert.equal(s.plays.length,0);assert.match(s.message(),/Đã dừng/);
});
test('native autoplay while away is paused even if the queued video is hidden',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.front=false;await s.tick();
 const n=s.document.createElement('video');Object.setPrototypeOf(n,s.window.HTMLVideoElement.prototype);n.id='TNContentView';n.style.display='none';
 const source=s.document.createElement('source');source.setAttribute('src','/first.mp4');n.append(source);
 let playing=true;Object.defineProperty(n,'paused',{get:()=>!playing});n.pause=()=>playing=false;
 n.currentSrc='https://lms.vnu.edu.vn/first.mp4';n.readyState=2;s.v.replaceWith(n);
 await s.tick();assert.equal(playing,false);
});
test('manual Play after Stop is allowed following trusted native-player interaction',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.stop();
 const input=new s.window.Event('pointerdown',{bubbles:true});Object.defineProperty(input,'isTrusted',{value:true});s.v.dispatchEvent(input);
 s.playing=true;s.v.dispatchEvent(new s.window.Event('play'));await s.tick();assert.equal(s.playing,true);
 assert.equal(s.plays.length,1,'automatic queue must remain stopped');
});
test('synthetic player interaction does not cancel the late-autoplay hold',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.stop();s.v.dispatchEvent(new s.window.Event('pointerdown',{bubbles:true}));
 s.playing=true;s.v.dispatchEvent(new s.window.Event('play'));await s.tick();assert.equal(s.playing,false);
});
test('trusted manual choice of another lecture yields playback control to the user',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);
 const input=new s.window.Event('pointerdown',{bubbles:true});Object.defineProperty(input,'isTrusted',{value:true});s.anchors[2].dispatchEvent(input);s.anchors[2].click();
 s.playing=true;s.v.dispatchEvent(new s.window.Event('play'));await s.run(5);
 assert.equal(s.playing,true);assert.equal(s.plays.length,1);assert.deepEqual(s.opened,[1,2]);assert.match(s.message(),/chọn bài thủ công/);
});
test('completion reported after thirty seconds still advances the course automatically',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.finish();await s.run(60);
 s.update(1,5,'Đã hoàn thành');await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[1,2]);
});
test('missing minimum condition is not falsely reported as enough recorded minutes',async()=>{
 const s=setup();s.document.querySelectorAll('#progress-table tr')[3].children[1].textContent='Điều kiện khác';
 await s.until(()=>s.plays.length===1);s.update(1,1);s.finish();await s.run(140);
 assert.equal(s.plays.length,1);assert.match(s.message(),/Chưa đọc được ngưỡng thời gian/);assert.doesNotMatch(s.message(),/đủ ngưỡng/);
});

test('collapsed Angular folders mount missing video links and open first unfinished lecture',async()=>{
 const s=setup({collapsed:true});await s.until(()=>s.plays.length===1);
 assert.deepEqual(s.opened,[1]);assert.equal(s.folderClicks,1);assert.equal(s.folderTitleClicks,0);
 assert.equal(s.plays[0],'https://lms.vnu.edu.vn/first.mp4');assert.equal(s.next,0);
});
test('nested collapsed Angular folders expand one arrow at a time',async()=>{
 const s=setup({collapsed:true,nestedFolder:true});await s.until(()=>s.plays.length===1);
 assert.equal(s.folderClicks,2);assert.equal(s.folderTitleClicks,0);assert.deepEqual(s.opened,[1]);
});
test('late folder mounting is awaited without closing or repeatedly clicking it',async()=>{
 const s=setup({collapsed:true,folderDelay:true});await s.until(()=>s.folderClicks===1);await s.run(4);
 assert.equal(s.folderClicks,1);assert.equal(s.plays.length,0);s.swaps.shift()();await s.until(()=>s.plays.length===1);
 assert.equal(s.folderClicks,1);assert.deepEqual(s.opened,[1]);
});
test('time away from LMS does not expire a pending folder expansion',async()=>{
 const s=setup({collapsed:true,folderDelay:true});await s.until(()=>s.folderClicks===1);
 s.front=false;await s.tick();await s.tick(120000);s.front=true;await s.tick();
 assert.equal(s.root.getElementById('start').disabled,true);assert.equal(s.folderClicks,1);
 s.swaps.shift()();await s.until(()=>s.plays.length===1);assert.deepEqual(s.opened,[1]);
});
test('unresponsive folder has a specific error after five seconds and never plays old intro',async()=>{
 const s=setup({collapsed:true,folderIgnore:true});await s.run(25);
 assert.equal(s.folderClicks,1);assert.equal(s.plays.length,0);assert.match(s.message(),/chưa mở sau 5 giây/);
 assert.equal(s.root.getElementById('start').disabled,false);
});
test('returning focus while menu is still missing replaces stale waiting message',async()=>{
 const s=setup({noSwap:true});for(const a of s.anchors)a.remove();await s.run(7);
 s.front=false;await s.tick();assert.match(s.message(),/quay lại tab/);
 s.front=true;await s.tick();assert.doesNotMatch(s.message(),/quay lại tab/);assert.match(s.message(),/Đang tìm liên kết/);
 assert.match(s.root.getElementById('engine').textContent,/ở phía trước/);
 await s.run(35);assert.match(s.message(),/Chưa tìm thấy liên kết/);assert.equal(s.plays.length,0);
});
test('timer shows required, LMS minutes, remaining and separate local estimate',async()=>{
 const s=setup({rows:f.row(f.firstTitle,2.5)+f.row(f.secondTitle)});await s.until(()=>s.plays.length===1);
 const value=id=>s.root.getElementById(id).textContent;
 assert.equal(value('required'),'5:00');assert.equal(value('recorded'),'2:30');assert.equal(value('remaining'),'2:30');
 assert.equal(value('watched'),'0:00');assert.equal(value('estimated'),'2:30');
 for(let i=0;i<20;i++){s.time+=0.5;await s.tick();}
 assert.equal(value('watched'),'0:10');assert.equal(value('estimated'),'2:20');assert.equal(value('remaining'),'2:30');
 assert.match(value('lms-read'),/chưa được LMS xác nhận/);
});
test('buffering and manual pause do not make the local clock advance',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);await s.run(20);
 assert.equal(s.root.getElementById('watched').textContent,'0:00');assert.match(s.message(),/Video chưa tiến thêm/);
 s.v.pause();await s.run(10);assert.equal(s.root.getElementById('watched').textContent,'0:00');assert.match(s.message(),/tạm dừng/);
});
test('hidden or unfocused time does not reduce the remaining estimate',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.time+=1;await s.tick(1000);
 const before=s.root.getElementById('estimated').textContent;s.front=false;await s.tick();s.time+=120;await s.tick(120000);
 assert.equal(s.root.getElementById('estimated').textContent,before);assert.match(s.root.getElementById('engine').textContent,/mất focus/);
 s.front=true;await s.tick();assert.equal(s.root.getElementById('estimated').textContent,before);
});
test('unknown required/recorded times are shown as unknown instead of zero',async()=>{
 const s=setup({rows:f.row(f.firstTitle,'---','Chưa hoàn thành','---')+f.row(f.secondTitle)});await s.until(()=>s.plays.length===1);
 for(const id of ['required','recorded','remaining','estimated'])assert.equal(s.root.getElementById(id).textContent,'--:--');
});
test('real increase in LMS minutes removes double counting from the estimate',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);
 for(let i=0;i<120;i++){s.time+=0.5;await s.tick()}
 assert.equal(s.root.getElementById('watched').textContent,'1:00');assert.equal(s.root.getElementById('estimated').textContent,'4:00');
 s.update(1,1);s.finish();await s.until(()=>s.view==='progress');await s.tick();
 assert.equal(s.root.getElementById('recorded').textContent,'1:00');assert.equal(s.root.getElementById('remaining').textContent,'4:00');
 assert.equal(s.root.getElementById('estimated').textContent,'4:00');
});
test('a countdown reaching zero cannot mark a video complete or click another lesson',async()=>{
 const s=setup({rows:f.row(f.firstTitle,0,'Chưa hoàn thành',0.05)+f.row(f.secondTitle)});await s.until(()=>s.plays.length===1);
 for(let i=0;i<8;i++){s.time+=0.5;await s.tick()}
 assert.equal(s.root.getElementById('estimated').textContent,'0:00');assert.equal(s.root.getElementById('remaining').textContent,'0:03');
 assert.match(s.root.getElementById('lms-read').textContent,/vẫn chờ trạng thái LMS/);assert.deepEqual(s.opened,[1]);
 assert.equal(s.document.querySelectorAll('#progress-table tr')[3].lastElementChild.textContent,'Chưa hoàn thành');
});
test('Stop freezes local time while preserving latest LMS values',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.time+=1;await s.tick(1000);s.stop();s.time+=2;await s.run(10);
 assert.equal(s.root.getElementById('watched').textContent,'0:01');assert.equal(s.root.getElementById('recorded').textContent,'0:00');
});

test('manual LMS reread updates real minutes and resumes a verified selected video without reloading',async()=>{
 const s=setup({nativeSelected:true,positions:{1:37}});await s.until(()=>s.plays.length===1);
 s.update(1,2);s.root.getElementById('refresh').click();assert.equal(s.playing,false);
 await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[1]);assert.equal(s.time,37);
 assert.equal(s.root.getElementById('recorded').textContent,'2:00');assert.equal(s.root.getElementById('remaining').textContent,'3:00');
});
test('reread follows an actual completion update rather than local estimate',async()=>{
 const s=setup({nativeSelected:true});await s.until(()=>s.plays.length===1);
 s.update(1,5,'Đã hoàn thành');s.root.getElementById('refresh').click();await s.until(()=>s.plays.length===2);
 assert.deepEqual(s.opened,[1,2]);assert.equal(s.root.getElementById('recorded').textContent,'0:00');
});
test('forward seeking is excluded from local watched time and remaining estimate',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.time=200;await s.tick();
 assert.equal(s.root.getElementById('watched').textContent,'0:00');assert.equal(s.root.getElementById('estimated').textContent,'5:00');
 s.time+=0.5;await s.tick();s.time+=0.5;await s.tick();assert.equal(s.root.getElementById('watched').textContent,'0:01');
});
test('reading LMS remains disabled during selection and after Stop',async()=>{
 const s=setup({collapsed:true,folderIgnore:true});assert.equal(s.root.getElementById('refresh').disabled,true);
 await s.run(25);assert.equal(s.root.getElementById('refresh').disabled,true);s.stop();assert.equal(s.root.getElementById('refresh').disabled,true);
});

test('a long sleep or scheduling gap cannot be counted as confirmed local playback',async()=>{
 const s=setup();await s.until(()=>s.plays.length===1);s.time+=120;await s.tick(120000);
 assert.equal(s.root.getElementById('watched').textContent,'0:00');assert.equal(s.root.getElementById('estimated').textContent,'5:00');
 // The gap triggers a real progress reread, not fabricated playback seconds.
 await s.until(()=>s.progressVisits===2);await s.until(()=>s.playing);
 s.time+=1;await s.tick(1000);assert.equal(s.root.getElementById('watched').textContent,'0:01');
});
test('source reloads for a different course clear old lesson and timer data',async()=>{
 const s=setup({storage:true});await s.until(()=>s.plays.length===1);s.time+=10;await s.tick(1000);
 const input=s.root.getElementById('auto-start');input.checked=false;input.dispatchEvent(new s.window.Event('change'));
 s.path='/learn/lop-hoc/chi-tiet/11111111-1111-1111-1111-111111111111';await s.tick();
 assert.equal(s.root.getElementById('required').textContent,'--:--');assert.equal(s.root.getElementById('watched').textContent,'0:00');
 assert.doesNotMatch(s.root.getElementById('lesson').textContent,/cấu trúc học phần/);
});

const gestureOnly=s=>s.inGesture?Promise.resolve():Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));
test('blocked autoplay stays armed at zero and offers one-click play without rescanning',async()=>{
 const s=setup({play:gestureOnly,nativeSelected:true});await s.run(20);
 assert.equal(s.plays.length,1);assert.equal(s.playing,false);assert.equal(s.root.getElementById('watched').textContent,'0:00');
 const label=s.root.getElementById('start').textContent,enabled=!s.root.getElementById('start').disabled;
 const engine=s.root.getElementById('engine').textContent;
 const visits=s.progressVisits;s.start();assert.equal(s.plays.length,2,'play() must be called synchronously inside click');
 await s.tick();assert.equal(s.playing,true);assert.equal(s.progressVisits,visits);assert.deepEqual(s.opened,[1]);
 assert.equal(label,'Phát video này');assert.equal(enabled,true);assert.match(engine,/Chờ bạn bấm Play/);
 s.time+=1;await s.tick(1000);assert.equal(s.root.getElementById('watched').textContent,'0:01');
});
test('native Play after autoplay blocking is adopted without a second play call',async()=>{
 const s=setup({play:gestureOnly,nativeSelected:true});await s.run(20);
 s.playing=true;await s.tick();assert.equal(s.playing,true);assert.equal(s.plays.length,1);assert.deepEqual(s.opened,[1]);
 s.time+=2;await s.tick(2000);assert.equal(s.root.getElementById('watched').textContent,'0:02');
});
test('five minutes waiting on blocked autoplay cannot count as watched time or trigger a checkpoint',async()=>{
 const s=setup({play:gestureOnly});await s.run(650);
 assert.equal(s.plays.length,1);assert.equal(s.progressVisits,1);assert.equal(s.root.getElementById('watched').textContent,'0:00');
 assert.equal(s.root.getElementById('estimated').textContent,'5:00');assert.equal(s.root.getElementById('start').textContent,'Phát video này');
 assert.match(s.root.getElementById('lms-read').textContent,/tuổi dữ liệu, không phải phút đã xem/);
});
test('Stop cancels the armed autoplay state and prevents late native autoplay',async()=>{
 const s=setup({play:gestureOnly});await s.run(20);s.stop();s.playing=true;await s.tick();
 assert.equal(s.playing,false);assert.equal(s.root.getElementById('start').textContent,'Bắt đầu');
 assert.equal(s.root.getElementById('stop').disabled,true);
});
test('manual LMS read works while waiting for Play and does not retry blocked autoplay',async()=>{
 const s=setup({play:gestureOnly,nativeSelected:true});await s.run(20);assert.equal(s.root.getElementById('refresh').disabled,false);
 s.root.getElementById('refresh').click();await s.until(()=>s.view==='content');await s.run(10);
 assert.equal(s.plays.length,1);assert.equal(s.root.getElementById('start').textContent,'Phát video này');
});
test('observed minute triggers an automatic actual progress-tab reread before a long video ends',async()=>{
 const s=setup({nativeSelected:true,onProgress:s=>{if(s.progressVisits>1)s.update(1,1)}});s.v.duration=1466;
 await s.until(()=>s.plays.length===1);for(let i=0;i<120;i++){s.time+=0.5;await s.tick();}
 await s.until(()=>s.progressVisits===2);await s.until(()=>s.plays.length===2);
 assert.equal(s.root.getElementById('recorded').textContent,'1:00');assert.equal(s.root.getElementById('remaining').textContent,'4:00');
 assert.deepEqual(s.opened,[1]);assert.equal(s.ended,false);assert.match(s.root.getElementById('lms-read').textContent,/Tự đọc lại sau/);
});
test('five actual watched minutes and server completion advance without waiting for 24-minute video end',async()=>{
 const s=setup({nativeSelected:true,onProgress:s=>{
  if(s.progressVisits>1 && s.v.currentSrc.endsWith('/first.mp4')){
   const m=Math.floor(s.time/60);s.update(1,m,m>=5?'Đã hoàn thành':'Chưa hoàn thành');
  }
 }});s.v.duration=1466;await s.until(()=>s.plays.length===1);
 for(let i=0;i<720 && !s.opened.includes(2);i++){if(s.playing)s.time+=0.5;await s.tick();}
 assert.deepEqual(s.opened,[1,2]);assert.equal(s.document.querySelectorAll('#progress-table tr')[3].lastElementChild.textContent,'Đã hoàn thành');
 assert.equal(s.next,0);assert.equal(s.ended,false);
});
test('local threshold with unchanged LMS data neither marks completion nor causes rapid reread loops',async()=>{
 const s=setup({nativeSelected:true,rows:f.row(f.firstTitle,0,'Chưa hoàn thành',0.05)+f.row(f.secondTitle)});
 await s.until(()=>s.plays.length===1);for(let i=0;i<8;i++){if(s.playing)s.time+=0.5;await s.tick()}
 await s.until(()=>s.plays.length===2);const visits=s.progressVisits;await s.run(12);
 assert.equal(s.progressVisits,visits);assert.deepEqual(s.opened,[1]);assert.equal(s.root.getElementById('remaining').textContent,'0:03');
 assert.equal(s.root.getElementById('lms-state').textContent,'Trạng thái từ LMS: Chưa hoàn thành');
});
test('manual Pause and time away never advance an automatic checkpoint deadline',async()=>{
 const s=setup({nativeSelected:true});await s.until(()=>s.plays.length===1);
 for(let i=0;i<110;i++){s.time+=0.5;await s.tick()}
 s.v.pause();await s.run(30);assert.equal(s.progressVisits,1);
 s.front=false;await s.tick(120000);s.front=true;await s.tick();assert.equal(s.progressVisits,1);
 s.playing=true;await s.tick(); // Prime a playing sample; the paused interval cannot count.
 for(let i=0;i<10;i++){s.time+=0.5;await s.tick()}
 await s.until(()=>s.progressVisits===2);assert.equal(s.root.getElementById('watched').textContent,'1:00');
});
test('autoplay blocking after a timed reread keeps accumulated time and permits another direct gesture',async()=>{
 const s=setup({nativeSelected:true,play:gestureOnly});s.v.duration=1466;
 await s.run(20);s.start();await s.tick();
 for(let i=0;i<120;i++){s.time+=0.5;await s.tick()}
 await s.until(()=>s.plays.length===3 && s.root.getElementById('start').textContent==='Phát video này');
 assert.equal(s.root.getElementById('watched').textContent,'1:00');assert.deepEqual(s.opened,[1]);
 const visits=s.progressVisits;s.start();assert.equal(s.plays.length,4);await s.tick();
 assert.equal(s.playing,true);assert.equal(s.progressVisits,visits);assert.equal(s.root.getElementById('watched').textContent,'1:00');
 s.time+=1;await s.tick(1000);assert.equal(s.root.getElementById('watched').textContent,'1:01');
});
test('a partly credited lesson is reread at its remaining threshold before the next minute',async()=>{
 const s=setup({nativeSelected:true,rows:f.row(f.firstTitle,4.75)+f.row(f.secondTitle),onProgress:s=>{
  if(s.progressVisits>1)s.update(1,5,'Đã hoàn thành');
 }});s.v.duration=1466;await s.until(()=>s.plays.length===1);
 for(let i=0;i<29;i++){s.time+=0.5;await s.tick()}
 assert.equal(s.progressVisits,1);s.time+=0.5;await s.tick();
 await s.until(()=>s.plays.length===2);assert.deepEqual(s.opened,[1,2]);
 assert.equal(s.progressVisits,2);assert.equal(s.ended,false);
});
