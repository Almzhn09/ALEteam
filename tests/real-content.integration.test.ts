import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {hashPassword} from 'better-auth/crypto';
import imageManifest from '../sources/archive-visual-20261111/manifest.json';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated _test DB required');process.env.DATABASE_URL=url;process.env.FILE_STORAGE_ROOT='.local/real-content/test-files';
const {db}=await import('../src/server/db');const {importRealContent}=await import('../src/server/real-content-import');const {syntheticWithdrawal}=await import('../src/server/retire-synthetic');
const origin='http://localhost:3122',password=randomBytes(32).toString('hex'),env={...process.env,DATABASE_URL:url,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),ALLOW_DEMO_SEED:'1',DEMO_AUTHOR_PASSWORD:password,DEMO_MODERATOR_PASSWORD:password,ASSISTANT_MODE:'local-model'};
let app:ChildProcess,admin:string,reviewer:string,guest:string,foreign:string,report:Awaited<ReturnType<typeof importRealContent>>,subscriptionId:string;
const proof:{checks:string[];examples:{request:string;response:unknown}[]}={checks:[],examples:[]};
async function reset(){const names=[...readFileSync('prisma/schema.prisma','utf8').matchAll(/^model ([A-Za-z0-9_]+) \{/gm)].map(m=>m[1]).filter(n=>!['StaffRole','StaffPermission'].includes(n));await db.$executeRawUnsafe('TRUNCATE '+names.map(n=>'"'+n+'"').join(',')+' RESTART IDENTITY CASCADE');}
async function call(path:string,method='GET',body?:unknown,cookie?:string){return fetch(origin+'/api'+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});}
async function ok(path:string,method='GET',body?:unknown,cookie?:string,status=200){const r=await call(path,method,body,cookie);assert.equal(r.status,status,`${method} ${path}: ${await r.clone().text()}`);return r.json();}
function page(key:string,locale='ru'){return report.pages.find(p=>p.sourceKey===key&&p.locale===locale)! as {itemId:string;revisionId:string;slug:string};}
before(async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env,stdio:'pipe'});await reset();execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
 await db.archiveBranch.create({data:{id:'real-test-other',code:'real-test-other',name:'Isolated permission fixture',isPublic:false}});
 const hashed=await hashPassword(password);
 for(const [who,role]of [['admin','SUPERADMIN'],['reviewer','EDITOR'],['guest',null],['foreign','BRANCH_ADMIN']] as const){await db.user.create({data:{id:'real-test-'+who,email:`real-test-${who}@example.test`,name:who,emailVerified:true,accounts:{create:{id:randomUUID(),providerId:'credential',accountId:'real-test-'+who,password:hashed}}}});if(role)await db.staffAssignment.create({data:{userId:'real-test-'+who,roleId:role,branchId:who==='foreign'?'real-test-other':null,scopeKey:who==='foreign'?'real-test-other':'*'}});}
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3122'],{env,stdio:'ignore'});let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
 const cookies=[];for(const who of ['admin','reviewer','guest','foreign']){await db.rateLimit.deleteMany();const r=await call('/auth/sign-in/email','POST',{email:`real-test-${who}@example.test`,password});assert.equal(r.status,200);cookies.push(r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '));}[admin,reviewer,guest,foreign]=cookies;
},{timeout:120000});
after(async()=>{if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}await mkdir('.local/real-content',{recursive:true});await writeFile('.local/real-content/http-proof.json',JSON.stringify(proof,null,2)+'\n');await reset();await db.$disconnect();});
test('R-B01 source preview is nonmutating and publication preserves user records while replacing known fictional public data',{timeout:180000},async()=>{
 const legacy=await ok('/discovery/materials/document/demo-doc-01/attachments');assert.ok(legacy.items.length);assert.equal(legacy.items[0].material.kind,'document');
 const before=await db.contentItem.count();const preview=await importRealContent(true);assert.equal(await db.contentItem.count(),before);assert.equal(preview.pages.length,53);assert.equal(preview.directories.total,3171);
 const preserved=await db.document.create({data:{id:'user-preserve-fixture',fundId:'fund-01',reference:'USER-PRESERVE-TEST',title:'Пользовательская запись для проверки сохранности',description:'Isolated test-owned record; never production source data.',year:2000,type:'REPORT',rights:'Isolated fixture',isDemo:false,isPublic:true}}).catch(async()=>{const fund=await db.fund.findFirstOrThrow();return db.document.create({data:{id:'user-preserve-fixture',fundId:fund.id,reference:'USER-PRESERVE-TEST',title:'Пользовательская запись для проверки сохранности',description:'Isolated test-owned record; never production source data.',year:2000,type:'REPORT',rights:'Isolated fixture',isDemo:false,isPublic:true}});});
 const userId='real-test-guest';await db.favorite.create({data:{userId,documentId:'demo-doc-01'}});const comment=await db.comment.create({data:{id:randomUUID(),documentId:'demo-doc-01',authorId:userId,body:'Сохраняемое пользовательское сообщение',status:'PUBLISHED',idempotencyKey:randomUUID(),reason:'Isolated preservation fixture',moderationVersion:'test'}});
 const sub=(await ok('/me/topic-subscriptions','POST',{locale:'ru',filters:{scope:'cms',q:'Контакты',category:'contacts'}},guest,201)).item;subscriptionId=sub.id;
 const draftBatch=(await ok('/admin/source-drafts','POST',{package:'archive-20261110',mode:'cms',mappings:[{sourceKey:'contacts',slug:'archive-contacts'}]},admin,201)).item;await ok('/admin/source-drafts/'+draftBatch.id+'/commit','POST',{},admin);
 const sourceBinding=await db.sourceDraftBinding.findFirstOrThrow({where:{sourceKey:'contacts'},include:{revision:true}});const originalPayload=sourceBinding.revision.payload;
 let edited=(await ok('/admin/revisions/'+sourceBinding.revisionId,'PATCH',{expectedUpdatedAt:sourceBinding.revision.updatedAt.toISOString(),payload:{...originalPayload as object,title:'Ручная правка заголовка без изменения текста'}},admin)).item;
 await assert.rejects(()=>importRealContent(false),(error:unknown)=>(error as {code?:string}).code==='SOURCE_IMPORT_CONFLICT');assert.equal((await db.contentRevision.findUniqueOrThrow({where:{id:sourceBinding.revisionId}})).payload&&((await db.contentRevision.findUniqueOrThrow({where:{id:sourceBinding.revisionId}})).payload as {title:string}).title,'Ручная правка заголовка без изменения текста');
 await ok('/admin/revisions/'+sourceBinding.revisionId,'PATCH',{expectedUpdatedAt:edited.updatedAt,payload:originalPayload},admin);
 report=await importRealContent(false);const cleanup=await syntheticWithdrawal(false);assert.equal(cleanup.documentIds.length,20);assert.equal(await db.document.count({where:{isDemo:true,isPublic:true}}),0);assert.equal((await db.document.findUniqueOrThrow({where:{id:preserved.id}})).isPublic,true);assert.ok(await db.comment.findUnique({where:{id:comment.id}}));assert.equal(await db.favorite.count({where:{userId,documentId:'demo-doc-01'}}),1);
 assert.equal(report.pages.length,53);assert.equal((report as any).attachments.length,27);assert.equal((report as any).blockedFacts.length,0);assert.equal(await db.archiveBranch.count({where:{isPublic:true,isDemo:false}}),13);assert.equal(await db.document.count({where:{isPublic:true}}),1);
 assert.equal((await call('/documents/demo-doc-01')).status,404);assert.equal((await call('/files/demo-scan-1')).status,404);assert.equal((await call('/files/demo-scan-1/ocr')).status,404);
 proof.checks.push('53 real source editions / 39 CMS items, 13 branches, 27 attachments; known fixtures withdrawn without deleting user records');
});
test('R-B02 every real fund and newspaper record is pageable/exportable; literal numbers, source dates and privacy are preserved',async()=>{
 const ids=new Set<string>();for(let p=1;p<=18;p++){const r=await ok('/directories/funds?pageSize=100&page='+p);assert.equal(r.total,1705);for(const row of r.items)ids.add(row.id);}assert.equal(ids.size,1705);
 const all=await ok('/directories/newspapers/export');assert.equal(all.total,1466);assert.equal(all.items.length,1466);assert.equal(all.items[0].source.asOf,'2018-01-01');assert.equal(all.items[0].source.holder,null);assert.ok(!JSON.stringify(all).includes('rawCells'));assert.ok(!JSON.stringify(all).includes('storageKey'));
 const exact=await ok('/directories/funds?number='+encodeURIComponent('Р-1 ч.с.'));assert.equal(exact.total,1);assert.equal(exact.items[0].number,'Р-1 ч.с.');assert.ok(exact.items[0].names.length>1);assert.equal(exact.items[0].renameStatus,'source_rows');assert.equal(exact.items[0].source.asOf,null);
 assert.equal((await call('/admin/directories','GET',undefined,guest)).status,403);assert.equal((await call('/admin/directories/import','POST',{package:'archive-20261110',dryRun:false},foreign)).status,403);
 await ok('/admin/directories/s09-funds-party/visibility','POST',{isPublic:false,expectedVisible:true},admin);assert.equal((await ok('/directories/funds/export')).total,1552);await ok('/admin/directories/s09-funds-party/visibility','POST',{isPublic:true,expectedVisible:false},admin);
 proof.examples.push({request:'GET /api/directories/funds?number=Р-1 ч.с.',response:exact});proof.checks.push('all 1705 fund groups and 1466 newspaper rows; safe export, literal search and immediate dataset withdrawal');
});
test('R-B03 real DOCX/PDF attachments have source hashes, measured page OCR and paragraph-aware explanations with current access checks',async()=>{
 const history=page('history-1'),originalRevision=await db.contentRevision.findUniqueOrThrow({where:{id:page('history-1').revisionId}}),files=await ok(`/discovery/materials/cms/${history.itemId}/attachments`);const master=files.items.find((f:any)=>f.variant==='master');assert.ok(master);const body=await call(master.href.replace('/api',''));assert.equal(body.status,200);assert.equal(createHash('sha256').update(Buffer.from(await body.arrayBuffer())).digest('hex'),master.sha256);
 const text=(await ok(master.textHref.replace('/api',''))).item;assert.equal(text.isOcr,false);assert.ok(text.fragments[0].paragraph);assert.equal(text.fragments[0].page,undefined);
 const explained=await ok(`/discovery/materials/cms/${history.itemId}/explanation`,'POST',{locale:'ru'});assert.equal(explained.status,'ready');assert.ok(explained.citations.length);assert.ok(explained.citations[0].source.fragment.paragraph);assert.equal(explained.citations[0].source.kind,'cms');
 assert.equal((await call(`/discovery/materials/cms/${history.itemId}/explanation`,'POST',{locale:'ru',sourceRevision:'0'.repeat(64)})).status,409);
 const decree=page('branch-decree-142'),refs=await ok(`/discovery/materials/cms/${decree.itemId}/attachments`);const pdf=refs.items.find((f:any)=>f.variant==='master'),preview=refs.items.find((f:any)=>f.variant==='preview');assert.ok(pdf&&preview);assert.equal((await call(preview.href.replace('/api',''))).status,200);assert.equal((await call(preview.href.replace('/api','')+'?download=1')).status,404);
 const ocr=(await ok(pdf.textHref.replace('/api',''))).item;assert.equal(ocr.isOcr,true);assert.equal(ocr.totalPages,6);assert.equal(ocr.fragments.length,3);assert.ok(ocr.confidence>0&&ocr.confidence<=1);assert.equal(ocr.corrected,false);assert.deepEqual(ocr.fragments.map((f:any)=>f.page),[4,5,6]);
 await db.contentRevision.update({where:{id:history.revisionId},data:{status:'ARCHIVED'}});assert.equal((await call(master.href.replace('/api',''))).status,404);assert.equal((await call(master.textHref.replace('/api',''))).status,404);assert.equal((await call(`/discovery/materials/cms/${history.itemId}/explanation`,'POST',{locale:'ru'})).status,404);await db.contentRevision.update({where:{id:history.revisionId},data:{status:'PUBLISHED',updatedAt:originalRevision.updatedAt}});
 proof.examples.push({request:`POST /api/discovery/materials/cms/${history.itemId}/explanation`,response:explained});proof.checks.push('real DOCX paragraphs, S06 six-page measured OCR, master/preview integrity and parent withdrawal');
});
test('R-B04 common search keeps CMS and registries distinct; interests, actual history and related materials use real sources',async()=>{
 const contact=await ok('/search?scope=cms&q='+encodeURIComponent('читального'));assert.ok(contact.items.some((r:any)=>r.kind==='material'&&r.material.id===page('contacts').itemId));
 const fund=await ok('/search?q='+encodeURIComponent('Р-1 ч.с.'));assert.ok(fund.items.some((r:any)=>r.kind==='fund'));assert.ok(!fund.items.some((r:any)=>r.kind==='material'&&r.material.id==='demo-doc-01'));
 const en=await ok('/search?scope=cms&locale=en&q='+encodeURIComponent('Контакты'));assert.ok(en.items.some((r:any)=>r.material.translationStatus==='original'));
 const home=await ok('/discovery/home');assert.equal(home.recommended.items[0].id,page('history-1').itemId);assert.equal(home.popular.status,'unavailable');assert.ok(home.recommended.items.every((r:any)=>!r.isDemo));
 const places=await ok('/places');assert.equal(places.items.length,3);const history=await ok('/places/'+places.items[0].id+'/history');assert.equal(history.items.length,3);assert.ok(history.items.every((r:any)=>r.materials.every((m:any)=>m.kind==='cms'&&!m.isDemo)));
 const related=await ok(`/discovery/materials/cms/${page('branch-decree-142').itemId}/related?limit=20`);assert.ok(related.items.some((r:any)=>r.kind==='cms'&&r.reason.code==='same_event'));
 const files=await ok('/discovery/materials/cms/'+page('S01-Книга-11').itemId+'/attachments');assert.deepEqual(files.items,[]);assert.ok(!JSON.stringify(files).includes('VPN'));
 proof.examples.push({request:'GET /api/search?scope=cms&q=читального',response:contact});proof.checks.push('real-source common search/fallback, three histories, related CMS, non-demo recommendations, no VPN attachment');
});
test('R-B04 repeated real publication creates no duplicate notices; scope/category filters match CMS and ownership/revocation remain enforced',{timeout:180000},async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env,stdio:'pipe'});const first=await ok('/me/topic-notifications','GET',undefined,guest);assert.equal(first.items.length,1);assert.equal(first.items[0].material.id,page('contacts').itemId);
 const before={publications:await db.materialPublication.count(),items:await db.contentItem.count(),files:await db.cmsAttachment.count(),entries:await db.referenceEntry.count()};await importRealContent(false);await syntheticWithdrawal(false);
 assert.deepEqual({publications:await db.materialPublication.count(),items:await db.contentItem.count(),files:await db.cmsAttachment.count(),entries:await db.referenceEntry.count()},before);
 execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env,stdio:'pipe'});assert.equal((await ok('/me/topic-notifications','GET',undefined,guest)).items.length,1);
 assert.equal((await call('/me/topic-subscriptions/'+subscriptionId,'DELETE',{},foreign)).status,404);await ok('/me/topic-subscriptions/'+subscriptionId,'DELETE',{},guest);assert.equal((await ok('/me/topic-notifications','GET',undefined,guest)).items.length,0);
 proof.checks.push('CMS filter subscription baseline/dedup/owner/unsubscribe and whole-corpus repeat without extra publication/file/directory rows');
});

