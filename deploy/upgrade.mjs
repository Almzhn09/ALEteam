// Upgrade an explicitly selected existing real-content project. Never reset its volumes.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,open,rm} from 'node:fs/promises';
import path from 'node:path';
import {composePrefix,docker,option} from './docker.mjs';

const project=option('--project');
if(!project)throw Error('Specify --project EXISTING_PROJECT. Build the matching runtime/tools images first.');
const prefix=composePrefix(project),run=Date.now().toString(36);
const folder=path.resolve('.local/deploy-upgrades',project+'-'+run),backup=path.join(folder,'backup');
await mkdir(folder,{recursive:true,mode:0o700});
const override=path.join(folder,'compose.json'),transfer=path.join(folder,'backup-transfer.tar');
const volume=project+'_upgrade_backup_'+run;
let setupStarted=false,volumeCreated=false,writesStarted=false,stopped=false,succeeded=false;
let originalApp='',originalJobs='';
let stage='validate',sensitiveValues=[];
try{
 const configuration=JSON.parse(docker([...prefix,'config','--format','json']));
 sensitiveValues=Object.values(configuration.services).flatMap(service=>Object.entries(service.environment||{}).filter(([key,value])=>/SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL/.test(key)&&typeof value==='string'&&value.length>3).map(([,value])=>value));
 if(configuration.services.setup.environment.ARCHIVE_CONTENT_MODE!=='real')throw Error('Upgrade requires ARCHIVE_CONTENT_MODE=real.');
 originalApp=docker([...prefix,'ps','-q','app']);originalJobs=docker([...prefix,'ps','-q','jobs']);
 if(!originalApp)throw Error('The selected project must have a running app.');
 const image=configuration.services.setup.image;
 docker(['image','inspect','--format','{{.Id}}',image]);
 // Pause requests/jobs before taking the DB + files snapshot.
 stopped=true;docker([...prefix,'stop','app','jobs']);stage='backup';
 execFileSync(process.execPath,['deploy/backup.mjs','--project',project,'--env',option('--env','deploy/.env'),'--directory',backup],{env:process.env,stdio:'pipe'});
 stage='backup-volume';docker(['volume','create',volume]);volumeCreated=true;
 // A separate short-lived volume avoids exposing the private host directory or depending on host UID.
 docker(['run','--rm','--user','0:0','--mount','type=volume,source='+volume+',target=/backup','--entrypoint','sh',image,'-c','chown 1000:1000 /backup && chmod 700 /backup']);
 const archive=await open(transfer,'wx',0o600);
 try{execFileSync('tar',['-C',backup,'-cf','-','.'],{stdio:['ignore',archive.fd,'pipe']});}finally{await archive.close();}
 stage='backup-transfer';const input=await open(transfer,'r');
 try{execFileSync('docker',['run','-i','--rm','--user','1000:1000','--mount','type=volume,source='+volume+',target=/backup','--entrypoint','tar',image,'-C','/backup','--no-same-owner','-xf','-'],{stdio:[input.fd,'pipe','pipe']});}finally{await input.close();}
 await writeFile(override,JSON.stringify({services:{setup:{environment:{REAL_CONTENT_BACKUP_MANIFEST:'/run/upgrade-backup/manifest.json'},volumes:[{type:'volume',source:'upgrade_backup',target:'/run/upgrade-backup',read_only:true}]}},volumes:{upgrade_backup:{name:volume,external:true}}}),{flag:'wx',mode:0o600});
 const upgraded=[...prefix,'-f',override];
 stage='setup';writesStarted=true;setupStarted=true;
 docker([...upgraded,'up','--no-deps','--no-build','--force-recreate','--abort-on-container-exit','--exit-code-from','setup','setup']);
 stage='app';docker([...upgraded,'up','-d','--wait','--no-deps','--no-build','--force-recreate','app']);
 if(originalJobs)docker([...upgraded,'--profile','workers','up','-d','--no-deps','--no-build','jobs']);
 succeeded=true;
 console.log(`Upgraded ${project}. Verified private backup retained at ${backup}; app is healthy.`);
}catch(error){
 process.exitCode=1;
 let diagnostic=String(error.stderr??error.stack??error);for(const value of sensitiveValues)diagnostic=diagnostic.replaceAll(value,'[REDACTED]');
 await writeFile(path.join(folder,'failure.log'),diagnostic,{mode:0o600});
 // Before migration starts the original stopped containers can safely resume unchanged.
 if(stopped&&!writesStarted){for(const id of [originalApp,originalJobs].filter(Boolean))try{docker(['start',id]);}catch{}}
 if(writesStarted){
  try{await writeFile(path.join(folder,'setup.log'),docker([...prefix,'logs','--no-color','setup']),{mode:0o600});}catch{}
  try{docker([...prefix,'stop','app','jobs']);}catch{}
 }
 console.error(writesStarted?`Upgrade stopped; site is paused. Inspect ${folder}/setup.log. Restore ${backup} into a NEW project if needed.`:'Upgrade stopped before migration; original containers were preserved. Check project, images and private backup permissions.');
}finally{
 // Remove only this command's temporary setup and backup staging resources.
 if(setupStarted)try{docker([...prefix,'rm','-f','setup']);}catch{}
 if(volumeCreated)try{docker(['volume','rm',volume]);}catch{}
 await rm(override,{force:true});await rm(transfer,{force:true});
 await writeFile(path.join(folder,'report.json'),JSON.stringify({project,testedAt:new Date().toISOString(),succeeded,stage,writesStarted,backup,temporaryBackupVolume:volume},null,2)+'\n',{mode:0o600});
}
