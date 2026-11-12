// Accept published team UI against a fresh, explicitly isolated test DB and production build.
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const database=process.env.TEST_DATABASE_URL;
if(!database||!new URL(database).pathname.endsWith('_test'))throw Error('Dedicated TEST_DATABASE_URL ending in _test required');
const base='http://localhost:3119',folder='.local/team-ui';
const env={...process.env,DATABASE_URL:database,TEST_DATABASE_URL:database,BASE_URL:base,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),ALLOW_DEMO_SEED:'1',DEMO_AUTHOR_PASSWORD:randomBytes(32).toString('hex'),DEMO_MODERATOR_PASSWORD:randomBytes(32).toString('hex'),STAFF_ADMIN_EMAIL:'team-ui-admin@example.test',STAFF_ADMIN_NAME:'ДЕМО приёмка команды',STAFF_ADMIN_PASSWORD:randomBytes(32).toString('hex'),ASSISTANT_MODE:'retrieval',MODERATION_MODE:'local',NEXT_PUBLIC_API_MOCK:'0',CHROMIUM_PATH:process.env.CHROMIUM_PATH??'/usr/bin/chromium',OUT:folder+'/visual/'};
process.env.DATABASE_URL=database;
const {db}=await import('../src/server/db');
let app:ChildProcess|undefined;const checks:{name:string;exitCode:number|null}[]=[];
async function run(name:string,script:string){
 const fd=openSync(folder+'/'+name+'.log','w',0o600);
 const child=spawn(process.execPath,[script],{env,stdio:['ignore',fd,fd]});closeSync(fd);
 const [code]=await once(child,'exit');checks.push({name,exitCode:code as number|null});console.log(name+': exit '+code);
 if(code!==0)throw Error('TEAM_UI_CHECK_FAILED');
}
try{
 await mkdir(folder,{recursive:true});
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env,stdio:'pipe'});
 const schema=await readFile('prisma/schema.prisma','utf8');
 const names=[...schema.matchAll(/^model ([A-Za-z0-9_]+) \{/gm)].map(m=>m[1]).filter(n=>!['StaffRole','StaffPermission'].includes(n));
 await db.$executeRawUnsafe('TRUNCATE '+names.map(n=>'"'+n+'"').join(',')+' RESTART IDENTITY CASCADE');
 for(const script of ['prisma/seed.ts','scripts/bootstrap-staff.ts'])execFileSync(process.execPath,['--import','tsx',script],{env,stdio:'pipe'});
 const fd=openSync(folder+'/server.log','w',0o600);app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3119'],{env,stdio:['ignore',fd,fd]});closeSync(fd);
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}if(!ready)throw Error('TEAM_UI_SERVER_NOT_READY');
 const scripts={'full-tz':'tests/e2e/full-tz.mjs',discovery:'tests/e2e/discovery.mjs','visual-matrix':'tests/e2e/visual-matrix.mjs'};
 for(const name of (process.env.TEAM_UI_CHECKS??'full-tz,discovery,visual-matrix').split(',')){
  if(!(name in scripts))throw Error('UNKNOWN_TEAM_UI_CHECK');await run(name,scripts[name as keyof typeof scripts]);
 }
}catch(error){process.exitCode=1;console.log('Team UI acceptance stopped: '+(error as Error).message);}
finally{
 if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}await db.$disconnect();
  await writeFile(folder+'/summary.json',JSON.stringify({testedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),target:'real local production build; dedicated test PostgreSQL; synthetic editorial fixtures',checks,limitations:['Headless Chromium; simulated zoom; no native-language or human screen-reader acceptance.']},null,2)+'\n');
}
