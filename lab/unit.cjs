'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),results=path.join(root,'results');fs.mkdirSync(results,{recursive:true});
const tests=[...fs.readdirSync(path.join(root,'vnu-lms-player','tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>path.join('vnu-lms-player','tests',n)),...fs.readdirSync(__dirname).filter(n=>n.endsWith('.test.cjs')).map(n=>path.join('lab',n))];
const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...tests],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024});
const log=(run.stdout||'')+(run.stderr||'');fs.writeFileSync(path.join(results,'unit.log'),log);process.stdout.write(log);
const summary={kind:'Node/DOM and mock-server tests',realVnuServerTested:false,exitCode:run.status,error:run.error?.message};
for(const name of ['tests','pass','fail','skipped','cancelled'])summary[name]=Number(log.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]??0);
fs.writeFileSync(path.join(results,'unit-summary.json'),JSON.stringify(summary,null,2));process.exitCode=run.status??1;
