const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom'),f=require('./lms-fixture.cjs');
const context=vm.createContext({Number,Set,JSON,String});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','lms.js'),'utf8'),context);
const L=vm.runInContext('VnuLms',context);
const visible=e=>{for(let n=e;n;n=n.parentElement)if(n.style.display==='none'||n.style.visibility==='hidden')return false;return true};
const dom=html=>parseHTML('<html><body>'+html+'</body></html>').document;
test('supplied td header and complete row decode reported minutes and status',()=>{
  const r=L.progress(dom(f.table()),visible);assert.equal(r.kind,'ready');assert.equal(r.videos.length,3);
  assert.equal(r.videos[0].status,'complete');assert.equal(r.videos[0].minutes,28.4);
  assert.equal(r.videos[0].requiredMinutes,5);assert.equal(r.videos[0].views,7);
});
test('first unfinished in table order wins, including partially learned video',()=>{
  const r=L.progress(dom(f.table(f.row(f.firstTitle,2.5)+f.row(f.secondTitle,0))),visible);
  const choice=L.firstPending(r.videos);assert.equal(choice.kind,'target');assert.equal(choice.item.title,f.firstTitle);
  assert.equal(choice.item.minutes,2.5);
});
test('an unfinished required reading precedes videos in the required item queue',()=>{
  const r=L.progress(dom(f.table(f.row('Bài đọc bắt buộc',0)+f.row(f.firstTitle,6,'Đã hoàn thành')+f.row(f.secondTitle))),visible);
  assert.equal(r.videos.length,3);assert.equal(r.items.length,4);
  assert.equal(L.firstPending(r.requiredItems).item.title,'Bài đọc bắt buộc');
});
test('incomplete is not confused with complete, regardless of icon class',()=>{
  const d=dom(f.table());d.querySelectorAll('tr')[3].lastElementChild.className='boundary-passed';
  const r=L.progress(d,visible);assert.equal(r.videos[1].status,'incomplete');
});
test('unknown status before an unfinished video blocks automatic skipping',()=>{
  const r=L.progress(dom(f.table(f.row(f.firstTitle,0,'Bị khóa')+f.row(f.secondTitle))),visible);
  const c=L.firstPending(r.videos);assert.equal(c.kind,'unknown');assert.equal(c.item.statusText,'Bị khóa');
});
test('zero remaining videos means all videos reported complete',()=>{
  const r=L.progress(dom(f.table(f.row(f.firstTitle,5,'Đã hoàn thành')+f.row(f.secondTitle,5,'Đã hoàn thành'))),visible);
  assert.equal(L.firstPending(r.videos).kind,'done');
});
test('decimal comma parses and unknown minutes stay null',()=>{
  const r=L.progress(dom(f.table(f.row(f.firstTitle,'2,5')+f.row(f.secondTitle,'---'))),visible);
  assert.equal(r.videos[1].minutes,2.5);assert.equal(r.videos[2].minutes,null);
});
test('unrelated or hidden tables do not count as course progress',()=>{
  const d=dom('<table><tr><td>Video: publicité</td></tr></table><div style="display:none">'+f.table()+'</div>');
  assert.equal(L.progress(d,visible).kind,'missing');
});
test('multiple visible progress tables stop as ambiguous',()=>{assert.equal(L.progress(dom(f.table()+f.table()),visible).kind,'ambiguous')});
test('duplicate titles in the same section stop only when that required item is next',()=>{
 const r=L.progress(dom(f.table(f.row(f.firstTitle)+f.row(f.firstTitle))),visible);
 assert.equal(r.kind,'ready');assert.equal(L.firstPending(r.requiredItems).kind,'ambiguous');
 assert.notEqual(r.items[1].key,r.items[2].key);
});
test('video row missing one column cannot be silently skipped',()=>{
  const d=dom(f.table());d.querySelectorAll('tr')[3].lastElementChild.remove();assert.equal(L.progress(d,visible).kind,'invalid');
});
test('supplied javascript anchor is clicked exactly once by exact title',()=>{
  const d=dom(f.observedLink+'<a href="javascript:void(0)">'+f.firstTitle+'</a>');let calls=0,other=0;
  d.querySelectorAll('a')[0].addEventListener('click',()=>calls++);d.querySelectorAll('a')[1].addEventListener('click',()=>other++);
  assert.equal(L.openItem(d,'Video: Giới thiệu chung về học phần',visible),'clicked');assert.equal(calls,1);assert.equal(other,0);
});
test('finished class alone never proves current video selection',()=>{assert.equal(L.selected(dom(f.observedLink),'Video: Giới thiệu chung về học phần',visible),false)});
test('normalization tolerates NBSP, spacing and decomposed Vietnamese',()=>{
  const d=dom(f.observedLink);const title='Video:\u00a0 Giới thiệu  chung về học phần'.normalize('NFD');
  assert.equal(L.openItem(d,title,visible),'clicked');
});
test('two matching visible links are not clicked',()=>{
  const d=dom(f.observedLink+f.observedLink);let calls=0;for(const a of d.querySelectorAll('a'))a.addEventListener('click',()=>calls++);
  assert.equal(L.openItem(d,'Video: Giới thiệu chung về học phần',visible),'ambiguous');assert.equal(calls,0);
});
test('disabled ancestor prevents video navigation',()=>{
  const d=dom('<li aria-disabled="true">'+f.observedLink+'</li>');assert.equal(L.openItem(d,'Video: Giới thiệu chung về học phần',visible),'disabled');
});
test('hidden lesson expands only with explicit aria-controls',()=>{
  const d=dom('<button aria-expanded="false" aria-controls="lesson">Bài 1</button><div id="lesson" style="display:none">'+f.observedLink+'</div>');let calls=0;
  d.querySelector('button').addEventListener('click',()=>{calls++;d.getElementById('lesson').style.display='block'});
  assert.equal(L.openItem(d,'Video: Giới thiệu chung về học phần',visible),'expanded');assert.equal(calls,1);
  assert.equal(L.openItem(d,'Video: Giới thiệu chung về học phần',visible),'clicked');
});
test('hidden lesson without known opener is reported instead of guessed click',()=>{
  const d=dom('<div style="display:none">'+f.observedLink+'</div>');assert.equal(L.openItem(d,'Video: Giới thiệu chung về học phần',visible),'hidden');
});
test('nested tab anchor keeps only innermost control',()=>{
  const d=dom('<li role="tab"><a href="javascript:void(0)">TIẾN TRÌNH HỌC TẬP</a></li>');let calls=0;d.querySelector('a').addEventListener('click',()=>calls++);
  assert.equal(L.tabs(d,'Tiến trình học tập',visible).length,1);assert.equal(L.tab(d,'Tiến trình học tập',visible,false),'clicked');assert.equal(calls,1);
});
test('course key rejects signin/list pages and preserves same course subroutes',()=>{
  assert.equal(L.courseKey(f.course),'7b351ce5-e2d3-4096-ae6d-09153c609a86');assert.equal(L.courseKey(f.course+'/noi-dung'),L.courseKey(f.course));
  assert.equal(L.courseKey('/signin'),null);assert.equal(L.courseKey('/learn/lop-hoc'),null);assert.equal(L.courseKey('/learn/test'),null);
});
test('plain Angular tab label bubbles to its parent handler when no semantic control exists',()=>{
 const d=dom('<div><span>NỘI DUNG</span></div>');let calls=0;d.querySelector('div').addEventListener('click',()=>calls++);
 assert.equal(L.tab(d,'Nội dung',visible,false),'clicked');assert.equal(calls,1);
});
test('duplicate plain labels cause no guessed tab clicks',()=>{
 const d=dom('<div><span>NỘI DUNG</span></div><div>NỘI DUNG</div>');let calls=0;
 for(const e of d.querySelectorAll('div'))e.addEventListener('click',()=>calls++);
 assert.equal(L.tab(d,'Nội dung',visible,false),'ambiguous');assert.equal(calls,0);
});
test('invalid huge numeric fields cannot become an infinite learning requirement',()=>{
 const r=L.progress(dom(f.table(f.row(f.firstTitle,'9'.repeat(400),'Chưa hoàn thành','9'.repeat(400)))),visible);
 assert.equal(r.videos[1].minutes,null);assert.equal(r.videos[1].requiredMinutes,null);
});

