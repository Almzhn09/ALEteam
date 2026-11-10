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
  const fresh=await db.discoveryFact.findUniqueOrThrow({where:{id:old.id}});
  let row=fresh.status==='DRAFT'?{...fresh,updatedAt:fresh.updatedAt.toISOString()}:(await ok('/admin/discovery/facts/'+old.id+'/revise','POST',{expectedUpdatedAt:fresh.updatedAt.toISOString()},writer)).item;
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
 const related=await ok('/documents/'+graphDocumentId+'/related');assert.equal(related.engine,'artur');const linked=related.items.find((r:{id:string})=>r.id===otherDoc.item.id);assert.equal(linked.reason.code,'same_event');assert.ok(linked.reason.evidence.length);
 await db.archiveBranch.update({where:{id:'discovery-other'},data:{isPublic:false}});
 assert.equal((await call('/documents/'+graphDocumentId+'/related')).status,404);
 assert.equal((await call('/discovery/materials/document/'+otherDoc.item.id)).status,404);
 await db.archiveBranch.update({where:{id:'discovery-other'},data:{isPublic:true}});
});

test('COL-A07: revising a place invalidates child reviews until each child is independently rechecked',async()=>{
 let place=await fact('PLACE',{labels:{ru:{title:'ДЕМО Версионный город'}},coordinates:null});
 const child=await fact('HISTORY',{labels:{ru:{title:'ДЕМО событие версии'}},date:{datePrecision:'year',dateParts:{year:1791}},materials:[],certainty:'source_assertion'},place.id);
 assert.equal((await ok('/places/'+place.id+'/history')).items.length,1);
 place=(await ok('/admin/discovery/facts/'+place.id+'/revise','POST',{expectedUpdatedAt:place.updatedAt},writer)).item;
 const invalidated=await db.discoveryFact.findUniqueOrThrow({where:{id:child.id}});assert.equal(invalidated.status,'DRAFT');assert.equal(invalidated.reviewerId,null);
 place=(await ok('/admin/discovery/facts/'+place.id,'PATCH',{expectedUpdatedAt:place.updatedAt,data:{labels:{ru:{title:'ДЕМО Версионный город, новая редакция'}},coordinates:null}},writer)).item;
 place=(await ok('/admin/discovery/facts/'+place.id+'/verify','POST',{expectedUpdatedAt:place.updatedAt},reviewer)).item;
 assert.deepEqual((await ok('/places/'+place.id+'/history')).items,[]);
 await ok('/admin/discovery/facts/'+child.id+'/verify','POST',{expectedUpdatedAt:invalidated.updatedAt.toISOString()},reviewer);
 assert.equal((await ok('/places/'+place.id+'/history')).items.length,1);
});
test('COL-A07: database rejects verified fact status without independent authorship',async()=>{
 const c=(await ok('/admin/discovery/facts','POST',{kind:'PLACE',data:{labels:{ru:{title:'ДЕМО Без проверки'}},coordinates:null},sources:[evidenceSource]},writer,201)).item;
 await assert.rejects(db.discoveryFact.update({where:{id:c.id},data:{status:'VERIFIED',reviewerId:null}}),/check constraint/);
 assert.ok((await ok('/places')).items.every((p:{id:string})=>p.id!==c.id));
 const author=await db.discoveryFact.findUniqueOrThrow({where:{id:c.id}});await assert.rejects(db.discoveryFact.update({where:{id:c.id},data:{status:'VERIFIED',reviewerId:author.authorId}}),/check constraint/);
 assert.equal((await call('/places/'+c.id+'/history')).status,404);
});

