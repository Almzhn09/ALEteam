// Requires a locally running production app and the same dedicated real-corpus _test database/storage.
import path from 'node:path';
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {writeFile,copyFile,unlink,mkdir} from 'node:fs/promises';import {PrismaClient} from '../src/generated/prisma/index.js';import {PrismaPg} from '@prisma/adapter-pg';
assert.ok(new URL(process.env.DATABASE_URL).pathname.endsWith('_test'));const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})}),base=process.env.BASE_URL||'http://localhost:3125',suffix=randomUUID();assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);const storage=path.resolve(process.env.FILE_STORAGE_ROOT||'.local/files');let itemId,revisionId,attachmentId,ownedFile;
try{
 const source=await db.cmsAttachment.findFirstOrThrow({where:{state:'PUBLISHED',name:'История архива.docx'},include:{revision:{include:{item:true}}}});const {revision,...attachment}=source;const {item,...revisionData}=revision;
 itemId=randomUUID();revisionId=randomUUID();attachmentId=randomUUID();
 await db.contentItem.create({data:{...item,id:itemId,slug:'reader-rights-'+suffix}});
 await db.contentRevision.create({data:{...revisionData,id:revisionId,itemId}});
 const storageKey='uploads/'+randomUUID()+'.bin';ownedFile=path.join(storage,storageKey);await copyFile(path.join(storage,source.storageKey),ownedFile);
 await db.cmsAttachment.create({data:{...attachment,id:attachmentId,revisionId,storageKey,previewKey:null,previewSha256:null,previewBytes:null}});
 const get=(query='reader=1')=>fetch(base+'/api/material-files/'+attachmentId+'/text?'+query);
 let response=await get();assert.equal(response.status,200);const first=(await response.json()).item;assert.equal(first.totalCharacters,12316);assert.equal(first.nextOffset,12000);
 response=await get('reader=1&offset=12000');assert.equal(response.status,200);const last=(await response.json()).item;assert.equal(last.nextOffset,null);assert.ok(last.fragments.some(f=>f.text.length>0));
 assert.equal((await get('reader=1&offset=-1')).status,400);
 await db.cmsAttachment.update({where:{id:attachmentId},data:{state:'WITHDRAWN'}});assert.equal((await get()).status,404);
 await db.cmsAttachment.update({where:{id:attachmentId},data:{state:'PUBLISHED'}});await db.contentRevision.update({where:{id:revisionId},data:{status:'ARCHIVED'}});assert.equal((await get()).status,404);
 const report={testedAt:new Date().toISOString(),checks:['Full original DOCX has 12316 characters and a readable final part','Negative reader offset rejected','Withdrawn file cannot be read through reader mode','Archived parent cannot be read through reader mode'],scope:'New temporary clone in dedicated local _test database only; original source records and live Neon unchanged'};await mkdir('.local',{recursive:true});await writeFile('.local/reader-rights-proof.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(attachmentId)await db.cmsAttachment.deleteMany({where:{id:attachmentId}});if(revisionId)await db.contentRevision.deleteMany({where:{id:revisionId}});if(itemId)await db.contentItem.deleteMany({where:{id:itemId}});if(ownedFile)await unlink(ownedFile).catch(()=>{});await db.$disconnect();}
