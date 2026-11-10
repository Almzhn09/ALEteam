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

let evidenceSource:Record<string,unknown>,placeId:string,topicId:string,graphDocumentId:string,fundId:string;
async function fact(kind:string,data:unknown,parentId:string|null=null,sources:unknown[]= [evidenceSource]){
 const created=(await ok('/admin/discovery/facts','POST',{kind,data,parentId,sources},writer,201)).item;
 assert.equal((await call('/admin/discovery/facts/'+created.id+'/verify','POST',{expectedUpdatedAt:created.updatedAt},writer)).status,403);
 return (await ok('/admin/discovery/facts/'+created.id+'/verify','POST',{expectedUpdatedAt:created.updatedAt},reviewer)).item;
}
async function createDemoDocument(title:string,extra:Record<string,unknown>={}){
 const created=await ok('/admin/catalog/documents','POST',{fundId,title,description:'Синтетический учебный документ, не историческое свидетельство.',reference:'DISC-А0007/'+randomUUID(),year:1960,yearTo:1969,type:'PHOTO',locality:'ДЕМО Старыйгород',rights:'ALEteam CC0-1.0',sourceNote:'Synthetic test authored by ALEteam',...extra},writer,201);
 const revision=await publish(created.revision);return {...created,revision};
}
test('COL-B02 verified names expand only explicit mode and preserve date/type/reference filters',async()=>{
 const created=await ok('/admin/content','POST',{slug:'discovery-demo-source',kind:'PAGE',locale:'ru',isDemo:true,payload:demoPayload},writer,201);await publish(created.item.revisions[0]);
 evidenceSource=(await ok('/discovery/materials/cms/'+created.item.id+'?locale=ru')).source;
 const place=await fact('PLACE',{labels:{ru:{title:'ДЕМО Новыйгород',body:'Синтетическое место для проверки.'}},coordinates:null});placeId=place.id;
 await fact('ALIAS',{name:'ДЕМО Старыйгород',locale:'ru',validFrom:1900,validTo:1970},placeId);
 fundId=(await ok('/admin/catalog/funds','POST',{branchId:'discovery-other',number:'0007',name:'ДЕМО фонд поиска',description:'Synthetic test'},writer,201)).item.id;
 const document=await createDemoDocument('ДЕМО фотографии старого города');graphDocumentId=document.item.id;
 const literal=await ok('/documents?nameMode=literal&locality='+encodeURIComponent('ДЕМО Новыйгород')+'&fundNumber=0007&yearFrom=1965&yearTo=1966&type=PHOTO');assert.equal(literal.total,0);
 const expanded=await ok('/documents?nameMode=expanded&locality='+encodeURIComponent('ДЕМО Новыйгород')+'&fundNumber=0007&yearFrom=1965&yearTo=1966&type=PHOTO');assert.deepEqual(expanded.items.map((r:{id:string})=>r.id),[document.item.id]);assert.equal(expanded.nameExpansion.applied,true);
 assert.equal((await ok('/documents?nameMode=expanded&locality='+encodeURIComponent('ДЕМО Новыйгород')+'&type=LETTER')).total,0);
 assert.equal((await ok('/documents?nameMode=expanded&locality='+encodeURIComponent('ДЕМО Новыйгород')+'&yearFrom=1980&yearTo=1985')).total,0);
 const reference=await ok('/documents?nameMode=expanded&reference='+encodeURIComponent(document.item.reference));assert.equal(reference.items[0].reference,document.item.reference);
 const aliases=await ok('/discovery/aliases?q='+encodeURIComponent('ДЕМО Старыйгород'));assert.equal(aliases.items[0].entityId,placeId);
});
test('COL-B04 chronology preserves partial dates, locale fallback, cursor scope and source withdrawal',async()=>{
 for(const year of [1960,1940,1950])await fact('HISTORY',{labels:{ru:{title:'ДЕМО событие '+year,body:'Синтетический элемент.'}},date:{datePrecision:'year',dateParts:{year}},materials:[{kind:'document',id:graphDocumentId}],certainty:'source_assertion'},placeId);
 const places=await ok('/places?locale=en');const place=places.items.find((p:{id:string})=>p.id===placeId);assert.equal(place.translationStatus,'original');assert.equal(place.contentLocale,'ru');assert.equal(place.mapAvailable,false);assert.equal(place.historyCount,3);
 const first=await ok('/places/'+placeId+'/history?locale=en&limit=2');assert.deepEqual(first.items.map((r:{dateParts:{year:number}})=>r.dateParts.year),[1940,1950]);assert.equal(first.items[0].dateParts.month,undefined);assert.ok(first.nextCursor);
 const second=await ok('/places/'+placeId+'/history?locale=en&limit=2&cursor='+first.nextCursor);assert.equal(second.items[0].dateParts.year,1960);
 assert.equal((await call('/places/'+placeId+'/history?locale=ru&cursor='+first.nextCursor)).status,400);
 const filtered=await ok('/places/'+placeId+'/history?yearFrom=1955');assert.equal(filtered.items.length,1);
 const invalid=await call('/admin/discovery/facts','POST',{kind:'HISTORY',parentId:placeId,data:{labels:{ru:{title:'invalid'}},date:{datePrecision:'day',dateParts:{year:1960,month:2,day:31}},certainty:'source_assertion'},sources:[evidenceSource]},writer);assert.equal(invalid.status,400);
 const sourceItem=await db.contentItem.findUniqueOrThrow({where:{slug:'discovery-demo-source'}});const r=await db.contentRevision.findFirstOrThrow({where:{itemId:sourceItem.id,status:'PUBLISHED'}});
 await ok('/admin/revisions/'+r.id+'/transition','POST',{status:'ARCHIVED',expectedUpdatedAt:r.updatedAt.toISOString(),reason:'Source withdrawal test'},reviewer);
 assert.equal((await call('/places/'+placeId+'/history')).status,404);assert.equal((await ok('/discovery/aliases?q='+encodeURIComponent('ДЕМО Старыйгород'))).items.length,0);
 // Re-publish a distinct source version and explicitly re-verify facts against it; stable place ID is preserved.
 const next=(await ok('/admin/content/'+sourceItem.id+'/revisions','POST',{locale:'ru',payload:demoPayload},writer,201)).item;await publish(next);evidenceSource=(await ok('/discovery/materials/cms/'+sourceItem.id)).source;
 for(const old of (await db.discoveryFact.findMany({where:{status:'VERIFIED'},orderBy:{id:'asc'}})).sort((a,b)=>Number(b.kind==='PLACE')-Number(a.kind==='PLACE'))){
  let row=(await ok('/admin/discovery/facts/'+old.id+'/revise','POST',{expectedUpdatedAt:old.updatedAt.toISOString()},writer)).item;
  row=(await ok('/admin/discovery/facts/'+row.id,'PATCH',{expectedUpdatedAt:row.updatedAt,sources:[evidenceSource]},writer)).item;
  await ok('/admin/discovery/facts/'+row.id+'/verify','POST',{expectedUpdatedAt:row.updatedAt},reviewer);
 }
 assert.equal((await ok('/places/'+placeId+'/history')).place.id,placeId);
});
test('COL-B02 ambiguous names require clarification; place ID needs confirmed material association',async()=>{
 const otherPlace=await fact('PLACE',{labels:{ru:{title:'ДЕМО Другойгород'}},coordinates:null});await fact('ALIAS',{name:'ДЕМО Старыйгород',locale:'ru'},otherPlace.id);
 const ambiguous=await ok('/documents?nameMode=expanded&locality='+encodeURIComponent('ДЕМО Старыйгород'));assert.equal(ambiguous.total,0);assert.equal(ambiguous.nameExpansion.clarificationRequired,true);
 const selected=await ok('/documents?placeId='+placeId);assert.ok(selected.items.some((d:{id:string})=>d.id===graphDocumentId));
 const unrelated=await ok('/documents?placeId='+otherPlace.id);assert.equal(unrelated.total,0);
});
test('COL-B04 related sources distinguish verified links and text similarity without leaking a hidden branch',async()=>{
 const otherDoc=await createDemoDocument('ДЕМО связанный материал');
 await fact('LINK',{from:{kind:'document',id:graphDocumentId},to:{kind:'document',id:otherDoc.item.id},reason:'same_event'});
 const related=await ok('/documents/'+graphDocumentId+'/related');const linked=related.items.find((r:{id:string})=>r.id===otherDoc.item.id);assert.equal(linked.reason.code,'same_event');assert.ok(linked.reason.evidence.length);
 await db.archiveBranch.update({where:{id:'discovery-other'},data:{isPublic:false}});
 assert.equal((await call('/documents/'+graphDocumentId+'/related')).status,404);
 assert.equal((await call('/discovery/materials/document/'+otherDoc.item.id)).status,404);
 await db.archiveBranch.update({where:{id:'discovery-other'},data:{isPublic:true}});
});
