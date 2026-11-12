// Three independent observations per route/device; publish all and compare medians.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import path from 'node:path';
const base=process.env.BASE_URL??'http://localhost:3122',out=process.env.OUT??'.local/reference-performance';assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u);await mkdir(out,{recursive:true});
const tool=path.resolve('.local/lighthouse-tools/node_modules/lighthouse');assert.equal(JSON.parse(await readFile(tool+'/package.json','utf8')).version,'13.6.0');const observations=[],medians=[];
try{for(const [name,route]of [['home','/'],['catalog','/catalog?scope=cms'],['material','/materials/archive-history-1?contentLang=ru']])for(const device of ['mobile','desktop']){
 const group=[];for(let run=1;run<=3;run++){
  const filename=path.resolve(out,`${name}-${device}-${run}`),fd=openSync(filename+'.log','w',0o600);
  const child=spawn(process.execPath,[tool+'/cli/index.js',base+route,'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--only-categories=performance,accessibility,best-practices,seo','--output=json','--output=html','--output-path='+filename,'--quiet',...(device==='desktop'?['--preset=desktop']:[])],{env:{...process.env,CHROME_PATH:'/usr/bin/chromium'},stdio:['ignore',fd,fd]});closeSync(fd);const [code]=await once(child,'exit');assert.equal(code,0);const r=JSON.parse(await readFile(filename+'.report.json','utf8'));assert.ok(!r.runtimeError);
  const scores=Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,Math.round(v.score*100)]));const row={name,route,device,run,scores,cls:r.audits['cumulative-layout-shift'].numericValue,lcpMs:r.audits['largest-contentful-paint'].numericValue,tbtMs:r.audits['total-blocking-time'].numericValue};group.push(row);observations.push(row);console.log(name,device,run,JSON.stringify(scores));
 }
 const scores=Object.fromEntries(Object.keys(group[0].scores).map(key=>[key,group.map(r=>r.scores[key]).sort((a,b)=>a-b)[1]]));medians.push({name,route,device,scores});
}}finally{await writeFile(out+'/summary.json',JSON.stringify({testedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tool:'Lighthouse13.6.0',observations,medians,target:'Local real-corpus production server; default simulated throttling; anonymous Chrome',limitations:['Exactly three observations per screen/device; all are retained; median is not a best-run selection.','Not a physical-device or public HTTPS hosting benchmark.']},null,2)+'\n');}
assert.equal(observations.length,18);assert.ok(medians.every(row=>row.scores.performance>=80),'Every screen/device median >=80');
