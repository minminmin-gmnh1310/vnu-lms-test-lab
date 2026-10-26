'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const COURSE='/learn/lop-hoc/chi-tiet/11111111-1111-1111-1111-111111111111';
const definitions=(scenario='pipeline')=>scenario==='controls'
 ? [{title:'Video: Kiểm tra Pause và Dừng',kind:'video',required:true,seconds:60}]
 : [
  {title:'Thông báo tùy chọn',kind:'page',required:false,seconds:1.5,section:'1.1 Mục cũ'},
  {title:'Video: Đã hoàn thành',kind:'video',required:true,seconds:1.5,complete:true,section:'1.1 Mục cũ'},
  {title:'Bài đọc: Hướng dẫn',kind:'page',required:true,seconds:1.5,section:'2.2.1 Bài giảng'},
  {title:'Bài 1: Video không có tiền tố',kind:'video',required:true,seconds:1.5,section:'2.2.1 Bài giảng'},
  {title:'Phiếu khảo sát chỉ yêu cầu thời gian',kind:'survey',required:true,seconds:1.5,section:'2.2.2 Hoạt động',prerequisites:[5]},
  {title:'Video 2: Tiếp theo',kind:'video',required:true,seconds:1.5,section:'2.2.2 Hoạt động'},
  {title:'Tài liệu: Hướng dẫn',kind:'iframe',required:true,seconds:1.5,section:'2.2.3 Tài liệu'},
  {title:'Bài đọc: Nội dung thay đổi',kind:'dynamic',required:true,seconds:1.5,section:'2.2.3 Tài liệu'}
 ];
class MockLms {
 constructor(scenario='pipeline',now=()=>performance.now()){
  this.now=now;this.items=definitions(scenario).map(x=>({...x,secondsSeen:x.complete?x.seconds:0}));
  this.active=null;this.last=now();this.visits=[];this.submissions=0;
 }
 tick(){const now=this.now(),dt=Math.max(0,Math.min(300,now-this.last))/1000;this.last=now;
  if(this.active?.eligible && this.items[this.active.index])this.items[this.active.index].secondsSeen+=dt;
 }
 state(value){this.tick();
  const index=value.index;
  if(index===null){this.active=null;return;}
  if(!Number.isInteger(index)||!this.items[index])throw new Error('Invalid lesson');
  if(!this.visits.includes(index))this.visits.push(index);
  const unlocked=(this.items[index].prerequisites || []).every(i=>this.items[i].secondsSeen>=this.items[i].seconds);
  this.active={index,eligible:unlocked && value.visible===true && (this.items[index].kind!=='video'||value.playing===true)};
 }
 report(){this.tick();return this.items.map((x,index)=>({index,title:x.title,kind:x.kind,section:x.section,prerequisites:x.prerequisites || [],required:x.required,
  requiredMinutes:x.seconds/60,minutes:Math.floor(x.secondsSeen/60*1e6)/1e6,
  status:x.secondsSeen>=x.seconds?'Đã hoàn thành':'Chưa hoàn thành'}));}
 summary(){return {mode:'OFFLINE MOCK — not VNU',items:this.report(),visits:[...this.visits],submissions:this.submissions};}
}
async function startServer(){
 const models=new Map();
 const model=name=>{if(!['pipeline','controls','deep'].includes(name))throw new Error('Invalid scenario');if(!models.has(name))models.set(name,new MockLms(name));return models.get(name);};
 const server=http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://127.0.0.1'),scenario=url.searchParams.get('scenario')||'pipeline';
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
   if(url.pathname===COURSE){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'page.html')));return;}
   if(url.pathname==='/app.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'page.js')));return;}
   if(url.pathname==='/clip.webm'){res.setHeader('Content-Type','video/webm');res.end(fs.readFileSync(path.join(__dirname,'..','assets','clip.webm')));return;}
   if(url.pathname==='/frame'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><body><p>Tài liệu mô phỏng, không phải nội dung VNU.</p><form><input aria-label="Câu trả lời thử"><button>Nộp câu trả lời thử</button></form><script>document.querySelector("input").focus();document.querySelector("form").addEventListener("submit",event=>{event.preventDefault();fetch("/api/submit?scenario="+encodeURIComponent(new URLSearchParams(location.search).get("scenario")||"pipeline"),{method:"POST"});});</script></body></html>');return;}
   if(url.pathname==='/api/progress'&&req.method==='GET'){json(model(scenario).report());return;}
   if(url.pathname==='/api/summary'&&req.method==='GET'){json(model(scenario).summary());return;}
   if(url.pathname==='/api/submit'&&req.method==='POST'){model(scenario).submissions++;json({ok:true});return;}
   if(url.pathname==='/api/state'&&req.method==='POST'){
    let text='';for await(const part of req){text+=part;if(text.length>4096)throw new Error('Body too large');}
    model(scenario).state(JSON.parse(text));json({ok:true});return;
   }
   res.statusCode=404;res.end('Offline test fixture only');
  }catch(error){res.statusCode=400;res.end(error.message);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,models,origin:'http://127.0.0.1:'+server.address().port,coursePath:COURSE,
  close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={MockLms,startServer,COURSE};