test('COL-A02: live catalog asks which Altay is intended and accepts an explicit verified place selection',async()=>{
 const place=await fact('PLACE',{labels:{ru:{title:'Алтай',body:'ДЕМО проверка неоднозначного названия, не официальная историческая публикация.'}},coordinates:null});
 await fact('ALIAS',{name:'Зыряновск',locale:'ru'},place.id);
 const ambiguous=await ok('/documents?nameMode=expanded&locality='+encodeURIComponent('Алтай'));assert.equal(ambiguous.nameExpansion.clarificationRequired,true);assert.equal(ambiguous.total,0);
 const selected=await ok('/documents?nameMode=expanded&placeId='+place.id);assert.equal(selected.nameExpansion.clarificationRequired,false);assert.equal(selected.total,0);
});
test('COL-B05 recommendations honor explicit interests/disable, and never invent popularity or account history',async()=>{
 const topic=await fact('TOPIC',{labels:{ru:{title:'ДЕМО тема'}}});topicId=topic.id;
 await fact('EDITORIAL',{material:{kind:'document',id:graphDocumentId},topicId,placeId,order:1});
 const cold=await ok('/discovery/home');assert.equal(cold.recommended.mode,'editorial');assert.equal(cold.popular.status,'unavailable');assert.equal(cold.popular.period,null);assert.deepEqual(cold.continue.items,[]);
 await ok('/me/interests','PUT',{topicIds:[topicId],personalizationEnabled:true,historyEnabled:false},guest);
 const chosen=await ok('/discovery/home','GET',undefined,guest);assert.equal(chosen.recommended.mode,'interests');assert.equal(chosen.recommended.items[0].reason.code,'chosen_topic');
 await ok('/me/interests','PUT',{topicIds:[topicId],personalizationEnabled:false,historyEnabled:false},guest);assert.equal((await ok('/discovery/home','GET',undefined,guest)).recommended.mode,'editorial');
 assert.equal((await call('/me/interests','PUT',{topicIds:[],personalizationEnabled:true,historyEnabled:true},guest)).status,503);
 assert.equal((await call('/discovery/events','POST',{type:'view',id:graphDocumentId})).status,503);
});
test('COL-B05 subscriptions baseline/idempotency/worker retry and owner revocation are enforced',async()=>{
 const filter={filters:{q:'FOLLOW_TOPIC_MARKER'},locale:'ru'};
 const initial=await createDemoDocument('FOLLOW_TOPIC_MARKER existing');
 const sub=(await ok('/me/topic-subscriptions','POST',filter,guest,201)).item;
 const duplicate=(await ok('/me/topic-subscriptions','POST',filter,guest)).item;assert.equal(duplicate.id,sub.id);
 assert.equal((await ok('/me/topic-notifications','GET',undefined,guest)).items.length,0);
 const next=await createDemoDocument('FOLLOW_TOPIC_MARKER new');
 execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env,stdio:'pipe'});
 const first=await ok('/me/topic-notifications','GET',undefined,guest);assert.equal(first.items.length,1);assert.equal(first.items[0].material.id,next.item.id);assert.notEqual(first.items[0].material.id,initial.item.id);
 execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env,stdio:'pipe'});
 assert.equal((await ok('/me/topic-notifications','GET',undefined,guest)).items.length,1);
 const languageView=await ok('/me/topic-notifications?locale=en','GET',undefined,guest);assert.equal(languageView.items[0].material.translationStatus,'original');
 const newRevision=(await ok('/admin/catalog/documents/'+next.item.id+'/revisions','POST',{locale:'ru',payload:{...next.revision.payload,title:'FOLLOW_TOPIC_MARKER revised'}},writer,201)).item;
 next.revision=await publish(newRevision);execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env,stdio:'pipe'});
 assert.equal((await ok('/me/topic-notifications','GET',undefined,guest)).items.length,1);
 assert.equal((await ok('/me/topic-notifications','GET',undefined,other)).items.length,0);
 assert.equal((await call('/me/topic-subscriptions/'+sub.id,'DELETE',{},other)).status,404);
 assert.equal((await call('/me/topic-notifications/'+first.items[0].id,'PATCH',{},other)).status,404);
 await ok('/me/topic-notifications/'+first.items[0].id,'PATCH',{},guest);
 await ok('/admin/revisions/'+next.revision.id+'/transition','POST',{status:'ARCHIVED',expectedUpdatedAt:next.revision.updatedAt,reason:'withdraw match'},reviewer);
 assert.equal((await ok('/me/topic-notifications','GET',undefined,guest)).items.length,0);
 await ok('/me/topic-subscriptions/'+sub.id,'DELETE',{},guest);await ok('/me/topic-subscriptions/'+sub.id,'DELETE',{},guest);
 assert.equal((await ok('/me/topic-subscriptions','GET',undefined,guest)).items.length,0);
});

test('N-B06 measurements distinguish unavailable from zero and prevent implicit collection',async()=>{
 const report=await ok('/admin/discovery/measurements','GET',undefined,admin);assert.equal(report.status,'unavailable');assert.equal(report.collectionEnabled,false);
 assert.equal((await call('/admin/discovery/measurements','GET',undefined,guest)).status,403);
 assert.equal((await call('/admin/discovery/measurements','POST',{approved:true,periodFrom:'2026-01-01T00:00:00.000Z',periodTo:'2026-02-01T00:00:00.000Z',sourceNote:'Synthetic'},admin)).status,503);
});

