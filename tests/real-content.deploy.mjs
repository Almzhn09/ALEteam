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
const imageManifest=JSON.parse(await readFile('sources/archive-visual-20261111/manifest.json','utf8'));
const readyPhotos=imageManifest.images.filter(image=>image.origin==='official_archive_site'&&image.decoderValidation.status==='complete_decode');
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
  const photo=html.match(/src="(\/api\/material-files\/[a-zA-Z0-9_-]+)"/);assert.ok(photo,'Verified CMS photograph rendered');const image=await fetch(origin+photo[1]);assert.equal(image.status,200);assert.ok(image.headers.get('content-type')?.startsWith('image/'));assert.match(image.headers.get('cache-control')||'',/no-store/);const imageSha=createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex');assert.ok(readyPhotos.some(photo=>photo.sha256===imageSha));
 });
 let fileId,previewId,expectedSha;
 await check('standalone runtime serves original DOCX, S06 page-4 preview and measured page-aware OCR with source-bound explanations',async()=>{
  const origin=config.BETTER_AUTH_URL,history=(await get(origin,'/content/archive-history-1')).item;
  const refs=await get(origin,'/discovery/materials/cms/'+history.id+'/attachments');fileId=refs.items.find(f=>f.variant==='master'&&f.mimeType.includes('wordprocessingml')).id;expectedSha=refs.items.find(f=>f.id===fileId).sha256;
  const file=await fetch(origin+'/api/material-files/'+fileId);assert.equal(file.status,200);assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),expectedSha);
  const text=(await get(origin,'/material-files/'+fileId+'/text')).item;assert.equal(text.isOcr,false);assert.ok(text.fragments[0].paragraph);
  const explanation=await fetch(origin+'/api/discovery/materials/cms/'+history.id+'/explanation',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({locale:'ru'})});assert.equal(explanation.status,200);assert.equal((await explanation.json()).status,'ready');
  const decree=(await get(origin,'/content/archive-branch-decree-142')).item,images=await get(origin,'/discovery/materials/cms/'+decree.id+'/attachments');const master=images.items.find(f=>f.variant==='master');previewId=images.items.find(f=>f.variant==='preview').id;assert.equal(images.items.find(f=>f.variant==='preview').source.page,4);
  const ocr=(await get(origin,'/material-files/'+master.id+'/text')).item;assert.deepEqual(ocr.fragments.map(f=>f.page),[4,5,6]);assert.ok(ocr.confidence>0&&ocr.confidence<=1);assert.equal(ocr.corrected,false);assert.equal((await fetch(origin+'/api/material-files/'+previewId)).status,200);
 });
 await check('re-running real setup is idempotent and never re-enables fixtures',async()=>{
  compose(project,['run','--rm','--no-deps','setup']);await ready(config.BETTER_AUTH_URL);assert.deepEqual(await corpus(config.BETTER_AUTH_URL),snapshot);
  assert.equal(compose(project,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "CmsAttachment"']),String(27+readyPhotos.length));
  assert.equal(compose(project,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "MaterialPublication"']),'53');
 });
 await check('an existing Docker site upgrades with an identity-bound backup and immutable source history',async()=>{
  const before=(await get(config.BETTER_AUTH_URL,'/content/archive-contacts')).item;
  const oldFiles=await get(config.BETTER_AUTH_URL,'/discovery/materials/cms/'+before.id+'/attachments');
  const oldMaster=oldFiles.items.find(f=>f.variant==='master');assert.ok(oldMaster);
  // Simulate an untouched edition from a prior package in this disposable project only.
  const simulate=`
   const {db}=await import('./src/server/db.ts');
   const {realContentPackage}=await import('./src/server/real-content-package.ts');
   const {canonicalHash:hash}=await import('./src/server/catalog-import-schema.ts');
   const fs=await import('node:fs/promises');
   try{
    const pack=await realContentPackage(),row=pack.rows.find(r=>r.sourceKey==='contacts');
    const binding=await db.realContentBinding.findUniqueOrThrow({where:{namespace_sourceKey_locale:{namespace:pack.namespace,sourceKey:'contacts',locale:'ru'}}});
    const payload={...row.payload,title:'Isolated prior package title'};
    await db.contentRevision.update({where:{id:binding.data.revisionId},data:{payload}});
    await db.realContentBinding.update({where:{id:binding.id},data:{inputHash:hash({...row,payload}),outputHash:hash(payload)}});
    await db.realContentBinding.updateMany({where:{namespace:pack.namespace,sourceKey:'__release__'},data:{inputHash:hash('isolated prior release')}});
    const file='/data/files/source-bundles/archive-public-20261111/manifest.json',manifest=JSON.parse(await fs.readFile(file,'utf8'));
    manifest.review='Isolated prior manifest; deployment upgrade verification';await fs.writeFile(file,JSON.stringify(manifest));
   }finally{await db.$disconnect();}`;
  compose(project,['run','--rm','--no-deps','-T','setup','node','--import','tsx','--input-type=module','-e',simulate]);
  execFileSync(process.execPath,['deploy/upgrade.mjs','--project',project,'--env',sourceEnv],{env:environment(project),stdio:'pipe'});
  await ready(config.BETTER_AUTH_URL);const after=(await get(config.BETTER_AUTH_URL,'/content/archive-contacts')).item;
  assert.equal(after.id,before.id);assert.equal(after.payload.title,before.payload.title);assert.notEqual(after.updatedAt,before.updatedAt);
  assert.equal((await fetch(config.BETTER_AUTH_URL+oldMaster.href)).status,404);
  const newFiles=await get(config.BETTER_AUTH_URL,'/discovery/materials/cms/'+before.id+'/attachments');assert.equal(newFiles.items.find(f=>f.variant==='master').sha256,oldMaster.sha256);
  assert.deepEqual(await corpus(config.BETTER_AUTH_URL),snapshot);
  const history=compose(project,['exec','-T','app','node','-e',`const fs=require('node:fs');console.log(fs.readdirSync('/data/files/source-bundles/archive-public-20261111/.manifest-history').length)`]);assert.ok(Number(history)>=2);
  assert.equal(docker(['volume','ls','--filter','name='+project+'_upgrade_backup_','--format','{{.Name}}']),'');
 });
 await check('real source search and actual source preview timings are measured',async()=>{
  for(const [name,path]of [['real_material_search','/api/search?scope=cms&q='+encodeURIComponent('архив')],['real_source_preview','/api/material-files/'+previewId]]){const times=[];for(let i=0;i<10;i++){const start=performance.now();const r=await fetch(config.BETTER_AUTH_URL+path);assert.equal(r.status,200);await r.arrayBuffer();times.push(performance.now()-start);}times.sort((a,b)=>a-b);measurements.push({name,requests:10,p50Ms:Math.round(times[4]*100)/100,p95Ms:Math.round(times[9]*100)/100,corpus:{cmsItems:39,publishedEditions:53,fundGroups:1705,newspaperRows:1466},runtime:'Node 24 Docker non-root, local loopback sequential fetch; full response bytes',lighthouse:false});}
 });
 await check('private backup includes all real tables, source originals, parsed OCR and derivatives',async()=>{
  execFileSync(process.execPath,['deploy/backup.mjs','--project',project,'--env',sourceEnv,'--directory',folder+'/backup'],{env:environment(project),stdio:'pipe'});const manifest=JSON.parse(await readFile(folder+'/backup/manifest.json'));assert.equal(manifest.files.length,2);assert.ok(manifest.files.every(f=>f.size>0));
 });
 await check('restore into a new project preserves real provenance, visibility and identical original bytes',async()=>{
  execFileSync(process.execPath,['deploy/restore.mjs','--project',restored,'--env',restoreEnv,'--directory',folder+'/backup'],{env:environment(restored),stdio:'pipe'});await ready(second.BETTER_AUTH_URL);assert.deepEqual(await corpus(second.BETTER_AUTH_URL),snapshot);
  const file=await fetch(second.BETTER_AUTH_URL+'/api/material-files/'+fileId);assert.equal(file.status,200);assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),expectedSha);assert.equal((await fetch(second.BETTER_AUTH_URL+'/api/material-files/'+previewId)).status,200);
  assert.equal(compose(restored,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "ReferenceEntry"']),'3171');
  for(const bundle of ['archive-20261110','archive-public-20261111','archive-reference-20261110']){const digest=compose(restored,['exec','-T','app','node','-e',`const fs=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(fs.readFileSync('/data/files/source-bundles/${bundle}/manifest.json')).digest('hex'))`]);assert.equal(digest,createHash('sha256').update(await readFile('sources/'+bundle+'/manifest.json')).digest('hex'));}
 });
}catch(error){process.exitCode=1;let message=String(error.stderr??error.stack??error);for(const name of [project,restored])try{message+='\n'+compose(name,['logs','--no-color','setup','app']);}catch{}for(const[k,v]of Object.entries(config))if(/PASSWORD|SECRET/.test(k))message=message.replaceAll(v,'[REDACTED]');await writeFile(folder+'/failure.log',message,{mode:0o600});console.log('FAIL real-content deployment; private redacted diagnosis '+folder+'/failure.log');}
finally{
 for(const name of [restored,project])try{compose(name,['--profile','workers','down','--volumes','--remove-orphans']);}catch{}
 await unlink(sourceEnv).catch(()=>{});await unlink(restoreEnv).catch(()=>{});await writeFile('.local/real-content/docker-proof.json',JSON.stringify({testedAt:new Date().toISOString(),checks,measurements,corpus:snapshot,temporaryEnvFilesRemoved:true,backupRetainedPrivately:true},null,2)+'\n');console.log('Real-content Docker checks '+checks.length+'/8');
}
