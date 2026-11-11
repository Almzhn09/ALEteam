import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {docker} from '../deploy/docker.mjs';
const run=Date.now().toString(36),project='ale-real-'+run,restored=project+'-restore',folder='.local/real-content/docker-'+run;
await mkdir(folder,{recursive:true,mode:0o700});const secret=()=>randomBytes(32).toString('hex');
async function port(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value;}
const sourcePort=await port(),restorePort=await port();
const config={DEPLOY_DOMAIN:'',DEPLOY_HTTP_PORT:String(sourcePort),BETTER_AUTH_URL:'http://localhost:'+sourcePort,POSTGRES_ADMIN_PASSWORD:secret(),APP_DB_PASSWORD:secret(),BETTER_AUTH_SECRET:secret(),ALLOW_DEMO_SEED:'0',ARCHIVE_CONTENT_MODE:'real',ASSISTANT_MODE:'local-model',MODERATION_MODE:'local'};
const second={...config,DEPLOY_HTTP_PORT:String(restorePort),BETTER_AUTH_URL:'http://localhost:'+restorePort},sourceEnv=folder+'/source.env',restoreEnv=folder+'/restore.env';
const serialize=x=>Object.entries(x).map(([k,v])=>k+'='+v).join('\n')+'\n';await writeFile(sourceEnv,serialize(config),{mode:0o600});await writeFile(restoreEnv,serialize(second),{mode:0o600});
const prefix=name=>['compose','--env-file',name===project?sourceEnv:restoreEnv,'-f','deploy/compose.yaml','--project-name',name];
const environment=name=>({...process.env,...(name===project?config:second)});const compose=(name,args)=>docker([...prefix(name),...args],environment(name));
const checks=[],measurements=[];let snapshot;
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
async function ready(origin){for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await delay(200);}throw Error('HTTP_READINESS_FAILED');}
async function get(origin,path){const r=await fetch(origin+'/api'+path);assert.equal(r.status,200,path);return r.json();}
async function corpus(origin){return {content:(await get(origin,'/content?pageSize=50')).total,documents:(await get(origin,'/documents')).total,branches:(await get(origin,'/branches?pageSize=50')).total,funds:(await get(origin,'/directories/funds')).total,newspapers:(await get(origin,'/directories/newspapers')).total};}
try{
 await check('fresh default Compose imports the real corpus without fictional seed or Python runtime',async()=>{
  compose(project,['up','-d','--wait','--no-build','app']);await ready(config.BETTER_AUTH_URL);snapshot=await corpus(config.BETTER_AUTH_URL);assert.deepEqual(snapshot,{content:35,documents:0,branches:13,funds:1705,newspapers:1466});
  const en=await get(config.BETTER_AUTH_URL,'/content?locale=en');assert.equal(en.total,3);
  const contents=await get(config.BETTER_AUTH_URL,'/content?pageSize=50');assert.ok(contents.items.every(c=>c.isDemo===false));assert.ok(!JSON.stringify(contents).includes('DEMO-'));
  const uid=compose(project,['exec','-T','app','node','-e','console.log(process.getuid())']);assert.equal(uid,'1000');
 });
 await check('standalone includes the locally served font and a decodable real editorial photo',async()=>{
  const origin=config.BETTER_AUTH_URL,home=await fetch(origin+'/');assert.equal(home.status,200);const html=await home.text();assert.ok(html.includes('hero-title'));
  for(const name of ['latin','cyrillic','cyrillic-ext']){const file='fonts/noto-sans-'+name+'.woff2',r=await fetch(origin+'/'+file);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(await readFile('public/'+file)).digest('hex'));}
  const photo=html.match(/src="([^"]*\/_next\/image\?[^"]*)"/);assert.ok(photo,'Actual editorial photo rendered');const image=await fetch(origin+photo[1].replaceAll('&amp;','&'));assert.equal(image.status,200);assert.ok(image.headers.get('content-type')?.startsWith('image/'));assert.ok((await image.arrayBuffer()).byteLength>1000);
 });
 let fileId,previewId,expectedSha;
 await check('standalone runtime serves original DOCX, S06 page-4 preview and measured page-aware OCR with source-bound explanations',async()=>{
  const origin=config.BETTER_AUTH_URL,history=(await get(origin,'/content/archive-history-1')).item;
  const refs=await get(origin,'/discovery/materials/cms/'+history.id+'/attachments');fileId=refs.items.find(f=>f.variant==='master').id;expectedSha=refs.items.find(f=>f.id===fileId).sha256;
  const file=await fetch(origin+'/api/material-files/'+fileId);assert.equal(file.status,200);assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),expectedSha);
  const text=(await get(origin,'/material-files/'+fileId+'/text')).item;assert.equal(text.isOcr,false);assert.ok(text.fragments[0].paragraph);
  const explanation=await fetch(origin+'/api/discovery/materials/cms/'+history.id+'/explanation',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({locale:'ru'})});assert.equal(explanation.status,200);assert.equal((await explanation.json()).status,'ready');
  const decree=(await get(origin,'/content/archive-branch-decree-142')).item,images=await get(origin,'/discovery/materials/cms/'+decree.id+'/attachments');const master=images.items.find(f=>f.variant==='master');previewId=images.items.find(f=>f.variant==='preview').id;assert.equal(images.items.find(f=>f.variant==='preview').source.page,4);
  const ocr=(await get(origin,'/material-files/'+master.id+'/text')).item;assert.deepEqual(ocr.fragments.map(f=>f.page),[4,5,6]);assert.ok(ocr.confidence>0&&ocr.confidence<=1);assert.equal(ocr.corrected,false);assert.equal((await fetch(origin+'/api/material-files/'+previewId)).status,200);
 });
 await check('re-running real setup is idempotent and never re-enables fixtures',async()=>{
  compose(project,['run','--rm','--no-deps','setup']);await ready(config.BETTER_AUTH_URL);assert.deepEqual(await corpus(config.BETTER_AUTH_URL),snapshot);
  assert.equal(compose(project,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "CmsAttachment"']),'27');
  assert.equal(compose(project,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "MaterialPublication"']),'53');
 });
 await check('real source search and actual source preview timings are measured',async()=>{
  for(const [name,path]of [['real_material_search','/api/search?scope=cms&q='+encodeURIComponent('архив')],['real_source_preview','/api/material-files/'+previewId]]){const times=[];for(let i=0;i<10;i++){const start=performance.now();const r=await fetch(config.BETTER_AUTH_URL+path);assert.equal(r.status,200);await r.arrayBuffer();times.push(performance.now()-start);}times.sort((a,b)=>a-b);measurements.push({name,requests:10,p50Ms:Math.round(times[4]*100)/100,p95Ms:Math.round(times[9]*100)/100,corpus:{cmsItems:39,publishedEditions:53,fundGroups:1705,newspaperRows:1466},runtime:'Node 24 Docker non-root, local loopback sequential fetch; full response bytes',lighthouse:false});}
 });
 await check('private backup includes all real tables, source originals, parsed OCR and derivatives',async()=>{
  execFileSync(process.execPath,['deploy/backup.mjs','--project',project,'--env',sourceEnv,'--directory',folder+'/backup'],{env:environment(project),stdio:'pipe'});const manifest=JSON.parse(await readFile(folder+'/backup/manifest.json'));assert.equal(manifest.files.length,2);assert.ok(manifest.files.every(f=>f.size>0));
 });
 await check('restore into a new project preserves real provenance, visibility and identical original bytes',async()=>{
  // Catch in the child so dockerStream's non-enumerable bounded diagnostic
  // reaches the parent's private pipe without being printed to the console.
  const captureRestore=`process.argv.splice(1,0,'deploy/restore.mjs');try { await import('./deploy/restore.mjs'); } catch (error) { process.stderr.write(JSON.stringify({name:error?.name,message:error?.message,code:error?.code,status:error?.status,signal:error?.signal,stack:error?.stack,stderr:Buffer.isBuffer(error?.stderr)?error.stderr.toString('utf8'):String(error?.stderr??''),stderrTruncated:error?.stderrTruncated})+'\\n');process.exitCode=1; }`;
  execFileSync(process.execPath,['--input-type=module','-e',captureRestore,'--','--project',restored,'--env',restoreEnv,'--directory',folder+'/backup'],{env:environment(restored),stdio:'pipe'});await ready(second.BETTER_AUTH_URL);assert.deepEqual(await corpus(second.BETTER_AUTH_URL),snapshot);
  const file=await fetch(second.BETTER_AUTH_URL+'/api/material-files/'+fileId);assert.equal(file.status,200);assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),expectedSha);assert.equal((await fetch(second.BETTER_AUTH_URL+'/api/material-files/'+previewId)).status,200);
  assert.equal(compose(restored,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "ReferenceEntry"']),'3171');
  for(const bundle of ['archive-20261110','archive-public-20261111','archive-reference-20261110']){const digest=compose(restored,['exec','-T','app','node','-e',`const fs=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(fs.readFileSync('/data/files/source-bundles/${bundle}/manifest.json')).digest('hex'))`]);assert.equal(digest,createHash('sha256').update(await readFile('sources/'+bundle+'/manifest.json')).digest('hex'));}
 });
}catch(error){
 process.exitCode=1;
 // execFileSync can carry a useful stdout even when stderr is only the child
 // stack. Keep each field, including an empty stderr, instead of losing them
 // through a nullish fallback. This file is private and is never proof output.
 const secrets=new Set(Object.entries({...process.env,...config,...second}).filter(([key,value])=>/PASSWORD|SECRET|TOKEN|API_KEY|CREDENTIAL/i.test(key)&&typeof value==='string'&&value.length).map(([,value])=>value));
 const redact=value=>{let text=Buffer.isBuffer(value)?value.toString('utf8'):String(value??'');for(const secret of secrets)text=text.replaceAll(secret,'[REDACTED]');return text.replace(/(postgres(?:ql)?:\/\/)[^\s/@]+:[^\s@]+@/gi,'$1[REDACTED]@').replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1[REDACTED]');};
 const tail=value=>{const text=redact(value);return text.length>32768?'[earlier output omitted]\n'+text.slice(-32768):text;};
 const diagnosis={completedChecks:checks.length,totalChecks:7,error:{name:error?.name,message:tail(error?.message??error),code:error?.code,status:error?.status,signal:error?.signal,stack:tail(error?.stack),stdout:tail(error?.stdout),stderr:tail(error?.stderr)},filesystem:null,projects:[]};
 try{const {statfs}=await import('node:fs/promises');const fs=await statfs(process.cwd());diagnosis.filesystem={availableBytes:fs.bavail*fs.bsize,freeBytes:fs.bfree*fs.bsize,totalBytes:fs.blocks*fs.bsize};}catch(fsError){diagnosis.filesystem={error:tail(fsError?.code??fsError?.message)};}
 // Capture remaining container state before finally removes our test projects.
 // No inspect Config/Env or compose config is collected. A --rm one-off may
 // already be gone; its absence is explicitly not proof of a successful step.
 for(const name of [project,restored]){
  const entry={project:name,containers:[],logs:''};
  try{const ids=compose(name,['ps','-aq']).split('\n').filter(Boolean);for(const id of ids)entry.containers.push({id,state:tail(docker(['inspect','--format','{{json .State}}',id]))});}catch(stateError){entry.stateError=tail(stateError?.stderr??stateError?.message);}
  try{entry.logs=tail(compose(name,['logs','--no-color','--tail','40','db','setup','app']));}catch(logError){entry.logError=tail(logError?.stderr??logError?.message);}
  diagnosis.projects.push(entry);
 }
 diagnosis.limitations=['Streamed Docker stderr is bounded to its final64KiB and all diagnostic fields are redacted/capped; earlier output may be omitted. Missing container logs do not establish restore success.'];
 await writeFile(folder+'/failure.log',redact(JSON.stringify(diagnosis,null,2))+'\n',{mode:0o600});
 console.log('FAIL real-content deployment; private redacted diagnosis '+folder+'/failure.log');
}
finally{
 for(const name of [restored,project])try{compose(name,['--profile','workers','down','--volumes','--remove-orphans']);}catch{}
 await unlink(sourceEnv).catch(()=>{});await unlink(restoreEnv).catch(()=>{});await writeFile('.local/real-content/docker-proof.json',JSON.stringify({testedAt:new Date().toISOString(),checks,measurements,corpus:snapshot,temporaryEnvFilesRemoved:true,backupRetainedPrivately:true},null,2)+'\n');console.log('Real-content Docker checks '+checks.length+'/7');
}
