'use strict';
// For the user's own VM only. No browser is launched by the build checks.
// Attach without Playwright's default focus override from the FIRST session.
const {spawn}=require('node:child_process');
const fs=require('node:fs');

async function launchNativeBrowser(chromium,{profile,extension,logPath,artifactsDir}){
 const args=[
  '--user-data-dir='+profile,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
  '--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--disable-component-update','--disable-sync','--disable-dev-shm-usage',
  '--disable-extensions-except='+extension,'--load-extension='+extension,
  '--window-size=1280,900','about:blank'
 ];
 // Same sandbox setting as Playwright's default Chromium launch in this lab.
 if(process.platform==='linux')args.unshift('--no-sandbox');
 const child=spawn(chromium.executablePath(),args,{stdio:['ignore','ignore','pipe'],windowsHide:false});
 let browser=null,stderr='';
 child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-65536);});
 async function close(){
  if(browser){
   // Closing a CDP connection alone does not terminate a separately spawned browser.
   try{const session=await browser.newBrowserCDPSession();await session.send('Browser.close');}catch{}
   await browser.close().catch(()=>{});
  }
  if(child.exitCode===null && child.signalCode===null){
   await new Promise(resolve=>{
    const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);
    child.once('exit',()=>{clearTimeout(timer);resolve();});
   });
  }
  fs.writeFileSync(logPath,stderr.replace(/ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+/g,'[temporary local CDP endpoint]'));
 }
 try{
  const endpoint=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(new Error('Native Chromium startup timed out after 30 seconds')),30000);
   let done=false;
   function finish(error,value){
    if(done)return;done=true;clearTimeout(timer);
    child.stderr.off('data',read);child.off('error',failed);child.off('exit',exited);
    error?reject(error):resolve(value);
   }
   function read(){const match=stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/);if(match)finish(null,match[1]);}
   function failed(error){finish(error);}
   function exited(code,signal){finish(new Error('Native Chromium exited before ready: '+code+' / '+signal+'\n'+stderr));}
   child.stderr.on('data',read);child.once('error',failed);child.once('exit',exited);
  });
  browser=await chromium.connectOverCDP(endpoint,{noDefaults:true,isLocal:true,timeout:30000,artifactsDir});
  const context=browser.contexts()[0];
  if(!context)throw new Error('Native Chromium default context missing');
  return {context,browser,close};
 }catch(error){await close();throw error;}
}
module.exports={launchNativeBrowser};