test('R-B03 CMS upload uses scoped immutable bytes and independent review; no fictitious archival document is required',async()=>{
 const parent=page('contacts'),bytes=readFileSync('sources/archive-20261110/originals/Контакты.docx'),sha=createHash('sha256').update(bytes).digest('hex');
 const input={revisionId:parent.revisionId,name:'Контакты.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',expectedBytes:bytes.length,expectedSha256:sha,rights:'Provided original, isolated upload verification',sourceNote:'S05',sourceLabel:'Контакты',sourceVersion:'Source provided 2026-11-10'};
 assert.equal((await call('/admin/content/'+parent.itemId+'/attachments','POST',input,guest)).status,403);assert.equal((await call('/admin/content/'+parent.itemId+'/attachments','POST',input,foreign)).status,403);assert.equal((await call('/admin/content/'+parent.itemId+'/attachments','POST',{...input,storageKey:'/etc/passwd'},admin)).status,400);
 let row=(await ok('/admin/content/'+parent.itemId+'/attachments','POST',input,admin,201)).item;
 assert.equal((await call('/material-files/'+row.id)).status,404);
 const put=await fetch(origin+'/api/admin/material-files/'+row.id+'/content',{method:'PUT',headers:{Origin:origin,Cookie:admin,'Content-Type':input.mimeType,'If-Match':'"'+row.updatedAt+'"'},body:new Uint8Array(bytes)});assert.equal(put.status,200);row=(await put.json()).item;assert.equal(row.state,'QUARANTINED');assert.equal(row.storageKey,undefined);
 const control={expectedUpdatedAt:row.updatedAt,rightsConfirmed:true,decision:'APPROVE',reason:'Independent source-byte verification'};
 assert.equal((await call('/admin/material-files/'+row.id+'/review','POST',control,admin)).status,403);
 row=(await ok('/admin/material-files/'+row.id+'/review','POST',control,reviewer)).item;assert.equal(row.state,'APPROVED');assert.equal((await call('/material-files/'+row.id)).status,404);
 row=(await ok('/admin/material-files/'+row.id+'/publish','POST',{expectedUpdatedAt:row.updatedAt,reason:'Explicit file publication'},admin)).item;assert.equal(row.state,'PUBLISHED');assert.equal((await call('/material-files/'+row.id)).status,200);
 await ok('/admin/material-files/'+row.id+'/withdraw','POST',{expectedUpdatedAt:row.updatedAt,reason:'Withdrawal verification'},admin);assert.equal((await call('/material-files/'+row.id)).status,404);assert.equal((await call('/material-files/'+row.id+'/text')).status,404);
 proof.checks.push('CMS upload create/PUT/private quarantine/independent review/publish/withdraw; wrong scope/path/self-approval rejected');
});

