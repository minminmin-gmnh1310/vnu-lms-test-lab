// Regressions grounded in the saved HTML: native folder wrappers, repeated
// titles, nested course span and role=tab. Content and layout are simulated.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom'),f=require('./lms-fixture.cjs');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','lms.js'),'utf8'),c);
const L=vm.runInContext('VnuLms',c),dom=html=>parseHTML('<html><body>'+html+'</body></html>').document;
const visible=e=>{for(let n=e;n;n=n.parentElement)if(n.style.display==='none')return false;return true};
const duplicate='Hoạt động 1: Thảo luận về nội dung bài học';
const folderRow=title=>'<tr><td>'+title+'</td>'+'<td></td>'.repeat(6)+'</tr>';
const group=(title,body,open=true)=>`<div class="class-lesson-child"><div><div class="__lesson-name-child"><span class="arrow"><i class="fa fa-chevron-${open?'up':'down'}"></i></span><a>${title}</a></div><div style="border-bottom:#ccc solid 1px"></div>${body}</div></div>`;
const leaf=(title,id,selected=false)=>`<div class="class-lesson"><div><div class="__lesson-name${selected?' content-selected':''}"><a id="${id}" href="javascript:void(0)">${title}<span class="content-required">&nbsp;</span></a></div></div></div>`;
const options={section:'5.5 Hoạt động học tập',titleDuplicate:true};
const head=(title,course='Môn kiểm thử')=>`<div class="headcontent row"><div class="col-md-10"><span id="tnContentButton"><span><i class="fa fa-outdent"></i></span></span><span>${title}<span>(${course})</span></span></div></div>`;
test('unrelated optional duplicates do not block the first mandatory notice',()=>{
 const optional=f.row('Học liệu tuỳ chọn').replace('<span class="content-required">&nbsp;</span>','');
 const d=dom('<table>'+f.header+f.row('Thông báo bắt buộc',0)+optional+optional+'</table>');
 const r=L.progress(d,visible);assert.equal(r.kind,'ready');assert.equal(L.firstPending(r.requiredItems).item.title,'Thông báo bắt buộc');
});
test('a later same-section ambiguity does not prevent earlier required content',()=>{
 const r=L.progress(dom('<table>'+f.header+f.row('Thông báo bắt buộc')+f.row(duplicate)+f.row(duplicate)+'</table>'),visible);
 assert.equal(r.kind,'ready');assert.equal(L.firstPending(r.requiredItems).item.title,'Thông báo bắt buộc');
 r.requiredItems[0].status='complete';assert.equal(L.firstPending(r.requiredItems).kind,'ambiguous');
});
test('identical lesson names in different sections have separate stable report identities',()=>{
 const r=L.progress(dom('<table>'+f.header+folderRow('1.5 Hoạt động học tập')+f.row(duplicate,1,'Đã hoàn thành')+folderRow(options.section)+f.row(duplicate,0.3)+'</table>'),visible);
 assert.equal(r.kind,'ready');assert.ok(r.items.every(it=>it.titleDuplicate&&!it.ambiguous));
 assert.notEqual(r.items[0].key,r.items[1].key);assert.equal(L.firstPending(r.requiredItems).item.section,options.section);
 assert.equal(r.items[1].minutes,0.3);assert.equal(r.items[0].kind,'interactive');
});
test('native nested folder scopes select the second duplicate rather than the first',()=>{
 const d=dom('<div id="tnContentList">'+group('Bài 1',group('1.5 Hoạt động học tập',leaf(duplicate,'wrong')))+group('Bài 5',group(options.section,leaf(duplicate,'right')))+'</div>');
 const clicks=[];for(const a of d.querySelectorAll('a[href]'))a.addEventListener('click',()=>clicks.push(a.id));
 assert.equal(L.openItem(d,duplicate,visible,options),'clicked');assert.deepEqual(clicks,['right']);
});
test('the only rendered duplicate in the wrong section is never clicked',()=>{
 const d=dom('<div id="tnContentList">'+group('1.5 Hoạt động học tập',leaf(duplicate,'wrong'))+group(options.section,'',false)+'</div>');
 let wrong=0,expanded=0;d.getElementById('wrong').addEventListener('click',()=>wrong++);
 const arrow=d.querySelectorAll('.arrow')[1];arrow.addEventListener('click',()=>expanded++);
 assert.equal(L.openItem(d,duplicate,visible,options),'expanded');assert.equal(wrong,0);assert.equal(expanded,1);
});
test('folder expansion then insertion allows the scoped target to be found',()=>{
 const d=dom('<div id="tnContentList">'+group('1.5 Hoạt động học tập',leaf(duplicate,'wrong'))+group(options.section,'',false)+'</div>');
 const arrow=d.querySelectorAll('.arrow')[1];arrow.addEventListener('click',()=>{
  arrow.firstElementChild.className='fa fa-chevron-up';const fragment=dom(leaf(duplicate,'right'));arrow.parentElement.parentElement.append(fragment.body.firstElementChild);
 });
 assert.equal(L.openItem(d,duplicate,visible,options),'expanded');let calls=0;d.getElementById('right').addEventListener('click',()=>calls++);
 assert.equal(L.openItem(d,duplicate,visible,options),'clicked');assert.equal(calls,1);
});
test('duplicate selection requires the native selected marker in the correct section',()=>{
 const d=dom('<div id="tnContentList">'+group('1.5 Hoạt động học tập',leaf(duplicate,'wrong',true))+group(options.section,leaf(duplicate,'right'))+'</div><div id="tnContentView">'+head(duplicate)+'</div>');
 assert.equal(L.selected(d,duplicate,visible,options),false);
 d.getElementById('right').parentElement.classList.add('content-selected');assert.equal(L.selected(d,duplicate,visible,options),true);
});
test('two identically named links in the target section remain ambiguous',()=>{
 const d=dom('<div id="tnContentList">'+group(options.section,leaf(duplicate,'one')+leaf(duplicate,'two'))+'</div>');
 assert.equal(L.openItem(d,duplicate,visible,options),'ambiguous');
});
test('native viewer heading strips nested course name and preserves lesson parentheses',()=>{
 const title='Bài đọc (PDF): Hướng dẫn';const d=dom('<div id="tnContentList">'+leaf(title,'lesson')+'</div><div id="tnContentView">'+head(title,'Môn học (2026-2027)')+'</div>');
 assert.equal(L.selected(d,title,visible),true);assert.equal(L.headingTitle(d.querySelector('.col-md-10 > span:last-child')),title);
 assert.match(d.querySelector('.col-md-10').textContent,/Môn học \(2026-2027\)/);
});
test('actual heading nesting permits a nonempty reading viewer to be confirmed',()=>{
 const title='📌 NHỮNG THÔNG TIN ĐẶC BIỆT QUAN TRỌNG CẦN ĐỌC';
 const d=dom('<div id="tnContentView"><app-class-content-view>'+head(title)+'<div id="TNContentView">Nội dung đọc</div></app-class-content-view></div>');
 const item=L.pageSnapshot(d,title,visible);assert.ok(item?.ready);assert.equal(item.marker,'Nội dung đọc');
 assert.equal(L.pageSnapshot(d,'Bài khác',visible),null);
});
test('interactive viewer without TNContentView uses the lesson title rather than the toggle icon',()=>{
 const title='Phiếu khảo sát';const d=dom('<div id="tnContentView"><app-class-content-view>'+head(title)+'<app-class-content-survey><form><input></form></app-class-content-survey></app-class-content-view></div>');
 const item=L.pageSnapshot(d,null,visible,true);assert.ok(item?.ready);assert.equal(item.marker,L.titleKey(title));
});
test('discussion and reflection titles hand off while native videos remain automatic',()=>{
 assert.equal(L.kind('Hoạt động 2: Nhật ký học tập Bài 5 (Reflection)'),'interactive');
 assert.equal(L.kind('Hoạt động 1: Thảo luận nhóm'),'interactive');
 assert.equal(L.kind('Video 2: Hướng dẫn bài kiểm tra'),'video');
});
