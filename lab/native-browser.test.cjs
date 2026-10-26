'use strict';
// These tests replace spawn with an in-memory process. No browser is executed.
const {test,mock}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),cp=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

function fixture(t,mode='ready'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-browser-unit-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const child=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=null;child.signalCode=null;
 child.kill=()=>{child.signalCode='SIGKILL';child.emit('exit',null,'SIGKILL');return true;};
 const spawn=mock.method(cp,'spawn',(...args)=>{
  child.spawnArguments=args;
  queueMicrotask(()=>{
   if(mode==='exited'){child.stderr.emit('data',Buffer.from('Test startup failure'));child.exitCode=7;child.emit('exit',7,null);}
   else child.stderr.emit('data',Buffer.from('DevTools listening on ws://127.0.0.1:41234/devtools/browser/test-id\n'));
  });
  return child;
 });
 const modulePath=require.resolve('./native-browser.cjs');delete require.cache[modulePath];
 t.after(()=>{spawn.mock.restore();delete require.cache[modulePath];});
 const {launchNativeBrowser}=require('./native-browser.cjs');
 const context={name:'original default context'},calls=[];
 const browser={contexts:()=>mode==='no-context'?[]:[context],
  newBrowserCDPSession:async()=>({send:async(method)=>{calls.push(method);child.exitCode=0;child.emit('exit',0,null);}}),
  close:async()=>calls.push('disconnect')};
 const chromium={executablePath:()=>'/test/chromium',connectOverCDP:async(endpoint,options)=>{calls.push({endpoint,options});return browser;}};
 const options={profile:path.join(dir,'fresh-profile'),extension:path.join(dir,'extension'),logPath:path.join(dir,'browser.log'),artifactsDir:dir};
 return {launchNativeBrowser,chromium,options,child,context,calls};
}

test('native launch connects to the original context without enabling default focus overrides',async t=>{
 const f=fixture(t),run=await f.launchNativeBrowser(f.chromium,f.options);
 assert.equal(run.context,f.context);
 assert.equal(f.calls[0].options.noDefaults,true);
 assert.equal(f.calls[0].options.isLocal,true);
 assert.ok(f.child.spawnArguments[1].includes('--remote-debugging-address=127.0.0.1'));
 assert.ok(f.child.spawnArguments[1].includes('--user-data-dir='+f.options.profile));
 await run.close();assert.deepEqual(f.calls.slice(1),['Browser.close','disconnect']);
 const log=fs.readFileSync(f.options.logPath,'utf8');assert.ok(log.includes('[temporary local CDP endpoint]'));assert.ok(!log.includes('test-id'));
});

test('Chromium startup failure is reported before connecting and preserves diagnostics',async t=>{
 const f=fixture(t,'exited');
 await assert.rejects(f.launchNativeBrowser(f.chromium,f.options),/exited before ready: 7/);
 assert.equal(f.calls.length,0);assert.match(fs.readFileSync(f.options.logPath,'utf8'),/Test startup failure/);
});

test('missing default context fails and closes the independently started browser',async t=>{
 const f=fixture(t,'no-context');
 await assert.rejects(f.launchNativeBrowser(f.chromium,f.options),/default context missing/);
 assert.equal(f.child.exitCode,0);assert.deepEqual(f.calls.slice(1),['Browser.close','disconnect']);
});
