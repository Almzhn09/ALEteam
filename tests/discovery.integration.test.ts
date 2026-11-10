import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync,spawn,type ChildProcess} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {hashPassword} from 'better-auth/crypto';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated TEST_DATABASE_URL ending _test required');
process.env.DATABASE_URL=url;
const {db}=await import('../src/server/db');
const origin='http://localhost:3117',password=randomBytes(32).toString('hex');
const env={...process.env,DATABASE_URL:url,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),ALLOW_DEMO_SEED:'1',DEMO_AUTHOR_PASSWORD:password,DEMO_MODERATOR_PASSWORD:password,ASSISTANT_MODE:'retrieval'};
let app:ChildProcess;let admin:string,writer:string,reviewer:string,guest:string,other:string;
async function reset(){
 const names=[...readFileSync('prisma/schema.prisma','utf8').matchAll(/^model ([A-Za-z0-9_]+) \{/gm)].map(m=>m[1]).filter(n=>!['StaffRole','StaffPermission'].includes(n));
 await db.$executeRawUnsafe('TRUNCATE '+names.map(n=>'"'+n+'"').join(',')+' RESTART IDENTITY CASCADE');
}
async function call(path:string,method='GET',body?:unknown,cookie?:string){return fetch(origin+'/api'+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
async function ok(path:string,method='GET',body?:unknown,cookie?:string,status=200){const response=await call(path,method,body,cookie);assert.equal(response.status,status,`${method} ${path}: ${await response.clone().text()}`);return response.json();}
before(async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env,stdio:'pipe'});await reset();
 execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
 const hashed=await hashPassword(password);
 await db.archiveBranch.create({data:{id:'discovery-other',code:'discovery-other',name:'DEMO other branch',isPublic:true}});
 for(const [who,roleId] of [['admin','SUPERADMIN'],['writer','ARCHIVIST'],['reviewer','EDITOR'],['guest',null],['other','BRANCH_ADMIN']] as const){
  await db.user.create({data:{id:'discovery-'+who,email:`discovery-${who}@example.test`,name:who,emailVerified:true,accounts:{create:{id:randomUUID(),providerId:'credential',accountId:'discovery-'+who,password:hashed}}}});
  if(roleId)await db.staffAssignment.create({data:{userId:'discovery-'+who,roleId,branchId:who==='other'?'discovery-other':null,scopeKey:who==='other'?'discovery-other':'*'}});
 }
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3117'],{env,stdio:'ignore'});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
 const cookies=[];for(const who of ['admin','writer','reviewer','guest','other']){await db.rateLimit.deleteMany();const r=await call('/auth/sign-in/email','POST',{email:`discovery-${who}@example.test`,password});assert.equal(r.status,200);cookies.push(r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '));}
 [admin,writer,reviewer,guest,other]=cookies;
},{timeout:60000});
after(async()=>{if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}await reset();await db.$disconnect();});
async function publish(revision:{id:string;updatedAt:string}){
 for(const status of ['IN_REVIEW','APPROVED','PUBLISHED'])revision=(await ok(`/admin/revisions/${revision.id}/transition`,'POST',{status,expectedUpdatedAt:revision.updatedAt,reason:'Synthetic integration verification'},status==='IN_REVIEW'?writer:reviewer)).item;
 return revision;
}
const demoPayload={title:'ДЕМО источник для проверки',body:'Оригинальный вымышленный учебный материал. Не историческое свидетельство.',rights:'ALEteam CC0-1.0',sourceNote:'Synthetic test authored by ALEteam'};
let importedBatch:string;
test('N-B01 stages all 18 source requests without publication, pairs explicit RU/KK mappings and repeats idempotently',async()=>{
 const template=await ok('/admin/source-drafts','GET',undefined,admin);assert.equal(template.cms.length,18);assert.equal(template.branches.length,13);
 const mappings=template.cms.map((r:{sourceKey:string;slug:string})=>({sourceKey:r.sourceKey,slug:r.sourceKey.startsWith('calendar-')?r.slug.replace(/-(ru|kk)$/,''):r.sourceKey==='compliance-14'||r.sourceKey==='compliance-15'?'source-compliance-info':r.sourceKey==='compliance-16'||r.sourceKey==='compliance-17'?'source-compliance-analysis':r.slug}));
 const input={package:'archive-20261110',mode:'cms',mappings};
 const before=await db.contentItem.count();const staged=(await ok('/admin/source-drafts','POST',input,writer,201)).item;importedBatch=staged.id;assert.equal(staged.status,'READY');assert.equal(await db.contentItem.count(),before);
 assert.equal((await call('/admin/source-drafts/'+staged.id+'/commit','POST',{},other)).status,403);
 await ok('/admin/source-drafts/'+staged.id+'/commit','POST',{},writer);
 assert.equal(await db.sourceDraftBinding.count(),18);assert.equal(await db.contentItem.count(),before+11);
 assert.equal(await db.contentRevision.count({where:{status:'PUBLISHED'}}),0);
 assert.equal(await db.contentRevision.count({where:{status:'DRAFT'}}),18);
 const calendar=await db.contentItem.findUniqueOrThrow({where:{slug:'archive-calendar-2026'},include:{revisions:true}});assert.deepEqual(calendar.revisions.map(r=>r.locale).sort(),['kk','ru']);
 await ok('/admin/source-drafts/'+staged.id+'/commit','POST',{},writer);assert.equal(await db.sourceDraftBinding.count(),18);
 const repeated=(await ok('/admin/source-drafts','POST',input,writer,201)).item;assert.ok(repeated.report.every((r:{state:string})=>r.state==='unchanged'));
 await ok('/admin/source-drafts/'+repeated.id+'/commit','POST',{},writer);assert.equal(await db.contentRevision.count(),18);
});
test('N-B01 edited source target conflicts instead of overwriting; unknown fields and foreign ownership are denied',async()=>{
 const binding=await db.sourceDraftBinding.findFirstOrThrow({where:{sourceKey:'contacts'},include:{revision:true}});
 await ok('/admin/revisions/'+binding.revisionId,'PATCH',{expectedUpdatedAt:binding.revision.updatedAt.toISOString(),payload:{...binding.revision.payload as object,title:'Изменено сотрудником'}},writer);
 const staged=(await ok('/admin/source-drafts','POST',{package:'archive-20261110',mode:'cms',mappings:[{sourceKey:'contacts',slug:'archive-contacts'}]},writer,201)).item;
 assert.equal(staged.status,'CONFLICT');assert.equal((await call('/admin/source-drafts/'+staged.id+'/commit','POST',{},writer)).status,409);
 assert.equal((await call('/admin/source-drafts','POST',{package:'archive-20261110',mode:'cms',mappings:[],isPublic:true},writer)).status,400);
 assert.equal((await call('/admin/source-drafts','GET',undefined,guest)).status,403);
 assert.equal((await call('/admin/source-drafts/'+importedBatch,'GET',undefined,other)).status,403);
});
test('N-B02 stages 13 branch profiles with original contacts, missing coordinates and flagged email domains',async()=>{
 const template=await ok('/admin/source-drafts','GET',undefined,admin);
 const input={package:'archive-20261110',mode:'branches',mappings:template.branches.map((r:{sourceKey:string},i:number)=>({sourceKey:r.sourceKey,slug:'source-branch-'+(i+1)}))};
 const staged=(await ok('/admin/source-drafts','POST',input,admin,201)).item;assert.equal(staged.status,'READY');await ok('/admin/source-drafts/'+staged.id+'/commit','POST',{},admin);
 assert.equal(await db.sourceDraftBinding.count({where:{locale:'ru',sourceKey:{startsWith:'S01-'}}}),13);
 const missing=await db.sourceDraftBinding.findFirstOrThrow({where:{sourceKey:'S01-Книга-11'},include:{revision:true,item:true}});
 const payload=missing.revision.payload as {phone?:string;latitude?:number;contactReview:{phone:string;coordinates:string}};assert.equal(payload.phone,undefined);assert.equal(payload.latitude,undefined);assert.equal(payload.contactReview.phone,'missing');assert.equal(payload.contactReview.coordinates,'missing');
 const flagged=await db.sourceDraftBinding.findFirstOrThrow({where:{sourceKey:'S01-Книга-8'},include:{revision:true}});assert.equal((flagged.revision.payload as {contactReview:{email:string}}).contactReview.email,'needs_confirmation');
 assert.equal(await db.archiveBranch.count({where:{id:{startsWith:'src_'},isPublic:true}}),0);assert.equal(await db.contentRevision.count({where:{status:'PUBLISHED'}}),0);
 const repeated=(await ok('/admin/source-drafts','POST',input,admin,201)).item;await ok('/admin/source-drafts/'+repeated.id+'/commit','POST',{},admin);assert.equal(await db.archiveBranch.count({where:{id:{startsWith:'src_'}}}),13);
});
test('N-B02 a reviewed synthetic branch can publish a text-only profile; hidden branch revokes it',async()=>{
 const branch=await db.archiveBranch.create({data:{id:'discovery-text-branch',code:'discovery-text-branch',name:'ДЕМО текстовый филиал',isPublic:true}});
 const created=await ok('/admin/content','POST',{slug:'discovery-text-profile',kind:'BRANCH_PROFILE',branchId:branch.id,isDemo:true,locale:'ru',payload:{...demoPayload,address:'ДЕМО адрес без координат'}},writer,201);
 await publish(created.item.revisions[0]);const profile=(await ok('/content/discovery-text-profile')).item;assert.equal(profile.mapAvailable,false);assert.equal(profile.payload.latitude,undefined);
 await db.archiveBranch.update({where:{id:branch.id},data:{isPublic:false}});assert.equal((await call('/content/discovery-text-profile')).status,404);
});
