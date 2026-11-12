// Optional measured acceptance; install the pinned tool privately as documented, never as a runtime dependency.
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
const database=process.env.TEST_DATABASE_URL;if(!database||!new URL(database).pathname.endsWith('_test'))throw Error('Dedicated TEST_DATABASE_URL ending in _test required');
const tool=path.resolve('.local/lighthouse-tools/node_modules/lighthouse'),manifest=JSON.parse(await readFile(tool+'/package.json','utf8'));if(manifest.version!=='13.6.0')throw Error('Pinned Lighthouse 13.6.0 required');
const folder='.local/performance',base='http://localhost:3115';await mkdir(folder,{recursive:true});
const env={...process.env,DATABASE_URL:database,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),ALLOW_DEMO_SEED:'1',DEMO_AUTHOR_PASSWORD:randomBytes(32).toString('hex'),DEMO_MODERATOR_PASSWORD:randomBytes(32).toString('hex'),CHROME_PATH:process.env.CHROMIUM_PATH??'/usr/bin/chromium',NEXT_PUBLIC_API_MOCK:'0'};
const reports=[];let app;
try{
 for(const script of ['scripts/migrate.ts','prisma/seed.ts'])execFileSync(process.execPath,['--import','tsx',script],{env,stdio:'pipe'});
 const fd=openSync(folder+'/server.log','w',0o600);app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3115'],{env,stdio:['ignore',fd,fd]});closeSync(fd);
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}if(!ready)throw Error('PERFORMANCE_SERVER_NOT_READY');
 const corpus=await(await fetch(base+'/api/documents')).json();
 for(const [name,route]of [['home','/'],['catalog','/catalog'],['document','/documents/demo-doc-01']])for(const device of ['mobile','desktop']){
  const output=path.resolve(folder,name+'-'+device),log=openSync(folder+'/'+name+'-'+device+'.log','w',0o600);
  const args=[tool+'/cli/index.js',base+route,'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--only-categories=performance,accessibility,best-practices,seo','--output=json','--output=html','--output-path='+output,'--quiet',...(device==='desktop'?['--preset=desktop']:[])];
  const child=spawn(process.execPath,args,{env,stdio:['ignore',log,log]});closeSync(log);const [code]=await once(child,'exit');if(code!==0)throw Error('LIGHTHOUSE_RUN_FAILED');
  const report=JSON.parse(await readFile(output+'.report.json','utf8'));if(report.runtimeError)throw Error('LIGHTHOUSE_RUNTIME_ERROR');
  const scores=Object.fromEntries(Object.entries(report.categories).map(([key,v])=>[key,Math.round(v.score*100)]));
  reports.push({name,route,device,scores,lcpMs:report.audits['largest-contentful-paint'].numericValue,cls:report.audits['cumulative-layout-shift'].numericValue,tbtMs:report.audits['total-blocking-time'].numericValue,report:name+'-'+device+'.report.html',browser:report.environment.hostUserAgent,throttling:report.configSettings.throttling,publicDocuments:corpus.total});console.log(name+'/'+device+': '+JSON.stringify(scores));
 }
 if(reports.some(r=>r.scores.performance<80))process.exitCode=1;
}catch(error){process.exitCode=1;console.log('Performance check stopped: '+error.message);}
finally{
 if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}
 await writeFile(folder+'/summary.json',JSON.stringify({testedAt:new Date().toISOString(),tool:'Lighthouse 13.6.0',target:'Local production Next.js build, dedicated test PostgreSQL, synthetic demo corpus, anonymous browser',runsPerRouteAndDevice:1,reports,limitations:['Single observations, not a controlled benchmark or public hosting SLA.','Default simulated Lighthouse throttling; no physical device or production HTTPS test.']},null,2)+'\n');
}
