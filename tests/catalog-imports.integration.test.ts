import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdir,writeFile} from 'node:fs/promises';
import {hashPassword} from 'better-auth/crypto';
import fixture from '../data/artur/import-fixture.json';
import scans from '../data/scans/manifest.json';
import {catalogImportSchema,importManifestDigest} from '../src/server/catalog-import-schema';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated _test DB required');
process.env.DATABASE_URL=url;const {db}=await import('../src/server/db');
const origin='http://localhost:3090',prefix='import-test-',password=randomBytes(32).toString('hex');
const env={...process.env,DATABASE_URL:url,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),ALLOW_DEMO_SEED:'1',DEMO_AUTHOR_PASSWORD:password,DEMO_MODERATOR_PASSWORD:password};
let app:ChildProcess,writer:string,reviewer:string,foreign:string,visitor:string,analyst:string;
let original:any;const proof:Record<string,unknown>={syntheticData:true};
async function call(route:string,method='GET',body?:unknown,cookie?:string){return fetch(origin+'/api'+route,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});}
async function ok(route:string,method='GET',body?:unknown,cookie=writer,expected=200){const r=await call(route,method,body,cookie);assert.equal(r.status,expected,method+' '+route);return r.json();}
const params=(batch:{updatedAt:string;digest:string})=>({expectedUpdatedAt:batch.updatedAt,digest:batch.digest});
async function stage(data:unknown=fixture){return (await ok('/admin/imports','POST',data,writer,201)).item;}
async function action(batch:{id:string;updatedAt:string;digest:string},name:string){return (await ok('/admin/imports/'+batch.id+'/'+name,'POST',params(batch))).item;}
function variant(namespace:string){const data=structuredClone(fixture);data.sourceNamespace=namespace;for(const row of data.documents)row.metadata.reference='DEMO-IMPORT-'+namespace+'-'+row.sourceId;return data;}
async function clean(){
 const where={branchId:{startsWith:prefix}};await db.catalogImportSource.deleteMany({where});await db.catalogImport.deleteMany({where});
 const docs=await db.document.findMany({where:{fund:where},select:{id:true,contentItemId:true}});const ids=docs.flatMap(d=>d.contentItemId?[d.contentItemId]:[]);
 await db.archiveUpload.deleteMany({where:{documentId:{in:docs.map(d=>d.id)}}});await db.archiveFile.deleteMany({where:{documentId:{in:docs.map(d=>d.id)}}});await db.document.deleteMany({where:{id:{in:docs.map(d=>d.id)}}});
 await db.editorialNotice.deleteMany({where:{revision:{itemId:{in:ids}}}});await db.publicationEvent.deleteMany({where:{revision:{itemId:{in:ids}}}});await db.contentRevision.deleteMany({where:{itemId:{in:ids}}});await db.contentItem.deleteMany({where:{id:{in:ids}}});
 await db.archivalCase.deleteMany({where:{inventory:{fund:where}}});await db.inventory.deleteMany({where:{fund:where}});await db.fund.deleteMany({where});
 await db.auditEvent.deleteMany({where:{actorId:{startsWith:prefix}}});await db.staffAssignment.deleteMany({where:{userId:{startsWith:prefix}}});await db.session.deleteMany({where:{userId:{startsWith:prefix}}});await db.account.deleteMany({where:{userId:{startsWith:prefix}}});await db.user.deleteMany({where:{id:{startsWith:prefix}}});await db.archiveBranch.deleteMany({where:{id:{startsWith:prefix}}});
}
before(async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env,stdio:'pipe'});await clean();execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
 for(const id of [prefix+'a',prefix+'b'])await db.archiveBranch.create({data:{id,code:id,name:'DEMO '+id,isPublic:true}});
 const hash=await hashPassword(password);
 for(const [who,role,branch]of[['writer','ARCHIVIST',prefix+'a'],['reviewer','EDITOR',null],['foreign','ARCHIVIST',prefix+'b'],['visitor',null,null],['analyst','ANALYST',null]]as const){
  const id=prefix+who;await db.user.create({data:{id,name:who,email:id+'@example.test',emailVerified:true,accounts:{create:{id:randomUUID(),providerId:'credential',accountId:id,password:hash}}}});
  if(role)await db.staffAssignment.create({data:{userId:id,roleId:role,branchId:branch,scopeKey:branch??'*'}});
 }
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3090'],{env,stdio:'ignore'});let ready=false;for(let i=0;i<100;i++){if(app.exitCode!==null)throw Error('Import app exited');try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
 const cookies=[];for(const who of['writer','reviewer','foreign','visitor','analyst']){await db.rateLimit.deleteMany();const r=await call('/auth/sign-in/email','POST',{email:prefix+who+'@example.test',password});assert.equal(r.status,200);cookies.push(r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '));}[writer,reviewer,foreign,visitor,analyst]=cookies;
},{timeout:120000});
after(async()=>{if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}await mkdir('.local/imports',{recursive:true});await writeFile('.local/imports/report.json',JSON.stringify(proof,null,2)+'\n');await clean();await db.$disconnect();});

