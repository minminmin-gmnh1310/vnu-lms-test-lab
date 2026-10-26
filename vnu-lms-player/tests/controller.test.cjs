const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context=vm.createContext({Promise,WeakMap,Number,Math,String});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','controller.js'),'utf8'),context);
const Controller=vm.runInContext('VnuPlayer',context);
const flush=()=>new Promise(setImmediate);
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject};}
function setup(){
 const video={paused:true,ended:false,currentTime:0,duration:100,error:null,playbackRate:1,pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}};
 const s={now:0,visible:true,course:true,item:{video,source:'a.mp4',ready:true},messages:[],clicks:0,outcome:'clicked'};
 const c=new Controller({now:()=>s.now,foreground:()=>s.visible,inCourse:()=>s.course,snapshot:()=>s.item,status:(m)=>s.messages.push(m),next:()=>{s.clicks++;return s.outcome}});
 s.c=c;s.v=video;s.tick=(ms=500)=>{s.now+=ms;c.tick()};return s;
}
test('start at 1× and stop pauses',async()=>{const s=setup();s.v.playbackRate=2;s.c.start();await flush();assert.equal(s.v.playbackRate,1);assert.equal(s.v.paused,false);s.c.stop();assert.equal(s.v.paused,true);assert.equal(s.c.running,false)});
test('no video: stays stopped',()=>{const s=setup();s.item=null;s.c.start();assert.equal(s.c.running,false)});
test('already ended: does not skip',()=>{const s=setup();s.v.ended=true;s.c.start();assert.equal(s.clicks,0);assert.equal(s.c.running,false)});
test('hidden pause and visible return',async()=>{const s=setup();s.c.start();await flush();s.visible=false;s.tick();assert.equal(s.v.paused,true);s.visible=true;s.tick();await flush();assert.equal(s.v.paused,false)});
test('manual pause remains paused',async()=>{const s=setup();s.c.start();await flush();s.v.pause();s.tick();s.tick();assert.equal(s.v.paused,true);assert.equal(s.c.running,true)});
test('end clicks once while stale next page remains',async()=>{const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();s.tick();s.tick();assert.equal(s.clicks,1);assert.equal(s.c.finished,1)});
test('reuse element with new source',async()=>{const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();s.item={video:s.v,source:'b.mp4',ready:true};s.v.ended=false;s.v.currentTime=0;s.tick();await flush();assert.equal(s.c.state,'playing');assert.equal(s.v.paused,false);assert.equal(s.clicks,1)});
test('new source must be loaded before stale ended is used',async()=>{const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();s.item={video:s.v,source:'b.mp4',ready:false,canPlay:false};s.tick();s.tick();assert.equal(s.clicks,1);s.v.ended=false;s.item.ready=true;s.tick();await flush();assert.equal(s.c.state,'playing')});
test('transient element removal tolerates Angular render',async()=>{const s=setup();s.c.start();await flush();const keep=s.item;s.item=null;s.tick(1000);assert.equal(s.c.running,true);s.item=keep;s.tick(500);assert.equal(s.c.running,true)});
test('persistent missing video stops',async()=>{const s=setup();s.c.start();await flush();s.item=null;s.tick(500);s.tick(3100);assert.equal(s.c.running,false)});
test('nonvideo destination stops after bounded wait',async()=>{const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();s.item=null;s.tick(30500);assert.equal(s.c.running,false);assert.equal(s.clicks,1)});
test('disabled/end-of-list next stops',async()=>{const s=setup();s.outcome='none';s.c.start();await flush();s.v.ended=true;s.tick();assert.equal(s.c.running,false);assert.match(s.messages.at(-1),/Hết danh sách/)});
test('ambiguous next stops',async()=>{const s=setup();s.outcome='ambiguous';s.c.start();await flush();s.v.ended=true;s.tick();assert.equal(s.c.running,false);assert.match(s.messages.at(-1),/nhiều nút/)});
test('no navigation while away',async()=>{const s=setup();s.c.start();await flush();s.v.ended=true;s.visible=false;s.tick();assert.equal(s.clicks,0);s.visible=true;s.tick();assert.equal(s.clicks,1)});
test('new auto-playing element while hidden is paused',async()=>{const s=setup();s.c.start();await flush();s.visible=false;const n={...s.v,paused:false};s.item={video:n,source:'b',ready:true};s.tick();assert.equal(n.paused,true)});
test('delayed play resolves after Stop: remains paused',async()=>{const s=setup(),d=deferred();s.v.play=()=>{s.v.paused=false;return d.promise};s.c.start();s.c.stop();d.resolve();await flush();assert.equal(s.v.paused,true)});
test('Stop then Start while earlier promise pending',async()=>{const s=setup(),d=deferred();let calls=0;s.v.play=()=>{s.v.paused=false;return ++calls===1?d.promise:Promise.resolve()};s.c.start();s.c.stop();s.c.start();await flush();d.resolve();await flush();assert.equal(s.c.running,true);assert.equal(s.v.paused,false)});
test('earlier play rejects after source swap does not halt new source',async()=>{const s=setup(),d=deferred();let calls=0;s.v.play=()=>{s.v.paused=false;return ++calls===1?d.promise:Promise.resolve()};s.c.start();s.item={video:s.v,source:'b',ready:true};s.tick();await flush();d.reject(Object.assign(new Error(),{name:'AbortError'}));await flush();assert.equal(s.c.running,true);assert.equal(s.v.paused,false)});
test('autoplay denied gives actionable stop',async()=>{const s=setup();s.v.play=()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));s.c.start();await flush();assert.equal(s.c.running,false);assert.match(s.messages.at(-1),/chặn tự phát/)});
test('unsupported media gives actionable stop',async()=>{const s=setup();s.v.play=()=>Promise.reject(Object.assign(new Error(),{name:'NotSupportedError'}));s.c.start();await flush();assert.equal(s.c.running,false);assert.match(s.messages.at(-1),/NotSupportedError/)});
test('media load error stops',async()=>{const s=setup();s.v.error={code:4};s.c.start();await flush();assert.equal(s.c.running,false)});
test('unready video load timeout bounded',()=>{const s=setup();s.item.ready=false;s.c.start();s.tick(121000);assert.equal(s.c.running,false)});
test('unresolved play timeout bounded',()=>{const s=setup();s.v.play=()=>new Promise(()=>{});s.c.start();s.tick(121000);assert.equal(s.c.running,false)});
test('stalled playback bounded',async()=>{const s=setup();s.c.start();await flush();s.tick(91000);assert.equal(s.c.running,false)});
test('seek backward resets motion baseline',async()=>{const s=setup();s.v.currentTime=70;s.c.start();await flush();s.v.currentTime=10;s.tick(88000);assert.equal(s.c.running,true);s.v.currentTime=11;s.tick(3000);assert.equal(s.c.running,true)});
test('background time does not consume navigation budget',async()=>{const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();s.visible=false;s.tick();s.tick(600000);s.visible=true;s.tick();assert.equal(s.c.running,true);s.tick(30500);assert.equal(s.c.running,false)});
test('session expiry / leaving LMS stops',async()=>{const s=setup();s.c.start();await flush();s.course=false;s.tick();assert.equal(s.c.running,false);assert.equal(s.v.paused,true)});
test('rate change restored to 1×',async()=>{const s=setup();s.c.start();await flush();s.v.playbackRate=2;s.tick();assert.equal(s.v.playbackRate,1)});
test('AbortError during incomplete loading is recoverable',async()=>{const s=setup();s.item.ready=false;s.item.canPlay=true;let n=0;s.v.play=()=>++n===1?Promise.reject(Object.assign(new Error(),{name:'AbortError'})):Promise.resolve();s.c.start();await flush();s.item.ready=true;s.tick();await flush();assert.equal(s.c.running,true);assert.equal(n,2);assert.equal(s.c.state,'playing')});
test('preload none triggers fetching before readyState 2',async()=>{const s=setup();let n=0;s.item.ready=false;s.item.canPlay=true;s.v.play=()=>{n++;s.v.paused=false;return new Promise(()=>{})};s.c.start();assert.equal(n,1);assert.equal(s.c.running,true)});
test('new declared src with old loaded src is not played',()=>{const s=setup();let n=0;s.item.ready=false;s.item.canPlay=false;s.v.play=()=>{n++;return Promise.resolve()};s.c.start();assert.equal(n,0);assert.equal(s.clicks,0)});
test('slow next video receives full loading budget',async()=>{const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();s.item={video:s.v,source:'b.mp4',ready:false,canPlay:false};s.tick();s.tick(31000);assert.equal(s.c.running,true);assert.equal(s.c.state,'loading');s.v.ended=false;s.item.ready=true;s.item.canPlay=true;s.tick();await flush();assert.equal(s.c.running,true);assert.equal(s.clicks,1)});
test('Pause aborts pending play without unwanted restart',async()=>{const s=setup(),d=deferred();let n=0;s.v.play=()=>{n++;s.v.paused=false;return d.promise};s.c.start();s.v.pause();d.reject(Object.assign(new Error(),{name:'AbortError'}));await flush();s.tick();assert.equal(n,1);assert.equal(s.v.paused,true);assert.equal(s.c.running,true)});
test('rebuffer after 10-minute playback starts fresh timeout',async()=>{const s=setup();s.c.start();await flush();s.v.currentTime=600;s.tick(600000);s.item.ready=false;s.item.canPlay=true;s.tick();assert.equal(s.c.running,true);assert.equal(s.c.state,'buffering');s.tick(30000);assert.equal(s.c.running,true);s.item.ready=true;s.v.currentTime=601;s.tick();assert.equal(s.c.running,true);assert.equal(s.c.state,'playing')});
test('persistent rebuffer after lecture is bounded',async()=>{const s=setup();s.c.start();await flush();s.v.currentTime=600;s.tick(600000);s.item.ready=false;s.tick();s.tick(121000);assert.equal(s.c.running,false)});
test('replacing the native element pauses the previously owned video',async()=>{
 const s=setup();s.c.start();await flush();const previous=s.v;
 const next={...previous,paused:true,currentTime:0};s.item={video:next,source:'b.mp4',ready:true};s.tick();await flush();
 assert.equal(previous.paused,true);assert.equal(next.paused,false);
});
test('new element with old source during Next transition is not played again',async()=>{
 const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();
 const oldMountedAgain={...s.v,paused:true,ended:false,currentTime:0};s.item={video:oldMountedAgain,source:'a.mp4',ready:true};s.tick();await flush();
 assert.equal(oldMountedAgain.paused,true);assert.equal(s.c.state,'transition');assert.equal(s.clicks,1);
});
test('Stop pauses a newly mounted autoplay video before it has been bound',async()=>{
 const s=setup();s.c.start();await flush();const newVideo={...s.v,paused:false,currentTime:0};s.item={video:newVideo,source:'b.mp4',ready:true};
 s.c.stop();assert.equal(newVideo.paused,true);
});
test('same element replaying the old source is paused while Next is still loading',async()=>{
 const s=setup();s.c.start();await flush();s.v.ended=true;s.tick();s.v.ended=false;s.v.paused=false;s.v.currentTime=0;s.tick();
 assert.equal(s.v.paused,true);assert.equal(s.c.state,'transition');assert.equal(s.clicks,1);
 s.item={video:s.v,source:'b.mp4',ready:true};s.tick();await flush();assert.equal(s.v.paused,false);
});
test('already playing native video is adopted without another play call or restart',()=>{
 const s=setup();let plays=0;s.v.paused=false;s.v.currentTime=37;s.v.play=()=>{plays++;return Promise.resolve()};
 s.c.start();assert.equal(plays,0);assert.equal(s.c.running,true);assert.equal(s.c.state,'playing');assert.equal(s.v.currentTime,37);
});
test('autoplay failure is classified and cleared by an actual successful retry',async()=>{
 const s=setup();s.v.play=()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));s.c.start();await flush();
 assert.equal(s.c.autoplayBlocked,true);s.v.play=()=>{s.v.paused=false;return Promise.resolve()};s.c.start();await flush();
 assert.equal(s.c.autoplayBlocked,false);assert.equal(s.c.running,true);
});