test('prepared photographs use complete originals and the existing private review workflow; repeat and withdrawal preserve editor decisions',async()=>{
 const {publishSourceImages}=await import('../src/server/source-images');
 const count=await db.cmsAttachment.count(),preview=await publishSourceImages(false);
 assert.equal(await db.cmsAttachment.count(),count);assert.ok(preview.ready.length>0);
 const first=await publishSourceImages(true);assert.equal(first.items.length,preview.ready.length);
 const parent=page('history-1'),attachments=await ok('/discovery/materials/cms/'+parent.itemId+'/attachments');
 for(const image of first.items){
  assert.ok(attachments.items.some((file:any)=>file.id===image.id&&file.sha256===image.sha256));
  const row=await db.cmsAttachment.findUniqueOrThrow({where:{id:image.id}});assert.notEqual(row.uploaderId,row.reviewerId);assert.equal(row.state,'PUBLISHED');
  const response=await call('/material-files/'+row.id);assert.equal(response.status,200);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),row.expectedSha256);
 }
 const incomplete=imageManifest.images.filter(image=>image.decoderValidation.status==='incomplete_source');
 for(const image of incomplete){assert.ok(first.blocked.some(blocked=>blocked.id===image.id));assert.ok(!attachments.items.some((file:any)=>file.sha256===image.sha256));}
 const after=await db.cmsAttachment.count();await publishSourceImages(true);assert.equal(await db.cmsAttachment.count(),after);
 const file=first.items[0];await db.cmsAttachment.update({where:{id:file.id},data:{state:'WITHDRAWN'}});
 const repeated=await publishSourceImages(true);assert.ok(repeated.blocked.some(blocked=>blocked.reason==='WITHDRAWN'));assert.equal(await db.cmsAttachment.count(),after);assert.equal((await call('/material-files/'+file.id)).status,404);
 const revision=await db.contentRevision.findUniqueOrThrow({where:{id:parent.revisionId}});
 await db.contentRevision.update({where:{id:revision.id},data:{status:'ARCHIVED'}});
 await assert.rejects(()=>publishSourceImages(true),/SOURCE_IMAGE_PARENT_REVIEW_REQUIRED/);
 const managed=await db.realContentBinding.findUniqueOrThrow({where:{namespace_sourceKey_locale:{namespace:'real-content-20261111',sourceKey:'history-1',locale:'ru'}}});
 const next=await db.contentRevision.create({data:{itemId:revision.itemId,locale:revision.locale,version:revision.version+1,payload:revision.payload!,status:'PUBLISHED',authorId:revision.authorId,reviewerId:revision.reviewerId}});
 await db.realContentBinding.update({where:{id:managed.id},data:{data:{...managed.data as object,revisionId:next.id}}});
 const updatedParent=await publishSourceImages(true);
 assert.ok(updatedParent.blocked.some(blocked=>blocked.id===file.sourceId&&blocked.reason==='WITHDRAWN'));
 assert.equal(await db.cmsAttachment.count({where:{revisionId:next.id,expectedSha256:file.sha256}}),0);
 proof.checks.push('prepared photos: strict original hashes, separate technical review, idempotence, no incomplete image or withdrawn/archived-parent/version-change bypass');
});
