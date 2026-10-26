// Node/DOM integration: runs the SAME mock page, server model and four runtime
// files as CI. Media, layout, focus and timers are simulated; no browser starts.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),{MockLms,COURSE}=require('./server.cjs');
const flush=()=>new Promise(setImmediate);
async function replay(scenario='pipeline',options={}){
 const {document,window}=parseHTML(fs.readFileSync(path.join(__dirname,'page.html'),'utf8'));
 const state={now:0,intervals:[],timers:[],visible:true,playing:new Set(),errors:[]};
 const origin='http://127.0.0.1:12345';Object.defineProperty(document,'baseURI',{value:origin+COURSE});
 Object.defineProperty(document,'visibilityState',{get:()=>state.visible?'visible':'hidden'});document.hasFocus=()=>true;
 window.HTMLElement.prototype.getClientRects=function(){for(let n=this;n;n=n.parentElement)if(n.style.display==='none'||n.hasAttribute('hidden'))return [];return [{}]};
 Object.defineProperties(window,{innerWidth:{value:1280},innerHeight:{value:900}});
 const create=document.createElement.bind(document);
 document.createElement=(name,...args)=>{
  const el=create(name,...args);if(name.toLowerCase()!=='video')return el;
  Object.setPrototypeOf(el,window.HTMLVideoElement.prototype);let paused=true,time=0,ended=false;
  Object.defineProperties(el,{paused:{get:()=>paused},ended:{get:()=>ended},readyState:{get:()=>4},error:{get:()=>null},
   currentTime:{get:()=>time,set:value=>{time=value;ended=false}},duration:{get:()=>4},
   currentSrc:{get:()=>el.src?new URL(el.src,origin).href:''}});
  el.playbackRate=1;el.pause=()=>{if(paused)return;paused=true;state.playing.delete(el);el.dispatchEvent(new window.Event('pause',{bubbles:true}))};
  el.play=()=>{paused=false;ended=false;state.playing.add(el);el.dispatchEvent(new window.Event('play',{bubbles:true}));el.dispatchEvent(new window.Event('playing',{bubbles:true}));return Promise.resolve()};
  el.advance=seconds=>{if(!paused){time+=seconds;if(time>=4){if(el.loop)time%=4;else{time=4;ended=true;paused=true;state.playing.delete(el);el.dispatchEvent(new window.Event('ended',{bubbles:true}))}}}};
  return el;
 };
 const model=new MockLms(scenario,()=>state.now);
 const fetch=async(url,opts={})=>{
  if(!url.startsWith('/api/'))throw new Error('Non-mock request');let value;
  if(url.startsWith('/api/progress'))value=model.report();
  else if(url.startsWith('/api/state')){model.state(JSON.parse(opts.body));value={ok:true};}
  else if(url.startsWith('/api/submit')){model.submissions++;value={ok:true};}
  else throw new Error('Unknown mock endpoint');
  return {ok:true,json:async()=>value};
 };
 const context=vm.createContext({document,window,HTMLVideoElement:window.HTMLVideoElement,URL,URLSearchParams,fetch,
  location:{pathname:COURSE,search:'?scenario='+scenario},performance:{now:()=>state.now},Promise,
  getComputedStyle:e=>({visibility:e.style.visibility||'visible',display:e.style.display||'block'}),
  setInterval:(fn,ms)=>{const entry={fn,ms,next:state.now+ms};state.intervals.push(entry);return entry},
  setTimeout:(fn,ms)=>{const entry={fn,at:state.now+ms};state.timers.push(entry);return entry}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'page.js'),'utf8'),context);await flush();
 for(const name of ['controller.js','lms.js','queue.js','player.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..','vnu-lms-player',name),'utf8'),context);
 const panel=document.getElementById('vnu-lecture-helper').shadowRoot;
 const tick=async()=>{
  state.now+=100;
  for(const el of [...state.playing]){if(!el.isConnected){state.playing.delete(el);continue;}el.advance(0.1)}
  for(const entry of state.intervals)if(state.now>=entry.next){entry.next+=entry.ms;try{await entry.fn()}catch(e){state.errors.push(e.message)}}
  for(const entry of [...state.timers])if(state.now>=entry.at){state.timers.splice(state.timers.indexOf(entry),1);entry.fn()}
  await flush();options.onTick?.({state,document,window,panel,model});
 };
 for(let i=0;i<(options.maxTicks||2200);i++){
  await tick();
  if(state.now>1000&&panel.getElementById('engine').textContent.includes('Đã dừng'))break;
 }
 return {document,window,panel,model,state,context};
}
module.exports={replay};
