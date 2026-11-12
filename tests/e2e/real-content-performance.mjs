// Lighthouse against a running production server on the real source corpus.
// No database access, setup, seed or test credentials are used by this script.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import path from 'node:path';
const base=process.env.BASE_URL??'http://localhost:3122',folder=process.env.OUT??'.local/visual-v2-performance';assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u);
const tool=path.resolve('.local/lighthouse-tools/node_modules/lighthouse');assert.equal(JSON.parse(await readFile(tool+'/package.json','utf8')).version,'13.6.0');await mkdir(folder,{recursive:true});
const search=await(await fetch(base+'/api/search?scope=cms&q=1940')).json();const history=search.items.find(h=>h.kind==='material'&&h.material.title.includes('История'))?.material;assert.ok(history);
const routes=[['home','/'],['catalog','/catalog?scope=cms'],['material',history.href.replace('/api/content/','/materials/').replace('?locale=','?contentLang=')]],reports=[];
try{for(const [name,route]of routes)for(const device of['mobile','desktop']){
 const output=path.resolve(folder,name+'-'+device),fd=openSync(folder+'/'+name+'-'+device+'.log','w',0o600);
 const child=spawn(process.execPath,[tool+'/cli/index.js',base+route,'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--only-categories=performance,accessibility,best-practices,seo','--output=json','--output=html','--output-path='+output,'--quiet',...(device==='desktop'?['--preset=desktop']:[])],{env:{...process.env,CHROME_PATH:process.env.CHROMIUM_PATH??'/usr/bin/chromium'},stdio:['ignore',fd,fd]});closeSync(fd);const [code]=await once(child,'exit');assert.equal(code,0,name+device+' failed');
 const r=JSON.parse(await readFile(output+'.report.json','utf8'));assert.ok(!r.runtimeError);const scores=Object.fromEntries(Object.entries(r.categories).map(([key,v])=>[key,Math.round(v.score*100)]));reports.push({name,route,device,scores,lcpMs:r.audits['largest-contentful-paint'].numericValue,cls:r.audits['cumulative-layout-shift'].numericValue,tbtMs:r.audits['total-blocking-time'].numericValue});console.log(name+'/'+device,JSON.stringify(scores));
}}finally{await writeFile(folder+'/summary.json',JSON.stringify({testedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tool:'Lighthouse 13.6.0',target:'Local production Next.js with actual source corpus; anonymous browser; no seed',reports,limitations:['One observation per route/device, default simulated Lighthouse throttling.','Not a physical-device benchmark, production HTTPS result or hosting SLA.']},null,2)+'\n');}
assert.ok(reports.every(r=>r.scores.performance>=80),'Performance target >=80 on every key screen/device');
