// External PostgreSQL: initialize only an empty database, then apply tracked migrations.
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {restoreSourceFiles} from './restore-source-files.mjs';
import pg from 'pg';
const env={...process.env,ARCHIVE_CONTENT_MODE:'real',ALLOW_DEMO_SEED:'0',HOSTNAME:'0.0.0.0',PORT:process.env.PORT||'8080'};
delete env.TEST_DATABASE_URL;delete env.SYNTHETIC_FIXTURE_DATABASE;
const files=await mkdtemp('/tmp/ale-source-files-');env.FILE_STORAGE_ROOT=files;
let app,jobs,stopping=false;
function stop(code=0){if(stopping)return;stopping=true;process.exitCode=code;app?.kill('SIGTERM');jobs?.kill('SIGTERM');setTimeout(()=>process.exit(code),1000).unref();}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
function run(name,args=[]){execFileSync(process.execPath,['/app/.cloud-preview-seed/bin/'+name+'.mjs',...args],{env,stdio:'inherit'});}
const client=new pg.Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:30000});
try{
 await client.connect();
 // This requires a direct (not transaction-pooled) database endpoint.
 await client.query('SELECT pg_advisory_lock(782032102)');
 try{
  const tables=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if(tables.rowCount===0){
   const url=new URL(env.DATABASE_URL);
   const restoreEnv={...env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:url.searchParams.get('sslmode')||'require',PGCONNECT_TIMEOUT:'30'};
   // One transaction: a failed import never leaves a half-restored database.
   execFileSync('/usr/lib/postgresql/15/bin/pg_restore',['--single-transaction','--exit-on-error','--no-owner','--no-acl','--dbname='+restoreEnv.PGDATABASE,'/app/.cloud-preview-seed/source.dump'],{env:restoreEnv,stdio:['ignore','ignore','pipe']});
   console.log('PERSISTENT_DATABASE_SOURCE_RESTORED');
  }else{
   const own=await client.query("SELECT to_regclass('public.\"ArchiveMigration\"') AS migrations");
   if(!own.rows[0].migrations)throw Error('DATABASE_NOT_AN_ARCHIVE_DATABASE');
  }
  run('migrate');
  if(env.STAFF_ADMIN_EMAIL&&env.STAFF_ADMIN_PASSWORD&&env.STAFF_ADMIN_NAME){
   const admin=await client.query(`SELECT 1 FROM "StaffAssignment" a JOIN "User" u ON u.id=a."userId" JOIN "StaffPermission" p ON p."roleId"=a."roleId" WHERE a."branchId" IS NULL AND u."isActive"=true AND p.permission='staff.roles.manage' LIMIT 1`);
   if(admin.rowCount===0)run('bootstrap');
  }
 }finally{await client.query('SELECT pg_advisory_unlock(782032102)');}
 // A rebuild gives staging paths new random UUIDs. Preserve the IDs and paths
 // already stored in Neon, matching originals by their verified immutable bytes.
 const attachments=await client.query(`SELECT "storageKey","expectedSha256","expectedBytes","previewKey","previewSha256","previewBytes" FROM "CmsAttachment" WHERE state='PUBLISHED'`);
 const restored=await restoreSourceFiles({sourceRoot:'/app/.cloud-preview-seed/files',targetRoot:files,attachments:attachments.rows});
 console.log('PERSISTENT_SOURCE_FILES',JSON.stringify(restored));
 run('reference-originals',['--apply']);
 await client.end();
 jobs=spawn(process.execPath,['/app/.cloud-preview-seed/bin/jobs.mjs'],{env,stdio:'inherit'});
 app=spawn(process.execPath,['--use-env-proxy','server.js'],{env,stdio:'inherit'});
 for(const child of [app,jobs]){child.on('error',()=>stop(1));child.on('exit',code=>stop(code??1));}
}catch(error){await client.end().catch(()=>{});console.error('PERSISTENT_DATABASE_START_FAILED',error?.code||error?.name);process.exitCode=1;stop(1);}
