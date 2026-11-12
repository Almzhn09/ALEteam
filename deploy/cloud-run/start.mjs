// Ephemeral Cloud Run preview: all archival data is restored from the repository.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,open,writeFile,unlink,cp,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
if(process.env.DATABASE_URL && process.env.ALE_PREPARE_ONLY!=='1'){
 await import('./persistent.mjs');
}else{
const folder=await mkdtemp('/tmp/ale-cloud-run-');await mkdir(folder+'/socket');await mkdir(folder+'/files');
const bin='/usr/lib/postgresql/15/bin/',password=randomBytes(32).toString('hex'),adminPassword=randomBytes(32).toString('hex');
await writeFile(folder+'/pg-password',adminPassword,{mode:0o600});
execFileSync(bin+'initdb',['-D',folder+'/postgres','--username=postgres','--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile='+folder+'/pg-password','--encoding=UTF8','--locale=C.UTF-8'],{stdio:'ignore'});
await unlink(folder+'/pg-password');
const log=await open(folder+'/postgres.log','a',0o600);
const postgres=spawn(bin+'postgres',['-D',folder+'/postgres','-h','127.0.0.1','-p','5432','-k',folder+'/socket','-c','shared_buffers=32MB','-c','max_connections=40'],{stdio:['ignore',log.fd,log.fd]});await log.close();
let app,jobs,stopping=false;
async function stop(code=0){if(stopping)return;stopping=true;app?.kill('SIGTERM');jobs?.kill('SIGTERM');try{execFileSync(bin+'pg_ctl',['-D',folder+'/postgres','-m','fast','-w','stop'],{stdio:'ignore',timeout:15000});}catch{postgres.kill('SIGTERM');}process.exit(code);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
try{
 let ready=false;
 for(let i=0;i<100;i++){const client=new pg.Client({connectionString:`postgresql://postgres:${adminPassword}@127.0.0.1:5432/postgres`});try{await client.connect();await client.query(`CREATE ROLE archive_app LOGIN PASSWORD '${password}'`);await client.query('CREATE DATABASE archive OWNER archive_app');ready=true;break;}catch{if(postgres.exitCode!==null)throw Error('POSTGRES_START_FAILED');await delay(200);}finally{await client.end().catch(()=>{});}}
 if(!ready)throw Error('POSTGRES_START_TIMEOUT');
 const env={...process.env,DATABASE_URL:`postgresql://archive_app:${password}@127.0.0.1:5432/archive`,FILE_STORAGE_ROOT:folder+'/files',ARCHIVE_CONTENT_MODE:'real',ALLOW_DEMO_SEED:'0',HOSTNAME:'0.0.0.0',PORT:process.env.PORT||'8080'};
 delete env.TEST_DATABASE_URL;delete env.SYNTHETIC_FIXTURE_DATABASE;
 function run(script,args=[]){execFileSync(process.execPath,['--import','tsx',script,...args],{env,stdio:'inherit'});}
 let snapshot=false;try{await access('/app/.cloud-preview-seed/source.dump');snapshot=true;}catch{}
 if(snapshot){
  execFileSync(bin+'pg_restore',['--no-owner','--no-acl','--host=127.0.0.1','--port=5432','--username=archive_app','--dbname=archive','/app/.cloud-preview-seed/source.dump'],{env:{...env,PGPASSWORD:password},stdio:'inherit'});
  await cp('/app/.cloud-preview-seed/files',folder+'/files',{recursive:true});
 }else{run('scripts/migrate.ts');run('scripts/real-content.ts',['--apply','--report='+folder+'/import.json']);}
 if(process.env.ALE_PREPARE_ONLY==='1'){
  run('scripts/publish-reference-originals.ts',['--apply']);
  const client=new pg.Client({connectionString:env.DATABASE_URL});await client.connect();
  try{const users=await client.query('SELECT count(*)::int AS count FROM "User" WHERE "isActive"=true');if(users.rows[0].count!==0)throw Error('SNAPSHOT_HAS_ACTIVE_USERS');}finally{await client.end();}
  await mkdir('/app/.cloud-preview-seed',{recursive:true});
  execFileSync(bin+'pg_dump',['--format=custom','--no-owner','--no-acl','--host=127.0.0.1','--port=5432','--username=archive_app','--dbname=archive','--file=/app/.cloud-preview-seed/source.dump'],{env:{...env,PGPASSWORD:password},stdio:'inherit'});
  await cp(folder+'/files','/app/.cloud-preview-seed/files',{recursive:true});await stop(0);
 }

 if(env.STAFF_ADMIN_EMAIL&&env.STAFF_ADMIN_PASSWORD&&env.STAFF_ADMIN_NAME)execFileSync(process.execPath,['/app/.cloud-preview-seed/bin/bootstrap.mjs'],{env,stdio:'inherit'});
 jobs=spawn(process.execPath,['/app/.cloud-preview-seed/bin/jobs.mjs'],{env,stdio:'inherit'});
 app=spawn(process.execPath,['--use-env-proxy','server.js'],{env,stdio:'inherit'});
 jobs.on('exit',code=>{if(!stopping)void stop(code??1);});
 app.on('exit',code=>void stop(code??1));postgres.on('exit',()=>{if(!stopping)void stop(1);});
}catch(error){console.error('CLOUD_RUN_PREVIEW_START_FAILED',error?.code||error?.name);await stop(1);}

}
