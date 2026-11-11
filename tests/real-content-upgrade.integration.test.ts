import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';

const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated _test DB required');
process.env.DATABASE_URL=url;
const storage=await mkdtemp(path.join(tmpdir(),'ale-real-upgrade-'));process.env.FILE_STORAGE_ROOT=storage;
const {db}=await import('../src/server/db');
const {importRealContent}=await import('../src/server/real-content-import');
const {realContentPackage}=await import('../src/server/real-content-package');
const {canonicalHash:hash}=await import('../src/server/catalog-import-schema');
const {cmsFileResponse,cmsFileText}=await import('../src/server/cms-attachments');
const pack=await realContentPackage(),namespace=pack.namespace;
async function reset(){
 const names=[...readFileSync('prisma/schema.prisma','utf8').matchAll(/^model ([A-Za-z0-9_]+) \{/gm)].map(m=>m[1]).filter(n=>!['StaffRole','StaffPermission'].includes(n));
 await db.$executeRawUnsafe('TRUNCATE '+names.map(n=>'"'+n+'"').join(',')+' RESTART IDENTITY CASCADE');
}
async function binding(sourceKey:string,locale='ru'){return db.realContentBinding.findUniqueOrThrow({where:{namespace_sourceKey_locale:{namespace,sourceKey,locale}}});}
const conflict=(error:unknown)=>(error as {code?:string}).code==='SOURCE_IMPORT_CONFLICT';
before(async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env:process.env,stdio:'pipe'});await reset();await importRealContent(false);
},{timeout:180000});
after(async()=>{try{await reset();}finally{await db.$disconnect();await rm(storage,{recursive:true,force:true});}});

test('a reviewed package upgrades an untouched owned edition, rebinds its original and preserves revision history',{timeout:180000},async()=>{
 // A synthetic previous package is confined to this disposable DB. No production source is changed.
 const row=pack.rows.find(r=>r.sourceKey==='history-1'&&r.locale==='ru')!,bound=await binding(row.sourceKey);
 const old=await db.contentRevision.findUniqueOrThrow({where:{id:(bound.data as {revisionId:string}).revisionId}});
 const oldPayload={...row.payload,title:'Isolated previous package edition'};
 await db.contentRevision.update({where:{id:old.id},data:{payload:oldPayload}});
 await db.realContentBinding.update({where:{id:bound.id},data:{inputHash:hash({...row,payload:oldPayload}),outputHash:hash(oldPayload)}});
 const oldFile=await db.cmsAttachment.findFirstOrThrow({where:{revisionId:old.id,state:'PUBLISHED'}});
 const firstFact=await db.realContentBinding.findFirstOrThrow({where:{namespace,targetKind:'fact',sourceKey:'topic-archives'}});
 const fact=await db.discoveryFact.findUniqueOrThrow({where:{id:firstFact.targetId}});
 // Earlier releases had different labels and evidence versions.
 const previousData={labels:{ru:{title:'Isolated previous topic',body:''}}};
 await db.discoveryFact.update({where:{id:fact.id},data:{data:previousData}});
 await db.realContentBinding.update({where:{id:firstFact.id},data:{inputHash:hash({previous:true}),outputHash:hash(previousData)}});
 const result=await importRealContent(false),updated=await binding(row.sourceKey);
 assert.equal(result.pages.length,53);assert.equal(updated.targetId,bound.targetId);
 const current=await db.contentRevision.findUniqueOrThrow({where:{id:(updated.data as {revisionId:string}).revisionId}});
 assert.equal(current.version,old.version+1);assert.equal(current.status,'PUBLISHED');assert.deepEqual(current.payload,row.payload);
 assert.equal((await db.contentRevision.findUniqueOrThrow({where:{id:old.id}})).status,'ARCHIVED');
 assert.equal((updated.data as {versions:unknown[]}).versions.length,1);
 await assert.rejects(()=>cmsFileResponse(new Request('http://test.invalid/'),oldFile.id),e=>(e as {status?:number}).status===404);
 const newFile=await db.cmsAttachment.findFirstOrThrow({where:{revisionId:current.id,state:'PUBLISHED'}});
 assert.equal(newFile.expectedSha256,oldFile.expectedSha256);assert.notEqual(newFile.id,oldFile.id);
 assert.equal((await cmsFileResponse(new Request('http://test.invalid/'),newFile.id)).status,200);
 const updatedFact=await db.discoveryFact.findUniqueOrThrow({where:{id:fact.id}});
 assert.equal((updatedFact.data as {labels:{ru:{title:string}}}).labels.ru.title,'История архива');
 assert.equal(updatedFact.status,'VERIFIED');
 assert.equal((await binding('topic-archives')).targetId,fact.id);
 const counts=async()=>({revisions:await db.contentRevision.count(),files:await db.cmsAttachment.count(),facts:await db.discoveryFact.count(),publications:await db.materialPublication.count()});
 const before=await counts();await importRealContent(false);assert.deepEqual(await counts(),before);
});