test('N-B05 navigation is a reviewed localized CMS draft; links revoke and unsafe URLs/categories are validated',async()=>{
 const input={locale:'ru',branchId:null,title:'ДЕМО навигация',body:'Синтетическая конфигурация навигации.',rights:'ALEteam CC0-1.0',sourceNote:'Synthetic test',navigation:[{key:'home',label:'Главная',href:'/'},{key:'archive',label:'Архив',children:[{key:'document',label:'Учебный документ',material:{kind:'document',id:graphDocumentId}}]}]};
 const draft=await ok('/admin/navigation','POST',input,writer,201);assert.equal((await ok('/navigation')).status,'unavailable');await publish(draft.item.revisions[0]);
 const nav=await ok('/navigation?locale=en');assert.equal(nav.translationStatus,'original');assert.equal(nav.items.length,2);assert.equal(nav.items[1].children.length,1);
 await db.archiveBranch.update({where:{id:'discovery-other'},data:{isPublic:false}});
 assert.equal((await ok('/navigation')).items.length,1);const publicPage=await ok('/content/navigation-global');assert.equal(publicPage.item.payload.navigation.length,1);
 await db.archiveBranch.update({where:{id:'discovery-other'},data:{isPublic:true}});
 assert.equal((await call('/admin/navigation','POST',{...input,navigation:[{key:'bad',label:'bad',href:'javascript:alert(1)'}]},writer)).status,400);
 assert.equal((await call('/admin/navigation','POST',{...input,navigation:[{key:'bad',label:'bad',href:'//evil.example'}]},writer)).status,400);
 const page=await ok('/admin/content','POST',{slug:'discovery-news',kind:'NEWS',locale:'ru',payload:{...demoPayload,category:'DEMO',date:'2026-01-20'}},writer,201);await publish(page.item.revisions[0]);
 assert.equal((await ok('/content?kind=NEWS&category=DEMO&dateFrom=2026-01-01&dateTo=2026-01-31')).total,1);
 assert.equal((await ok('/content?kind=NEWS&category=OTHER')).total,0);
 assert.equal((await call('/content?dateFrom=2026-02-01&dateTo=2026-01-01')).status,400);
});

test('N-B06 approved aggregate import preserves zero, suppresses small groups and enforces branch analytics scope',async()=>{
 const enabledOrigin='http://localhost:3118';const enabled=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3118'],{env:{...env,BETTER_AUTH_URL:enabledOrigin,DISCOVERY_AGGREGATES_ENABLED:'1'},stdio:'ignore'});
 async function api(path:string,method='GET',body?:unknown,cookie=admin){const r=await fetch(enabledOrigin+'/api'+path,{method,headers:{Origin:enabledOrigin,Cookie:cookie,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(enabledOrigin+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
  const input={approved:true,periodFrom:'2026-01-01T00:00:00.000Z',periodTo:'2026-02-01T00:00:00.000Z',sourceNote:'Synthetic approved integration aggregate; not real visits',site:[{metric:'views',branchId:'discovery-other',count:0},{metric:'errors',branchId:'discovery-other',count:2}],materials:[{kind:'document',id:graphDocumentId,locale:'ru',count:0}]};
  assert.equal((await api('/admin/discovery/measurements','POST',input)).status,200);
  assert.equal((await api('/admin/discovery/measurements','POST',input)).status,200);
  const report=await api('/admin/discovery/measurements');assert.equal(report.body.status,'measured');assert.equal(report.body.items.length,2);
  assert.equal(report.body.items.find((r:{metric:string})=>r.metric==='views').count,0);assert.equal(report.body.items.find((r:{metric:string})=>r.metric==='errors').count,null);
  const popular=await api('/discovery/home');assert.equal(popular.body.popular.status,'measured');assert.deepEqual(popular.body.popular.items,[]);
  await ok('/admin/roles','PUT',{id:'discovery-analytics',name:'Synthetic branch analytics',permissions:['analytics.read']},admin);
  await ok('/admin/assignments','POST',{userId:'discovery-other',roleId:'discovery-analytics',branchId:'discovery-other'},admin);
  const scoped=await api('/admin/discovery/measurements?branchId=discovery-other','GET',undefined,other);assert.equal(scoped.status,200);assert.equal(scoped.body.items.length,2);
  assert.equal((await api('/admin/discovery/measurements?branchId=discovery-text-branch','GET',undefined,other)).status,403);
  assert.equal((await api('/admin/discovery/measurements','POST',{...input,email:'private@example.test'})).status,400);
  assert.equal((await api('/discovery/events','POST',{type:'view',id:graphDocumentId})).status,503);
  assert.equal((await api('/admin/discovery/measurements','DELETE',{approved:true,periodFrom:input.periodFrom,periodTo:input.periodTo,sourceNote:'Withdraw synthetic approval'})).status,200);assert.equal((await api('/discovery/home')).body.popular.status,'unavailable');
 }finally{
  if(enabled.exitCode===null){enabled.kill('SIGTERM');await once(enabled,'exit');}
  await db.staffAssignment.deleteMany({where:{roleId:'discovery-analytics'}});await db.staffRole.deleteMany({where:{id:'discovery-analytics'}});
 }
});
