const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx=vm.createContext({Promise,WeakMap,Number,Math,String});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','controller.js'),'utf8'),ctx);const C=vm.runInContext('VnuPlayer',ctx);
const flush=()=>new Promise(setImmediate);
function setup() {
 const s={now:0,front:true,course:true,item:null,clicks:0,message:'',promises:[],videos:[],violations:[]};
 const make=()=>{const v={paused:true,ended:false,currentTime:0,duration:300,playbackRate:1,error:null,pause(){this.paused=true},play(){this.paused=false;return new Promise((resolve,reject)=>s.promises.push({resolve,reject,v}))}};s.videos.push(v);return v};
 s.newVideo=make;s.item={video:make(),source:'a',ready:true,canPlay:true};
 s.c=new C({now:()=>s.now,foreground:()=>s.front,inCourse:()=>s.course,snapshot:()=>s.item,status:(m)=>s.message=m,next:()=>{if(!s.front||!s.course||!s.item.ready||!s.item.video.ended||s.item.video.error)s.violations.push('unsafe Next');s.clicks++;return 'clicked'}});
 s.tick=()=>{s.now+=500;s.c.tick()};return s;
}
test('source may become ready after old pending promise settles',async()=>{const s=setup();s.c.start();const a=s.promises.shift();s.item={video:s.item.video,source:'b',ready:false,canPlay:false};s.tick();a.resolve();await flush();assert.equal(s.c.running,true);s.item.ready=true;s.item.canPlay=true;s.tick();s.promises.shift().resolve();await flush();assert.equal(s.item.video.paused,false)});
test('stopped old element cannot revive when a new element starts',async()=>{const s=setup();s.c.start();const old=s.item.video,p=s.promises.shift();s.c.stop();s.item={video:s.newVideo(),source:'b',ready:true,canPlay:true};s.c.start();s.promises.shift().resolve();await flush();p.resolve();await flush();assert.equal(old.paused,true);assert.equal(s.item.video.paused,false)});
test('synchronous play exception is not hidden by a loading status',()=>{const s=setup();s.item.ready=false;s.item.video.play=()=>{throw Object.assign(new Error(),{name:'NotSupportedError'})};s.c.start();assert.equal(s.c.running,false);assert.match(s.message,/NotSupportedError/)});
test('synchronous play exception on ready video stays actionable',()=>{const s=setup();s.item.video.play=()=>{throw Object.assign(new Error(),{name:'NotAllowedError'})};s.c.start();assert.equal(s.c.running,false);assert.match(s.message,/chặn tự phát/)});
test('seeded stress: 200 timelines × 120 actions, no unsafe next/late resurrection',async()=>{
 for(let seed=1;seed<=200;seed++){
  let r=seed;const random=()=>{r=(Math.imul(r,1664525)+1013904223)>>>0;return r};const s=setup();let serial=0;
  for(let step=0;step<120;step++){
   const action=random()%12;
   if(action===0)s.c.start();
   else if(action===1)s.c.stop();
   else if(action===2)s.front=!s.front;
   else if(action===3){s.now+=random()%150000;s.c.tick();}
   else if(action===4&&s.item){s.item.video.currentTime+=1;s.item.video.ended=false;s.item.video.paused=false;}
   else if(action===5&&s.item){s.item.video.ended=true;s.item.video.paused=true;}
   else if(action===6){s.item={video:s.newVideo(),source:'clip-'+(++serial),ready:!!(random()%2),canPlay:true};}
   else if(action===7&&s.item){s.item.ready=true;s.item.video.ended=false;}
   else if(action===8&&s.promises.length){s.promises.shift().resolve();}
   else if(action===9&&s.promises.length){s.promises.shift().reject(Object.assign(new Error(),{name:'AbortError'}));}
   else if(action===10&&s.item){s.item.video.pause();}
   else if(action===11){s.course=!s.course;}
   s.tick();await flush();
   assert.deepEqual(s.violations,[],'unsafe navigation at seed '+seed+' step '+step);
   // Native autoplay may start independently. A running controller must pause
   // its owned/current media when the page is away, after processing a tick.
   if(s.c.running&&!s.front){assert.equal(s.c.item.video.paused,true,'seed '+seed+' step '+step);if(s.item&&!s.item.video.ended)assert.equal(s.item.video.paused,true);}
  }
  s.c.stop();for(const p of s.promises)p.resolve();await flush();
  if(s.c.item)assert.equal(s.c.item.video.paused,true,'stopped seed '+seed);
 }
});

test('play rejection without Error object stops cleanly',async()=>{const s=setup();s.item.video.play=()=>Promise.reject(undefined);s.c.start();await flush();assert.equal(s.c.running,false);assert.match(s.message,/Không phát được/)});