test('editor changes and a newer human draft stop publication without erasing edits',async()=>{
 const bound=await binding('contacts'),id=(bound.data as {revisionId:string}).revisionId;
 const original=await db.contentRevision.findUniqueOrThrow({where:{id}});
 const edited={...original.payload as object,title:'Protected human title'};
 await db.contentRevision.update({where:{id},data:{payload:edited}});
 const count=await db.contentRevision.count();await assert.rejects(()=>importRealContent(false),conflict);
 assert.equal(await db.contentRevision.count(),count);assert.deepEqual((await db.contentRevision.findUniqueOrThrow({where:{id}})).payload,edited);
 await db.contentRevision.update({where:{id},data:{payload:original.payload!}});
 const draft=await db.contentRevision.create({data:{itemId:original.itemId,locale:original.locale,version:original.version+1,payload:original.payload!,authorId:'ale-source-importer-v2'}});
 await assert.rejects(()=>importRealContent(false),conflict);assert.ok(await db.contentRevision.findUnique({where:{id:draft.id}}));
 await db.contentRevision.delete({where:{id:draft.id}});
});

test('an upgraded withdrawn edition or closed branch requires review and stays private',async()=>{
 const bound=await binding('contacts'),id=(bound.data as {revisionId:string}).revisionId;
 await db.realContentBinding.update({where:{id:bound.id},data:{inputHash:hash('isolated older source version')}});
 const originalFile=await db.cmsAttachment.findFirstOrThrow({where:{revisionId:id,state:'PUBLISHED'}});
 await db.cmsAttachment.update({where:{id:originalFile.id},data:{state:'WITHDRAWN'}});
 await assert.rejects(()=>importRealContent(false),conflict);assert.equal((await db.cmsAttachment.findUniqueOrThrow({where:{id:originalFile.id}})).state,'WITHDRAWN');
 await db.cmsAttachment.update({where:{id:originalFile.id},data:{state:'PUBLISHED'}});
 await db.contentRevision.update({where:{id},data:{status:'ARCHIVED'}});
 await assert.rejects(()=>importRealContent(false),conflict);assert.equal((await db.contentRevision.findUniqueOrThrow({where:{id}})).status,'ARCHIVED');
 await db.contentRevision.update({where:{id},data:{status:'PUBLISHED'}});
 await db.realContentBinding.update({where:{id:bound.id},data:{inputHash:bound.inputHash}});
 const profile=pack.rows.find(r=>r.branchId)!;const branchBound=await binding(profile.sourceKey,profile.locale);
 const item=await db.contentItem.findUniqueOrThrow({where:{id:branchBound.targetId}});
 await db.archiveBranch.update({where:{id:item.branchId!},data:{isPublic:false}});
 await db.realContentBinding.update({where:{id:branchBound.id},data:{inputHash:hash('isolated older branch version')}});
 await assert.rejects(()=>importRealContent(false),conflict);assert.equal((await db.archiveBranch.findUniqueOrThrow({where:{id:item.branchId!}})).isPublic,false);
 await db.archiveBranch.update({where:{id:item.branchId!},data:{isPublic:true}});
 await db.realContentBinding.update({where:{id:branchBound.id},data:{inputHash:branchBound.inputHash}});
});

test('resuming after independent approval completes measured S06 OCR before publication',async()=>{
 const bound=await binding('branch-decree-142'),revisionId=(bound.data as {revisionId:string}).revisionId;
 const file=await db.cmsAttachment.findFirstOrThrow({where:{revisionId,state:'PUBLISHED'}});
 await db.cmsAttachment.update({where:{id:file.id},data:{state:'APPROVED',parsed:{...file.parsed as object,fragments:[],ocr:{used:false,quality:'not_applicable'}}}});
 await importRealContent(false);const text=await cmsFileText(file.id);
 assert.equal(text.isOcr,true);assert.deepEqual(text.fragments.map(f=>f.page),[4,5,6]);assert.ok(text.confidence!>0&&text.confidence!<=1);
 assert.equal((await db.cmsAttachment.findUniqueOrThrow({where:{id:file.id}})).state,'PUBLISHED');
 await db.cmsAttachment.update({where:{id:file.id},data:{state:'WITHDRAWN'}});
 await importRealContent(false);assert.equal((await db.cmsAttachment.findUniqueOrThrow({where:{id:file.id}})).state,'WITHDRAWN');
});

test('a simultaneous source import fails promptly instead of duplicating publications',async()=>{
 const lock=new pg.Client({connectionString:url});await lock.connect();
 try{
  await lock.query('SELECT pg_advisory_lock(782032114)');
  await assert.rejects(()=>importRealContent(false),e=>(e as {code?:string}).code==='SOURCE_IMPORT_BUSY');
 }finally{await lock.query('SELECT pg_advisory_unlock(782032114)');await lock.end();}
});