test('seven-cell folder rows supply the target section independently of reading activities',()=>{
 const group='<tr><td>📣Thông tin về học phần Nhà nước và pháp luật đại cương</td>'+ '<td></td>'.repeat(6)+'</tr>';
 const d=dom('<table>'+f.header+group+f.row('Bài đọc: Thông tin giảng viên',0)+f.row(f.firstTitle)+'</table>');
 assert.equal(L.progress(d,visible).videos[0].section,'📣Thông tin về học phần Nhà nước và pháp luật đại cương');
});
test('native LMS arrows expand the matching section before an unrelated earlier folder',()=>{
 const d=dom('<div id="tnContentList"><div class="__lesson-name-child"><span class="arrow"><i class="fa fa-chevron-down"></i></span><a>Bài khác</a></div><div class="__lesson-name-child"><span class="arrow"><i class="fa fa-chevron-down"></i></span><a>Thông tin học phần</a></div></div>');
 const arrows=[...d.querySelectorAll('.arrow')],clicked=[];arrows.forEach((e,i)=>e.addEventListener('click',()=>clicked.push(i)));
 assert.equal(L.openItem(d,f.firstTitle,visible,{section:'📣Thông tin học phần'}),'expanded');assert.deepEqual(clicked,[1]);
});
test('similar arrows outside the real LMS sidebar and expanded arrows are never clicked',()=>{
 const d=dom('<div class="__lesson-name-child"><span class="arrow"><i class="fa fa-chevron-down"></i></span><a>Outside</a></div><div id="tnContentList"><div class="__lesson-name-child"><span class="arrow"><i class="fa fa-chevron-up"></i></span><a>Already open</a></div></div>');
 let clicks=0;for(const a of d.querySelectorAll('.arrow'))a.addEventListener('click',()=>clicks++);
 assert.equal(L.openItem(d,f.firstTitle,visible),'missing');assert.equal(clicks,0);
});
test('disabled folder arrows cannot be used to open learning content',()=>{
 const d=dom('<div id="tnContentList"><div class="disabled __lesson-name-child"><span class="arrow"><i class="fa fa-chevron-down"></i></span><a>Locked</a></div></div>');
 assert.equal(L.collapsedFolders(d,visible).length,0);assert.equal(L.openItem(d,f.firstTitle,visible),'missing');
});
test('LMS content-selected marker proves only a unique current video link',()=>{
 const d=dom('<div class="__lesson-name content-selected">'+f.observedLink+'</div>');
 assert.equal(L.selected(d,'Video: Giới thiệu chung về học phần',visible),true);
});