test('staging validates real hierarchy without creating archive nodes, drafts or public records',async()=>{
 assert.equal((await call('/admin/imports')).status,401);for(const cookie of[visitor,analyst])assert.equal((await call('/admin/imports','GET',undefined,cookie)).status,403);
 const before={documents:await db.document.count(),funds:await db.fund.count(),revisions:await db.contentRevision.count()};
 original=await stage();assert.equal(original.state,'READY');assert.equal(original.digest,importManifestDigest(catalogImportSchema.parse(fixture)));assert.equal(original.report.counts.create,2);
 assert.equal((await call('/admin/imports/'+original.id+'/commit','POST',{...params(original),digest:'0'.repeat(64)},writer)).status,409);
 assert.deepEqual({documents:await db.document.count(),funds:await db.fund.count(),revisions:await db.contentRevision.count()},before);
 assert.equal((await call('/admin/imports/'+original.id,'GET',undefined,foreign)).status,403);assert.equal((await ok('/admin/imports','GET',undefined,foreign)).total,0);
 assert.equal((await call('/admin/imports','POST',fixture,reviewer)).status,403);assert.equal((await call('/admin/imports/'+original.id+'/commit','POST',params(original),reviewer)).status,403);
 assert.equal((await call('/admin/imports/'+original.id+'/export','GET',undefined,foreign)).status,403);
 for(const patch of[{authorId:prefix+'reviewer'},{state:'COMMITTED'},{storageKey:'/tmp/private'}])assert.equal((await call('/admin/imports','POST',{...fixture,...patch},writer)).status,400);
 proof.stagingDoesNotMutateArchive=true;proof.scopesAndStrictInput=true;
});
test('explicit commit creates only draft language versions and preserves exact strings and relationships',async()=>{
 const concurrent=await Promise.all([action(original,'commit'),action(original,'commit')]);original=concurrent[0];assert.deepEqual(concurrent[0].createdDocuments,concurrent[1].createdDocuments);assert.equal(original.state,'COMMITTED');assert.equal(original.createdDocuments.length,2);
 for(const imported of original.createdDocuments){const d=await db.document.findUniqueOrThrow({where:{id:imported.id},include:{fund:true,archivalCase:{include:{inventory:true}},contentItem:{include:{revisions:true}}}});assert.equal(d.isPublic,false);assert.equal(d.allowDigitalCopy,false);assert.equal((await call('/documents/'+d.id)).status,404);assert.ok(d.contentItem!.revisions.every(r=>r.status==='DRAFT'&&r.reviewerId===null));assert.equal(d.archivalCase!.number,'0003/А');assert.equal(d.archivalCase!.inventory.number,'0001');}
 const source=await db.catalogImportSource.findUniqueOrThrow({where:{branchId_sourceNamespace_sourceId:{branchId:fixture.branchId,sourceNamespace:fixture.sourceNamespace,sourceId:'000009'}},include:{document:{include:{fund:true,contentItem:{include:{revisions:true}}}}}});
 assert.equal(source.document.fund.number,'0007');assert.equal(source.document.originalLanguage,'kk');assert.deepEqual(source.document.contentItem!.revisions.map(r=>r.locale).sort(),['en','kk','ru']);
 assert.equal((await ok('/documents?reference=DEMO-IMPORT-000009','GET',undefined,visitor)).total,0);
 const answer=await ok('/assistant','POST',{question:'DEMO-IMPORT-000009',locale:'ru'},visitor);assert.equal(answer.noAnswer,true);assert.deepEqual(answer.sources,[]);
 proof.draftOnlyCommitAndStringIdentity=true;proof.concurrentCommitDoesNotDuplicate=true;proof.importedDraftsAbsentFromAssistant=true;
});
test('same commit and a reordered replay do not duplicate nodes or documents; export compares normalized fields',async()=>{
 const count=await db.document.count();assert.equal((await action(original,'commit')).createdDocuments.length,2);assert.equal(await db.document.count(),count);
 const reordered=structuredClone(fixture);reordered.documents.reverse();reordered.funds.reverse();reordered.cases.reverse();reordered.inventories.reverse();let repeated=await stage(reordered);assert.equal(repeated.report.counts.create,0);assert.equal(repeated.report.counts.unchanged,2);repeated=await action(repeated,'commit');assert.deepEqual(repeated.createdDocuments,[]);assert.equal(await db.document.count(),count);
 const exported=await ok('/admin/imports/'+original.id+'/export');assert.deepEqual(exported.sourceManifest,catalogImportSchema.parse(fixture));assert.equal(exported.currentValidation.valid,true);assert.equal(exported.currentValidation.counts.unchanged,2);assert.equal(exported.materialized.length,2);assert.equal(exported.includesFileBytes,false);assert.equal(exported.includesPrivateNotes,false);
 assert.equal((await ok('/admin/imports/'+repeated.id+'/export')).materialized.length,2);proof.idempotentReorderedReplay=true;proof.exactMetadataExportVerified=true;
});
test('changed source and missing parent are reported by row; failed commit has no partial writes',async()=>{
 const before=await db.document.count();const changed=structuredClone(fixture);changed.documents[0].metadata.title+=' changed';let batch=await stage(changed);assert.equal(batch.state,'VALIDATION_FAILED');assert.ok(batch.report.issues.some((i:{code:string})=>i.code==='source-or-destination-changed'));assert.equal((await call('/admin/imports/'+batch.id+'/commit','POST',params(batch),writer)).status,409);await action(batch,'cancel');
 const missing=variant('missing-parent');missing.documents[0].fundKey='unknown';batch=await stage(missing);assert.ok(batch.report.issues.some((i:{path:string;code:string})=>i.path==='documents.0.fundKey'&&i.code==='missing-parent'));assert.equal((await call('/admin/imports/'+batch.id+'/commit','POST',params(batch),writer)).status,409);await action(batch,'cancel');assert.equal(await db.document.count(),before);proof.conflictsHaveNoPartialArchiveWrites=true;
});
test('commit revalidates a changed destination rather than trusting the earlier dry-run',async()=>{
 let batch=await stage(variant('stale-plan'));assert.equal(batch.state,'READY');const before=await db.document.count();
 let fund=await db.fund.findFirstOrThrow({where:{branchId:fixture.branchId,number:'0007'}});const originalName=fund.name;
 fund=(await ok('/admin/catalog/funds/'+fund.id,'PATCH',{name:'Manual hierarchy edit',expectedUpdatedAt:fund.updatedAt.toISOString()})).item;
 assert.equal((await call('/admin/imports/'+batch.id+'/commit','POST',params(batch),writer)).status,409);assert.equal(await db.document.count(),before);
 batch=await action(batch,'validate');assert.equal(batch.state,'VALIDATION_FAILED');
 await ok('/admin/catalog/funds/'+fund.id,'PATCH',{name:originalName,expectedUpdatedAt:fund.updatedAt});batch=await action(batch,'validate');assert.equal(batch.state,'READY');await action(batch,'cancel');proof.destinationRecheckedAtCommit=true;
});
test('soft rollback preserves audit and accounting nodes and never revives a rolled-back source',async()=>{
 const input=variant('rollback');let batch=await action(await stage(input),'commit');const created=batch.createdDocuments.map((d:{id:string})=>d.id);batch=await action(batch,'rollback');assert.equal(batch.state,'ROLLED_BACK');
 for(const id of created){const d=await db.document.findUniqueOrThrow({where:{id},include:{contentItem:{include:{revisions:true}}}});assert.ok(d.deletedAt);assert.equal(d.isPublic,false);assert.ok(d.contentItem!.revisions.every(r=>r.status==='ARCHIVED'));assert.equal((await call('/documents/'+id)).status,404);}
 assert.equal((await call('/admin/imports/'+batch.id+'/commit','POST',params(batch),writer)).status,409);
 const replay=await stage(input);assert.equal(replay.state,'VALIDATION_FAILED');await action(replay,'cancel');assert.equal(await db.catalogImportSource.count({where:{batchId:batch.id}}),2);proof.softRollbackRetainsHistoryAndNeverRepublishes=true;
});
test('independent draft edits block both automatic overwrite and whole-batch rollback',async()=>{
 const upload=(await ok('/admin/uploads','POST',{documentId:original.createdDocuments[1].id,originalName:'Pending.png',mimeType:'image/png',expectedBytes:scans[0].size,expectedSha256:scans[0].sha256,rights:'CC0-1.0',sourceNote:'Original pending fixture'},writer,201)).item;
 assert.equal((await call('/admin/imports/'+original.id+'/rollback','POST',params(original),writer)).status,409);await db.archiveUpload.delete({where:{id:upload.id}});proof.pendingFileWorkBlocksRollback=true;
 const first=original.createdDocuments[0];const revision=await db.contentRevision.findFirstOrThrow({where:{id:{in:first.revisions.map((r:{id:string})=>r.id)},locale:'ru'}});
 await ok('/admin/revisions/'+revision.id,'PATCH',{expectedUpdatedAt:revision.updatedAt.toISOString(),payload:{...(revision.payload as Record<string,unknown>),title:'Independent editor draft'}});
 assert.equal((await call('/admin/imports/'+original.id+'/rollback','POST',params(original),writer)).status,409);for(const row of original.createdDocuments)assert.equal((await db.document.findUniqueOrThrow({where:{id:row.id}})).deletedAt,null);
 const replay=await stage();assert.equal(replay.state,'VALIDATION_FAILED');await action(replay,'cancel');const exported=await ok('/admin/imports/'+original.id+'/export');assert.equal(exported.currentValidation.valid,false);assert.deepEqual(exported.sourceManifest,catalogImportSchema.parse(fixture));proof.manualEditsAreProtectedFromOverwriteAndRollback=true;
});
test('imported drafts still require ordinary publication and translation source-version checks',async()=>{
 const input=variant('published');input.documents=[input.documents[0]];const batch=await action(await stage(input),'commit');const id=batch.createdDocuments[0].id;
 const d=await db.document.findUniqueOrThrow({where:{id},include:{contentItem:{include:{revisions:true}}}});let ru=d.contentItem!.revisions.find(r=>r.locale==='ru')!;
 for(const status of['IN_REVIEW','APPROVED','PUBLISHED'])ru=(await ok('/admin/revisions/'+ru.id+'/transition','POST',{status,expectedUpdatedAt:ru.updatedAt instanceof Date?ru.updatedAt.toISOString():ru.updatedAt,reason:'Ordinary independent import review'},status==='IN_REVIEW'?writer:reviewer)).item;
 assert.equal((await call('/documents/'+id)).status,200);assert.equal((await call('/documents/'+id+'?locale=en')).status,404);
 let en=d.contentItem!.revisions.find(r=>r.locale==='en')!;assert.equal((await call('/admin/revisions/'+en.id+'/transition','POST',{status:'IN_REVIEW',expectedUpdatedAt:en.updatedAt.toISOString(),reason:'Stale translation source'},writer)).status,409);
 en=(await ok('/admin/revisions/'+en.id,'PATCH',{expectedUpdatedAt:en.updatedAt.toISOString(),payload:en.payload})).item;
 for(const status of['IN_REVIEW','APPROVED','PUBLISHED'])en=(await ok('/admin/revisions/'+en.id+'/transition','POST',{status,expectedUpdatedAt:en.updatedAt instanceof Date?en.updatedAt.toISOString():en.updatedAt,reason:'Ordinary translation review'},status==='IN_REVIEW'?writer:reviewer)).item;
 assert.equal((await call('/documents/'+id+'?locale=en')).status,200);assert.equal((await call('/admin/imports/'+batch.id+'/rollback','POST',params(batch),writer)).status,409);proof.ordinaryReviewAndLocaleVersionGatesRemainEnforced=true;
});
test('bounded staging quota, audit and immediate role revocation apply to existing sessions',async()=>{
 const manifest=catalogImportSchema.parse(fixture);await db.catalogImport.createMany({data:Array.from({length:20},(_,i)=>({id:prefix+'quota-'+i,branchId:fixture.branchId,sourceNamespace:fixture.sourceNamespace,authorId:prefix+'writer',manifest,digest:importManifestDigest(manifest),state:'READY',report:{},createdDocuments:[]}))});
 try{assert.equal((await call('/admin/imports','POST',fixture,writer)).status,409);}finally{await db.catalogImport.deleteMany({where:{id:{startsWith:prefix+'quota-'}}});}
 const actions=await db.auditEvent.findMany({where:{actorId:prefix+'writer'},select:{action:true}});for(const action of['IMPORT_STAGED','IMPORT_COMMITTED','IMPORT_REVALIDATED','IMPORT_CANCELLED','IMPORT_ROLLED_BACK','DOCUMENT_DRAFT_IMPORTED'])assert.ok(actions.some(a=>a.action===action));
 await db.staffAssignment.deleteMany({where:{userId:prefix+'writer'}});try{assert.equal((await call('/admin/imports/'+original.id+'/export','GET',undefined,writer)).status,403);}finally{await db.staffAssignment.create({data:{userId:prefix+'writer',roleId:'ARCHIVIST',branchId:fixture.branchId,scopeKey:fixture.branchId}});}
 proof.quotaAuditAndRevocation=true;
});
