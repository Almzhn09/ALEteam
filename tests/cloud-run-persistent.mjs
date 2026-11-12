// Docker acceptance: app restarts must preserve external database records and sessions.
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {writeFile,unlink,mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
const id=randomBytes(6).toString('hex'),network='ale-persist-'+id,postgres=network+'-db',app=network+'-app',origin='http://localhost:3124';
const password=randomBytes(24).toString('hex'),envFile='.local/'+network+'.env',dbEnv=envFile+'.db';
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
await mkdir('.local',{recursive:true});let client;const checks=[];
try{
 await writeFile(dbEnv,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
 docker(['network','create',network]);docker(['run','-d','--name',postgres,'--network',network,'--env-file',dbEnv,'-p','127.0.0.1::5432','postgres:16.14-alpine']);
 const port=docker(['port',postgres,'5432/tcp']).split(':').at(-1);
 for(let i=0;i<100;i++){client=new pg.Client({connectionString:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres?sslmode=disable`});try{await client.connect();break;}catch{await client.end().catch(()=>{});client=undefined;await delay(300);}}
 assert.ok(client,'PostgreSQL ready');
 await writeFile(envFile,`DATABASE_URL=postgresql://postgres:${password}@${postgres}:5432/postgres?sslmode=disable\nBETTER_AUTH_URL=${origin}\nBETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}\nSTAFF_ADMIN_EMAIL=persistence@example.test\nSTAFF_ADMIN_PASSWORD=${password}\nSTAFF_ADMIN_NAME=Persistence acceptance\n`,{mode:0o600});
 docker(['run','-d','--name',app,'--network',network,'--env-file',envFile,'-p','127.0.0.1:3124:8080',process.env.ALE_CLOUD_IMAGE||'aleteam-cloud-preview:local']);
 async function ready(){for(let i=0;i<150;i++){try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}if(docker(['inspect','--format','{{.State.Running}}',app])!=='true')throw Error('Container stopped');await delay(400);}throw Error('Health timeout');}
 await ready();assert.equal((await client.query('SELECT count(*)::int AS n FROM "User" WHERE "isActive"=true')).rows[0].n,1);checks.push('Empty external database restored, migrated and admin bootstrapped');
 const login=await fetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'persistence@example.test',password})});assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 await client.query('CREATE TABLE "DeploymentPersistenceProbe" (value text PRIMARY KEY)');await client.query('INSERT INTO "DeploymentPersistenceProbe" VALUES ($1)',[id]);
 const before=(await(await fetch(origin+'/api/content/archive-contacts')).json()).item.id;
 // Simulate Neon rows created by another build without changing IDs or source hashes.
 // This only changes the isolated database owned by this acceptance test.
 const attachments=(await client.query(`SELECT id,"expectedSha256","previewSha256","mimeType" FROM "CmsAttachment" WHERE state='PUBLISHED'`)).rows;
 assert.ok(attachments.some(r=>r.mimeType==='application/pdf')&&attachments.some(r=>r.mimeType==='image/jpeg'));
 for(const row of attachments)await client.query('UPDATE "CmsAttachment" SET "storageKey"=$1,"previewKey"=$2 WHERE id=$3',['uploads/'+randomUUID()+'.bin',row.previewSha256?'previews/'+randomUUID()+'.png':null,row.id]);
 docker(['restart',app]);await ready();assert.equal((await client.query('SELECT value FROM "DeploymentPersistenceProbe"')).rows[0].value,id);assert.equal((await(await fetch(origin+'/api/content/archive-contacts')).json()).item.id,before);checks.push('Custom records and source IDs survive app restart without replacing database');
 let verifiedFiles=0;
 for(const row of attachments){
  for(const variant of [{id:row.id,sha:row.expectedSha256},...(row.previewSha256?[{id:'preview-'+row.id,sha:row.previewSha256}]:[])]){
   const response=await fetch(origin+'/api/material-files/'+variant.id);assert.equal(response.status,200,variant.id);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),variant.sha);verifiedFiles++;
  }
 }
 checks.push('All '+verifiedFiles+' source originals and previews survive changed staging paths across builds');
 const session=await fetch(origin+'/api/auth/get-session',{headers:{Cookie:cookie}});assert.equal(session.status,200);assert.equal((await session.json()).user.email,'persistence@example.test');checks.push('Authenticated user session survives restart');
 console.log(JSON.stringify({checks,passed:checks.length}));await writeFile('.local/cloud-run-persistent-proof.json',JSON.stringify({testedAt:new Date().toISOString(),checks,scope:'Local Docker external PostgreSQL acceptance, not a Neon production deployment'},null,2)+'\n');
}finally{
 await client?.end().catch(()=>{});
 const logs=spawnSync('docker',['logs',app],{encoding:'utf8'});await writeFile('.local/cloud-run-persistent-runtime.log',String(logs.stdout??'')+String(logs.stderr??''),{mode:0o600});
 for(const name of [app,postgres])try{docker(['rm','-f',name]);}catch{}
 try{docker(['network','rm',network]);}catch{}
 await Promise.all([envFile,dbEnv].map(p=>unlink(p).catch(()=>{})));
}
