import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {db} from './db';
import {realContentPackage} from './real-content-package';
async function fileHash(file:string){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function identity(){const rows=await db.$queryRawUnsafe<{name:string;appliedAt:Date}[]>('SELECT name,"appliedAt" FROM "ArchiveMigration" ORDER BY name LIMIT 1');return createHash('sha256').update(JSON.stringify([new URL(process.env.DATABASE_URL!).pathname,rows])).digest('hex');}
async function capture(program:string,args:string[],file:string,env:NodeJS.ProcessEnv){const child=spawn(program,args,{env,stdio:['ignore','pipe','pipe']});let failure='';child.stderr.on('data',c=>{if(failure.length<2000)failure+=c;});const completion=new Promise<void>((resolve,reject)=>{child.on('error',()=>reject(Error('BACKUP_CLIENT_UNAVAILABLE')));child.on('exit',code=>code===0?resolve():reject(Error('BACKUP_COMMAND_FAILED')));});await Promise.all([pipeline(child.stdout,createWriteStream(file,{mode:0o600,flags:'wx'})),completion]);}
export async function backupBeforeRealImport(){
 const url=new URL(process.env.DATABASE_URL!);
 if(process.env.REAL_CONTENT_TEST_SKIP_BACKUP==='1'){if(!url.pathname.endsWith('_test'))throw Error('TEST_BACKUP_SKIP_REQUIRES_TEST_DATABASE');return {kind:'isolated-test-fixtures'};}
 if(await db.user.count()===0&&await db.document.count()===0&&await db.contentItem.count()===0)return {kind:'empty-database'};
 const pack=await realContentPackage();let release;try{release=await db.realContentBinding.findUnique({where:{namespace_sourceKey_locale:{namespace:pack.namespace,sourceKey:'__release__',locale:'none'}}});}catch(error){if((error as {code?:string}).code!=='P2021')throw error;}
 if(release?.inputHash===pack.digest&&await db.document.count({where:{isDemo:true,isPublic:true}})===0)return {kind:'idempotent-existing-release',digest:pack.digest};
 if(process.env.REAL_CONTENT_BACKUP_MANIFEST){const file=path.resolve(process.env.REAL_CONTENT_BACKUP_MANIFEST),manifest=JSON.parse(await readFile(file,'utf8'));if(manifest.databaseIdentity!==await identity())throw Error('BACKUP_DATABASE_MISMATCH');for(const entry of manifest.files){if(!['database.dump','files.tar'].includes(entry.name)||await fileHash(path.join(path.dirname(file),entry.name))!==entry.sha256)throw Error('BACKUP_INTEGRITY_FAILED');}if(manifest.files.length!==2)throw Error('BACKUP_INCOMPLETE');return {kind:'verified-existing-backup',manifest:file};}
 const directory=path.resolve('.local/real-content/backups',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(directory,{recursive:true,mode:0o700});
 const args=['--format=custom','--no-owner','--username',decodeURIComponent(url.username),'--dbname',decodeURIComponent(url.pathname.slice(1))],env={...process.env,PGPASSWORD:decodeURIComponent(url.password),PGHOST:url.hostname,PGPORT:url.port||'5432'};
 let program='pg_dump',clientArgs=args;
 try{execFileSync('pg_dump',['--version'],{stdio:'ignore'});}catch{
  if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('BACKUP_REQUIRED: provide a verified REAL_CONTENT_BACKUP_MANIFEST before upgrading a nonempty remote database');
  let ids:string[];try{ids=execFileSync('docker',['ps','-q'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);}catch{throw Error('BACKUP_REQUIRED: pg_dump or a verified backup manifest is required');}
  const matches=ids.filter(id=>{const info=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];return info.NetworkSettings.Ports?.['5432/tcp']?.some((p:{HostPort:string})=>p.HostPort===(url.port||'5432'));});if(matches.length!==1)throw Error('BACKUP_DATABASE_CONTAINER_NOT_UNIQUE');
  program='docker';clientArgs=['exec','-e','PGPASSWORD',matches[0],'pg_dump','--host','127.0.0.1',...args];
 }
 await capture(program,clientArgs,path.join(directory,'database.dump'),env);
 const storage=path.resolve(process.env.FILE_STORAGE_ROOT||'.local/files');await mkdir(storage,{recursive:true,mode:0o700});await capture('tar',['-C',storage,'-cf','-','.'],path.join(directory,'files.tar'),process.env);
 const files=[];for(const name of ['database.dump','files.tar'])files.push({name,bytes:(await stat(path.join(directory,name))).size,sha256:await fileHash(path.join(directory,name))});
 const manifest=path.join(directory,'manifest.json');await writeFile(manifest,JSON.stringify({version:1,createdAt:new Date().toISOString(),databaseIdentity:await identity(),files},null,2)+'\n',{flag:'wx',mode:0o600});return {kind:'created-private-backup',manifest};
}
