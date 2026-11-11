/** R-A05: source-based integration acceptance in an explicitly isolated DB.
 * No synthetic seed. CMS content/facts pass the real API workflow with distinct
 * technical author/reviewer accounts. This is not human archive approval.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,open,readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {hashPassword} from 'better-auth/crypto';
import {chromium} from 'playwright-core';
import packet from '../data/artur/real-content-v2/publication-manifest.json';
import examples from '../data/artur/real-content-v2/acceptance-cases.json';
import sourceFiles from '../data/artur/real-content-v2/files.json';
import {prepareRealCuration} from '../src/server/artur-discovery/real-publication';
import type {PublishedSourceBinding} from '../src/server/artur-discovery/publication';
import type {PlaceRef} from '../src/contracts/discovery';
import {reviewedPublicationRecord} from '../src/server/artur-discovery/publication-content';

const database=process.env.TEST_DATABASE_URL;
const nativeSetup=process.argv.includes('--native-setup');
if(!database||new URL(database).pathname!==(nativeSetup?'/archive_release_test':'/archive_real_test'))throw Error('Use the isolated archive_real_test database, or archive_release_test with --native-setup. Never run against a shared/live database.');
process.env.DATABASE_URL=database;
const {db}=await import('../src/server/db');
const {digest}=await import('../src/server/discovery-utils');
const {resolveMaterial}=await import('../src/server/discovery-materials');
const {retrieveCmsPassages,revalidateCmsPassages}=await import('../src/server/cms-knowledge');
const port=process.env.REAL_CONTENT_PORT??'3121',base='http://localhost:'+port;
const folder='docs/artur/real-content-v2/proof',privateFolder='.local/real-content';
const env={...process.env,DATABASE_URL:database,BETTER_AUTH_URL:base,ALLOW_DEMO_SEED:'0',ASSISTANT_MODE:'local-model',ASSISTANT_SERVICE_URL:'',NEXT_PUBLIC_API_MOCK:'0'};
const checks:{name:string;passed:boolean;detail?:string}[]=[],gates:{name:string;passed:boolean;detail:string}[]=[];
const visualMatrix:{width:number;locale:string;theme:string;textSize:string;fontSize:string;overflow:number}[]=[];
let app:ChildProcess|undefined;
const password=randomBytes(32).toString('hex');
const identities=['writer','reviewer','publisher','reader'] as const;
const cookies:Record<string,string>={};
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
async function call(path:string,method='GET',body?:unknown,actor='reader'){
 const response=await fetch(base+'/api'+path,{method,headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookies[actor]?{Cookie:cookies[actor]}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok)throw Error(`${method} ${path}: HTTP ${response.status} ${(await response.text()).slice(0,300)}`);
 return response.json();
}
async function check(name:string,fn:()=>Promise<void>){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
interface RevisionSnapshot {id:string;updatedAt:string|Date;status:string}
async function transition(revision:{id:string;updatedAt:string|Date},status:string,actor:string):Promise<RevisionSnapshot>{return (await call('/admin/revisions/'+revision.id+'/transition','POST',{status,expectedUpdatedAt:new Date(revision.updatedAt).toISOString(),reason:'Техническая приёмка предоставленного источника; не подпись сотрудника архива.'},actor)).item;}
try{
 await mkdir(folder,{recursive:true});await mkdir(privateFolder,{recursive:true});
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env,stdio:'pipe'});
 assert.equal(await db.document.count({where:{isDemo:true}}),0,'This acceptance database must not contain demo documents.');
 if(nativeSetup)execFileSync(process.execPath,['deploy/initialize.mjs'],{env,stdio:'pipe'});
 const hash=await hashPassword(password);
 for(const who of identities){
  const id='real-acceptance-'+who;
  const user=await db.user.upsert({where:{id},create:{id,name:'Техническая приёмка: '+who,email:id+'@example.test',emailVerified:true},update:{}});
  const account=await db.account.findFirst({where:{userId:id,providerId:'credential'}});
  if(account)await db.account.update({where:{id:account.id},data:{password:hash}});
  else await db.account.create({data:{id:randomUUID(),userId:user.id,providerId:'credential',accountId:user.id,password:hash}});
  if(who!=='reader')await db.staffAssignment.upsert({where:{userId_roleId_scopeKey:{userId:id,roleId:'SUPERADMIN',scopeKey:'*'}},create:{userId:id,roleId:'SUPERADMIN',scopeKey:'*'},update:{}});
 }
 const log=await open(privateFolder+'/server.log','w',0o600);
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port',port],{env,stdio:['ignore',log.fd,log.fd]});await log.close();
 let ready=false;
 for(let i=0;i<150;i++){if(app.exitCode!==null)throw Error('App exited before healthcheck.');try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await delay(200);}
 assert.ok(ready,'App health');
 for(const who of identities){const r=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'real-acceptance-'+who+'@example.test',password})});assert.equal(r.status,200);cookies[who]=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
 const materials=new Map<string,string>(),bindings:PublishedSourceBinding[]=[];
 if(nativeSetup)await check('default real setup imports 53 source editions and repeats without new rows or fixtures',async()=>{
  const {realContentPackage}=await import('../src/server/real-content-package');
  const {importRealContent}=await import('../src/server/real-content-import');
  const snapshot=async()=>({items:await db.contentItem.count(),revisions:await db.contentRevision.count(),files:await db.cmsAttachment.count(),publications:await db.materialPublication.count(),references:await db.referenceEntry.count()});
  const before=await snapshot(),pack=await realContentPackage(),actual=await importRealContent(false);
  assert.ok('attachments' in actual);
  assert.deepEqual(await snapshot(),before);assert.equal(actual.pages.length,53);assert.equal(actual.attachments?.length,27);assert.equal(before.items,39);assert.equal(before.references,3171);assert.equal(await db.document.count(),0);
  for(const row of pack.rows){
   const imported=actual.pages.find(p=>p.sourceKey===row.sourceKey&&p.locale===row.locale)!;
   assert.ok(imported&&'itemId' in imported&&typeof imported.itemId==='string');
   const source=await resolveMaterial({kind:'cms',id:imported.itemId},row.locale as 'ru'|'kk'|'en',false);assert.ok(source);assert.equal(source.material.isDemo,false);
   const reviewed=reviewedPublicationRecord(row);
   if(reviewed){materials.set(reviewed.materialKey,imported.itemId);bindings.push({sourceKey:reviewed.sourceKey,locale:source.source.locale,body:source.text,source:{...source.source,kind:'cms'}});}
  }
 });
 else await check('53 source language records publish through independent CMS workflow without seed',async()=>{
  for(const record of packet.records){
   let branchId:string|null=null;
   if(record.branchSourceKey){
    branchId='real-branch-'+record.branchSourceKey.split('-').at(-1);
    await db.archiveBranch.upsert({where:{id:branchId},create:{id:branchId,code:branchId,name:record.request.payload.title,isPublic:true,isDemo:false},update:{}});
   }
   let item=await db.contentItem.findUnique({where:{slug:record.materialKey}});
   const current=item?await db.contentRevision.findFirst({where:{itemId:item.id,locale:record.request.locale},orderBy:{version:'desc'}}):null;
   const {contentPayload}=await import('../src/server/cms');
   let revision:RevisionSnapshot|null=current;
   const desired=contentPayload.parse(record.request.payload);
   if(!current||digest(current.payload)!==digest(desired)){
    if(!item){const created=await call('/admin/content','POST',{...record.request,branchId},'writer');item=created.item;revision=created.item.revisions[0];}
    else revision=(await call('/admin/content/'+item.id+'/revisions','POST',{locale:record.request.locale,payload:desired},'writer')).item;
   }
   assert.ok(item&&revision);
   let published:RevisionSnapshot=revision;
   if(published.status==='DRAFT'||published.status==='CHANGES_REQUESTED')published=await transition(published,'IN_REVIEW','writer');
   if(published.status==='IN_REVIEW')published=await transition(published,'APPROVED','reviewer');
   if(published.status==='APPROVED')published=await transition(published,'PUBLISHED','publisher');
   assert.equal(published.status,'PUBLISHED');
   const publicItem=await call('/content/'+record.materialKey+'?locale='+record.request.locale);
   assert.equal(publicItem.item.isDemo,false);
   assert.equal(publicItem.item.payload.body,record.request.payload.body);
   const resolved=await resolveMaterial({kind:'cms',id:item.id},record.request.locale as 'ru'|'kk'|'en',false);assert.ok(resolved);
   assert.equal(resolved.source.kind,'cms');
   bindings.push({sourceKey:record.sourceKey,locale:resolved.source.locale,body:resolved.text,source:{...resolved.source,kind:'cms'}});
   materials.set(record.materialKey,item.id);
  }
 });
 const attached:Record<string,string>={};
 await check('actual DOCX originals upload, parse, review and publish as CMS files with paragraph provenance',async()=>{
  for(const key of ['history-1','calendar-2026-ru','compliance-16']){
   const r=packet.records.find(r=>r.sourceKey===key)!,file=sourceFiles.files.find(f=>f.key===r.attachments[0])!;
   const materialId=materials.get(r.materialKey)!,revision=await db.contentRevision.findFirstOrThrow({where:{itemId:materialId,locale:'ru',status:'PUBLISHED'}});
   let upload=await db.cmsAttachment.findFirst({where:{revisionId:revision.id,expectedSha256:file.sha256,state:'PUBLISHED'}});
   if(!upload){
    const mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    let declared=(await call('/admin/content/'+materialId+'/attachments','POST',{revisionId:revision.id,name:file.filename,mimeType,expectedBytes:file.bytes,expectedSha256:file.sha256,rights:r.request.payload.rights,sourceNote:r.request.payload.sourceNote,sourceLabel:r.request.payload.title,sourceVersion:'Предоставленный оригинал'},'writer')).item;
    const raw=await fetch(base+'/api/admin/material-files/'+declared.id+'/content',{method:'PUT',headers:{Origin:base,Cookie:cookies.writer,'Content-Type':mimeType,'If-Match':'"'+declared.updatedAt+'"'},body:new Uint8Array(await readFile(file.path))});assert.equal(raw.status,200);declared=(await raw.json()).item;
    declared=(await call('/admin/material-files/'+declared.id+'/review','POST',{expectedUpdatedAt:declared.updatedAt,decision:'APPROVE',rightsConfirmed:true,reason:'Сверка предоставленного оригинала для технической приёмки.'},'reviewer')).item;
    upload=(await call('/admin/material-files/'+declared.id+'/publish','POST',{expectedUpdatedAt:declared.updatedAt,reason:'Публикация предоставленного источника для проверки.'},'publisher')).item;
   }
   assert.ok(upload);attached[key]=upload.id;
   const readable=(await call('/material-files/'+upload.id+'/text')).item;
   assert.equal(readable.sourceSha256,file.sha256);assert.ok(readable.fragments.some((f:{paragraph?:number})=>f.paragraph));assert.equal(readable.isOcr,false);
   const explanation=await call('/discovery/materials/cms/'+materialId+'/explanation','POST',{locale:'ru'});
   assert.equal(explanation.status,'ready');assert.ok(explanation.citations.length);
   for(const cite of explanation.citations){assert.ok(cite.source.href.includes('/material-files/'));assert.ok(cite.source.fragment.paragraph);assert.equal(cite.source.fragment.page,undefined);assert.ok(readable.text.includes(cite.quote));}
  }
 });
 const parents:Record<string,Pick<PlaceRef,'id'|'name'>>={},topics:Record<string,string>={};
 const assigned:Record<string,string>={};
 async function publishFacts(){
  const prepared=prepareRealCuration(bindings,parents,topics);
  for(const row of prepared.ready){
   if(assigned[row.draftKey])continue;
   const existing=(await db.discoveryFact.findMany({where:{authorId:'real-acceptance-writer',kind:row.request.kind}})).find(f=>digest(f.data)===digest(row.request.data)&&digest(f.sources)===digest(row.request.sources));
   let fact:RevisionSnapshot=existing??(await call('/admin/discovery/facts','POST',row.request,'writer')).item;
   if(fact.status==='DRAFT')fact=(await call('/admin/discovery/facts/'+fact.id+'/verify','POST',{expectedUpdatedAt:new Date(fact.updatedAt).toISOString()},'reviewer')).item;
   assert.equal(fact.status,'VERIFIED');assigned[row.draftKey]=fact.id;
   if(row.request.kind==='PLACE')parents[row.draftKey]={id:fact.id,name:(row.request.data as {labels:{ru:{title:string}}}).labels.ru.title};
   if(row.request.kind==='TOPIC')topics[row.draftKey.replace(/^topic-/,'')]=fact.id;
  }
 }
 await check('real places, histories, topics and source-backed recommendations publish through fact API',async()=>{
  if(nativeSetup){
   const refs=await db.realContentBinding.findMany({where:{namespace:'real-content-20261111',targetKind:'fact'}});
   for(const ref of refs){
    if(ref.sourceKey.startsWith('topic-'))topics[ref.sourceKey.slice(6)]=ref.targetId;
    if(ref.sourceKey.startsWith('place-')){const fact=await db.discoveryFact.findUniqueOrThrow({where:{id:ref.targetId}});parents[ref.sourceKey]={id:ref.targetId,name:(fact.data as {labels:{ru:{title:string}}}).labels.ru.title};}
   }
  }else{await publishFacts();await publishFacts();}
  assert.equal(prepareRealCuration(bindings,parents,topics).blocked.length,0);
  for(const locale of ['ru','kk','en']){const result=await call('/discovery/topics?limit=20&locale='+locale);assert.equal(result.items.length,nativeSetup?8:6);assert.ok(result.items.every((t:{contentLocale:string})=>t.contentLocale===locale));}
 });
 await check('the home recommendations cite real source materials and have no invented view counts',async()=>{
  const home=await call('/discovery/home?locale=ru&limit=3');
  assert.equal(home.recommended.items.length,3);assert.equal(home.popular.status,'unavailable');
  for(const item of home.recommended.items){assert.equal(item.isDemo,false);assert.equal(item.kind,'cms');}
 });
 await check('all three real place histories contain nine sourced events',async()=>{
  const response=await call('/places?locale=ru&limit=10');assert.equal(response.items.length,3);
  let total=0;for(const place of response.items){const history=await call('/places/'+place.id+'/history?locale=ru&limit=20');total+=history.items.length;for(const event of history.items)assert.ok(event.sources.length);}
  assert.equal(total,9);
 });
 await check('complete source registers import without creating fictitious archival documents',async()=>{
  const dry=await call('/admin/directories/import','POST',{package:'archive-20261110',dryRun:true},'writer');assert.equal(dry.total,3171);
  const imported=await call('/admin/directories/import','POST',{package:'archive-20261110',dryRun:false},'writer');assert.equal(imported.total,3171);
  const repeated=await call('/admin/directories/import','POST',{package:'archive-20261110',dryRun:false},'writer');assert.ok(repeated.sets.every((s:{state:string})=>s.state==='unchanged'));
  assert.equal((await call('/directories/funds?pageSize=1')).total,1705);assert.equal((await call('/directories/newspapers?pageSize=1')).total,1466);
  assert.equal(await db.document.count(),0);
 });
 await check('chosen interests recommend matching real materials and opt-out restores editorial picks',async()=>{
  await call('/me/interests','PUT',{topicIds:[topics.industry],personalizationEnabled:true,historyEnabled:false});
  const personal=await call('/discovery/home?locale=ru&limit=3');assert.equal(personal.recommended.mode,'interests');
  assert.ok(personal.recommended.items.length>0);
  for(const item of personal.recommended.items){assert.equal(item.isDemo,false);assert.equal(item.id,materials.get('archive-calendar-2025'));}
  await call('/me/interests','PUT',{topicIds:[],personalizationEnabled:false,historyEnabled:false});
  assert.equal((await call('/discovery/home?locale=ru&limit=3')).recommended.mode,'editorial');
 });
 for(const scenario of examples.cases){
  await check('real assistant: '+scenario.id,async()=>{
   const result=await call('/assistant','POST',{question:scenario.question,locale:scenario.locale});
   assert.equal(result.noAnswer,false);
   const sourceItems=await db.contentRevision.findMany({where:{id:{in:result.sources.filter((s:{kind:string})=>s.kind==='cms').map((s:{id:string})=>s.id.replace(/^cms_/,''))}},select:{itemId:true}});
   assert.ok(scenario.sourceKeys.some(k=>sourceItems.some(s=>s.itemId===materials.get(packet.records.find(r=>r.sourceKey===k)!.materialKey))),scenario.id+': expected actual source');
   for(const term of scenario.mustContain)assert.ok(result.answer.includes(term),scenario.id+': '+term);
   for(const s of result.sources){assert.equal(s.isDemo,false);assert.equal((await fetch(base+s.href)).status,200);}
  });
 }
 await check('natural contact questions use provided hours and central contacts instead of guessing branch fields',async()=>{
  const hours=await call('/assistant','POST',{question:'Какой график работы архива?',locale:'ru'});assert.equal(hours.noAnswer,false);assert.ok(hours.answer.includes('8.00'));
  const address=await call('/assistant','POST',{question:'Где находится архив?',locale:'ru'});assert.equal(address.noAnswer,false);assert.ok(address.answer.includes('26/1'));
  const decree=await call('/assistant','POST',{question:'Когда было принято постановление №142?',locale:'ru'});assert.equal(decree.noAnswer,false);assert.ok(decree.answer.includes('2 июня 2026'));assert.ok(decree.sources.every((s:{id:string})=>!s.id.startsWith('cmsfile_')));
 });
 await check('assistant cites a permitted original DOCX and withdrawal removes that file from answers',async()=>{
  const question='О проведении внутреннего анализа коррупционных рисков';
  const result=await call('/assistant','POST',{question,locale:'ru'});assert.equal(result.noAnswer,false);
  assert.ok(result.sources.some((s:{id:string;href:string})=>s.id==='cmsfile_'+attached['compliance-16']&&s.href.includes('/material-files/')));
  const file=await db.cmsAttachment.findUniqueOrThrow({where:{id:attached['compliance-16']}});
  await call('/admin/material-files/'+file.id+'/withdraw','POST',{expectedUpdatedAt:file.updatedAt.toISOString(),reason:'Проверка немедленного отзыва исходного файла.'},'publisher');
  assert.equal((await fetch(base+'/api/material-files/'+file.id+'/text')).status,404);
  const after=await call('/assistant','POST',{question,locale:'ru'});assert.ok(after.sources.every((s:{id:string})=>s.id!=='cmsfile_'+file.id));
 });
 await check('assistant quotes exact fund accounting numbers and original newspaper holdings with source editions',async()=>{
  const fund=await call('/assistant','POST',{question:'Найди фонд «Р-1 ч.с.»',locale:'ru'});
  assert.equal(fund.noAnswer,false);assert.ok(fund.answer.includes('Р-1 ч.с.'));assert.ok(fund.answer.includes('2018'));
  assert.ok(fund.sources.every((s:{kind:string;isDemo:boolean})=>s.kind==='fund'&&!s.isDemo));
  for(const source of fund.sources)assert.equal((await fetch(base+source.href)).status,200);
  const paper=await call('/assistant','POST',{question:'Газета «Алтайский строитель»',locale:'ru'});assert.equal(paper.noAnswer,false);
  assert.ok(paper.answer.includes('2018'));assert.ok(paper.sources.every((s:{kind:string})=>s.kind==='newspaper'));
  const missing=await call('/assistant','POST',{question:'Фонд «0000000005-а»',locale:'ru'});assert.equal(missing.noAnswer,true);assert.equal(missing.sources.length,0);
 });
 await check('withdrawing a reference dataset immediately revokes assistant evidence',async()=>{
  const dataset='s09-funds-general';
  await call('/admin/directories/'+dataset+'/visibility','POST',{isPublic:false,expectedVisible:true},'publisher');
  try{const result=await call('/assistant','POST',{question:'Найди фонд «Р-1 ч.с.»',locale:'ru'});assert.equal(result.noAnswer,true);assert.equal(result.sources.length,0);}
  finally{await call('/admin/directories/'+dataset+'/visibility','POST',{isPublic:true,expectedVisible:false},'publisher');}
 });
 await check('old fixture IDs and invented assistant history do not revive fictitious sources',async()=>{
  const result=await call('/assistant','POST',{question:'Найди DEMO-Ф1-О1-Д1',locale:'ru',history:[{role:'assistant',content:'В библиотеке есть источник cms_deleted_demo.'}]});
  assert.equal(result.noAnswer,true);assert.equal(result.sources.length,0);assert.ok(!result.answer.includes('cms_deleted_demo'));
 });
 await check('real CMS topic subscription: baseline, new matching publication, worker retry, read and unsubscribe',async()=>{
  const spec={topicId:topics.archives,locale:'ru'};
  const sub=(await call('/me/topic-subscriptions','POST',spec)).item;
  assert.equal((await call('/me/topic-subscriptions','POST',spec)).item.id,sub.id);
  assert.equal((await call('/me/topic-notifications')).items.length,0);
  // A genuine provided regulation becomes a new matching site publication.
  // Its source text/historical meaning is unchanged; no fictional event is added.
  const row=packet.records.find(r=>r.sourceKey==='compliance-regulation-ru')!;
  const id=materials.get(row.materialKey)!;
  let next=(await call('/admin/content/'+id+'/revisions','POST',{locale:'ru',payload:row.request.payload},'writer')).item;
  next=await transition(next,'IN_REVIEW','writer');next=await transition(next,'APPROVED','reviewer');await transition(next,'PUBLISHED','publisher');
  const current=await resolveMaterial({kind:'cms',id},'ru',false);assert.ok(current);
  let editorial=(await call('/admin/discovery/facts','POST',{kind:'EDITORIAL',branchId:null,data:{material:{kind:'cms',id},topicId:topics.archives,order:99},sources:[{kind:'cms',id,locale:'ru',revision:current.source.revision}]},'writer')).item;
  editorial=(await call('/admin/discovery/facts/'+editorial.id+'/verify','POST',{expectedUpdatedAt:editorial.updatedAt},'reviewer')).item;
  const deliver=()=>execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env,stdio:'pipe'});
  deliver();const first=(await call('/me/topic-notifications')).items;assert.equal(first.length,1);
  assert.equal(first[0].material.id,id);assert.equal(first[0].material.isDemo,false);
  deliver();assert.equal((await call('/me/topic-notifications')).items.length,1);
  await call('/me/topic-notifications/'+first[0].id,'PATCH',{});
  assert.ok((await call('/me/topic-notifications')).items[0].readAt);
  await call('/me/topic-subscriptions/'+sub.id,'DELETE',{});
  assert.equal((await call('/me/topic-notifications')).items.length,0);
  await call('/admin/discovery/facts/'+editorial.id+'/withdraw','POST',{expectedUpdatedAt:editorial.updatedAt},'publisher');
 });
 await check('withdrawal invalidates a retrieved real-source snapshot immediately',async()=>{
  const snapshot=await retrieveCmsPassages('Комплаенс-офицер','ru');assert.ok(snapshot.length);
  const target=snapshot.find(s=>s.href.includes('archive-compliance?'));assert.ok(target);
  const revision=await db.contentRevision.findUniqueOrThrow({where:{id:target.revisionId}});
  await transition(revision,'ARCHIVED','publisher');
  assert.equal(await revalidateCmsPassages(snapshot,'ru'),false);
  // Restore using a fresh authored/reviewed revision, never flip an archived status.
  const row=packet.records.find(r=>r.sourceKey==='compliance-index-ru')!;
  let replacement=(await call('/admin/content/'+revision.itemId+'/revisions','POST',{locale:'ru',payload:row.request.payload},'writer')).item;
  replacement=await transition(replacement,'IN_REVIEW','writer');replacement=await transition(replacement,'APPROVED','reviewer');await transition(replacement,'PUBLISHED','publisher');
 });
 const contentId=materials.get('archive-history-1')!;
 for(const [name,path] of [
  ['CMS attachments','/discovery/materials/cms/'+contentId+'/attachments?locale=ru'],
  ['CMS explanation','/discovery/materials/cms/'+contentId+'/explanation'],
  ['CMS related','/discovery/materials/cms/'+contentId+'/related?locale=ru&limit=3'],
  ['fund register','/directories/funds?page=1&pageSize=1'],
  ['newspaper register','/directories/newspapers?page=1&pageSize=1'],
  ['unified search','/search?q='+encodeURIComponent('История архива')+'&scope=cms&locale=ru']]){
  const response=await fetch(base+'/api'+path,{method:name==='CMS explanation'?'POST':'GET',headers:{...(name==='CMS explanation'?{Origin:base,'Content-Type':'application/json'}:{})},...(name==='CMS explanation'?{body:JSON.stringify({locale:'ru'})}:{})});
  const data=await response.json().catch(()=>null);
  const usable=response.ok&&(name==='CMS explanation'?data?.status==='ready':name==='CMS attachments'?Array.isArray(data?.items)&&data.items.length>0:true);
  gates.push({name,passed:usable,detail:response.ok?'Inspect actual data after R-B01/B03 import.':'HTTP '+response.status+'; awaiting the assigned backend implementation.'});
 }
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:privateFolder+'/video',size:{width:1280,height:900}}});
 const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.name));
 await check('browser reads the actual source text, with light/dark themes and enlarged type',async()=>{
  await page.goto(base+'/materials/archive-history-1?contentLang=ru');
  await page.getByText('История архива · 1',{exact:true}).first().waitFor();
  assert.ok((await page.locator('body').innerText()).includes('1940'));
  await page.screenshot({path:folder+'/history-desktop.png',fullPage:true});
  await page.getByText('Вид сайта',{exact:true}).click();
  await page.getByLabel('Цветовая тема',{exact:true}).selectOption('dark');
  await page.getByLabel('Размер текста',{exact:true}).selectOption('150');
  await page.getByLabel('Размер текста',{exact:true}).press('Escape');
  await page.setViewportSize({width:360,height:850});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No horizontal page overflow at 360/150%.');
  await page.screenshot({path:folder+'/history-mobile-dark-150.png',fullPage:true});
  await page.goto(base+'/');await page.getByRole('link',{name:'История архива · 1',exact:true}).first().waitFor();
  const obsoleteCopy=(await page.locator('body').innerText()).includes('Материалы с меткой ДЕМО');
  gates.push({name:'public source-based copy',passed:!obsoleteCopy,detail:obsoleteCopy?'The old footer still describes fictional materials; R-F02 must apply the supplied ui-copy.json.':'No obsolete fictional-material footer found.'});
  await page.screenshot({path:folder+'/home-mobile-real.png',fullPage:true});
  assert.deepEqual(errors,[]);
 });
 const video=page.video();await context.close();if(video)await video.saveAs(folder+'/real-content.webm');
 await check('real long-form text remains readable across 36 locale, viewport and theme combinations',async()=>{
  const matrix=await browser!.newContext({reducedMotion:'reduce'});const view=await matrix.newPage();
  const baselineFonts=new Map<string,number>();
  for(const width of [360,768,1440])for(const locale of ['ru','kk','en'])for(const theme of ['light','dark'])for(const textSize of ['100','150']){
   await matrix.addCookies([{name:'display-theme',value:theme,url:base},{name:'display-text-size',value:textSize,url:base}]);
   await view.setViewportSize({width,height:900});
   await view.goto(base+'/materials/archive-history-1?contentLang=ru&lang='+locale);
   await view.getByRole('heading',{name:'История архива · 1',exact:true}).first().waitFor();
   const geometry=await view.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),fontSize:getComputedStyle(document.body).fontSize,locale:document.documentElement.lang,theme:document.documentElement.dataset.theme}));
   assert.equal(geometry.locale,locale);assert.equal(geometry.theme,theme);
   const fontKey=width+':'+locale+':'+theme;
   if(textSize==='100')baselineFonts.set(fontKey,parseFloat(geometry.fontSize));
   else assert.ok(Math.abs(parseFloat(geometry.fontSize)-baselineFonts.get(fontKey)!*1.5)<.1);
   assert.ok(geometry.overflow<=1);
   visualMatrix.push({width,locale,theme,textSize,fontSize:geometry.fontSize,overflow:geometry.overflow});
  }
  await view.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await view.evaluate(async()=>{const result=await (window as unknown as {axe:{run:()=>Promise<{violations:{id:string;impact:string}[]}>}}).axe.run();return result.violations.filter(v=>v.impact==='critical').map(v=>v.id);});
  assert.deepEqual(violations,[]);await matrix.close();
 });
 await browser.close();browser=undefined;
 console.log('Own checks passed. Integration gates: '+gates.filter(g=>g.passed).length+'/'+gates.length+'.');
}catch(error){checks.push({name:'acceptance failure',passed:false,detail:error instanceof Error?error.message:String(error)});throw error;}
finally{
 if(browser)await browser.close();
 if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}
 await writeFile(folder+'/report.json',JSON.stringify({generated:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dataSource:'provided source files; no synthetic seed',nativeDefaultSetup:nativeSetup,scope:'R-A01–R-A05 source and assistant acceptance; visual redesign remains R-F01/F04',technicalAccounts:true,humanArchiveApproval:false,checks,visualMatrix,integrationGates:gates,sourceIntegrationReady:checks.every(c=>c.passed)&&gates.length>0&&gates.every(g=>g.passed)},null,2)+'\n');
 await db.$disconnect();
}
