/** Attach the exact official R01 PDF to the current reviewed paid-services edition. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import manifest from '../sources/archive-reference-20261110/manifest.json';
import {db} from '../src/server/db';
import {publicContentScope} from '../src/server/public-visibility';
import {resolveMaterial} from '../src/server/discovery-materials';
import {stageUpload,readStagedUpload,removeStagedUpload} from '../src/server/upload-storage';
import {approveCmsAttachment,publishCmsAttachment} from '../src/server/cms-attachments';

const uploaderId='ale-source-importer-v2',reviewerId='ale-source-integrity-v2';
export const referenceOriginalSpec=Object.freeze({sourceId:'R01',slug:'archive-paid-services-info',locale:'ru' as const,name:'Постановление — прейскурант платных услуг.pdf'});
export function checkedReferenceOriginal(bytes:Buffer){
 const file=manifest.files.find(row=>row.id===referenceOriginalSpec.sourceId);
 if(!file||file.status!==200||file.original!=='originals/R01-prices.pdf'||bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('REFERENCE_ORIGINAL_SOURCE_CHANGED');
 return file;
}
export async function publishReferenceOriginals(apply=false){
 const bytes=await readFile(path.join(process.env.REFERENCE_ORIGINALS_ROOT||'sources/archive-reference-20261110/originals','R01-prices.pdf'));
 const file=checkedReferenceOriginal(bytes);
 const result={apply,sourceId:file.id,slug:referenceOriginalSpec.slug,sha256:file.sha256,items:[] as {id:string;state:string;revisionId:string}[],blocked:[] as {reason:string}[]};
 if(!apply)return result;
 const lock=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL});await lock.connect();
 try{
  const acquired=await lock.query('SELECT pg_try_advisory_lock(782032118) AS acquired');
  if(!acquired.rows[0].acquired){result.blocked.push({reason:'IMPORT_IN_PROGRESS'});return result;}
  try{
   const actors=await db.user.findMany({where:{id:{in:[uploaderId,reviewerId]}},include:{accounts:true}});
   const emails:Record<string,string>={[uploaderId]:'source-import@aleteam.invalid',[reviewerId]:'source-integrity@aleteam.invalid'};
   if(actors.length!==2||actors.some(actor=>actor.isActive||actor.accounts.length||actor.email!==emails[actor.id]))throw Error('REFERENCE_ORIGINAL_TECHNICAL_ACTORS_REQUIRED');
   const item=await db.contentItem.findFirst({where:{...publicContentScope,slug:referenceOriginalSpec.slug,kind:'PAGE'},include:{revisions:{where:{locale:'ru',status:'PUBLISHED'},orderBy:{version:'desc'}}}});
   const revision=item?.revisions[0];
   const material=item?await resolveMaterial({kind:'cms',id:item.id},'ru',false):undefined;
   if(!revision||!material||material.eventRevision!==revision.id){result.blocked.push({reason:'PARENT_REVIEW_REQUIRED'});return result;}
   let row=await db.cmsAttachment.findFirst({where:{revisionId:revision.id,expectedSha256:file.sha256},orderBy:{createdAt:'desc'}});
   const decision=await db.cmsAttachment.findFirst({where:{revision:{itemId:item!.id},expectedSha256:file.sha256,state:{in:['WITHDRAWN','REJECTED']}}});
   if(decision&&row?.state!=='PUBLISHED'){result.blocked.push({reason:decision.state});return result;}
   if(row&&row.state!=='PUBLISHED'&&(row.uploaderId!==uploaderId||!['QUARANTINED','APPROVED'].includes(row.state))){result.blocked.push({reason:row.state});return result;}
   const storage=process.env.FILE_STORAGE_ROOT||'.local/files';
   if(!row){
    if(await db.cmsAttachment.count({where:{revisionId:revision.id,state:{notIn:['REJECTED','WITHDRAWN']}}})>=20){result.blocked.push({reason:'ATTACHMENT_QUOTA'});return result;}
    const staged=await stageUpload(new Request('http://reference-import.invalid/',{method:'PUT',body:new Uint8Array(bytes)}),{bytes:file.bytes,sha256:file.sha256,mime:'application/pdf'},storage);
    try{
     row=await db.cmsAttachment.create({data:{revisionId:revision.id,name:referenceOriginalSpec.name,mimeType:'application/pdf',expectedBytes:file.bytes,expectedSha256:file.sha256,storageKey:staged.storageKey,state:'QUARANTINED',uploaderId,rights:'Оригинал официального сайта; техническая публикация ALEteam по поручению пользователя. Актуальность тарифов отдельно не подтверждена.',sourceLabel:'Постановление об утверждении прейскуранта цен',sourceVersion:'Снимок официального источника '+file.checkedAt.slice(0,10),sourceNote:file.sourceUrl+'; '+file.parentUrl}});
    }catch(error){await removeStagedUpload(staged.storageKey,storage).catch(()=>{});throw error;}
    await db.auditEvent.create({data:{actorId:uploaderId,action:'REFERENCE_ORIGINAL_STAGED',entityId:row.id}});
   }
   if(!row.storageKey||row.expectedBytes!==file.bytes||row.mimeType!=='application/pdf')throw Error('REFERENCE_ORIGINAL_STORAGE_MISMATCH');
   await readStagedUpload({...row,storageKey:row.storageKey},storage);
   if(row.state==='QUARANTINED'){
    row=await approveCmsAttachment(row.id,reviewerId);
    await db.auditEvent.create({data:{actorId:reviewerId,action:'REFERENCE_ORIGINAL_TECHNICALLY_VERIFIED',entityId:row.id}});
   }
   if(row.state==='APPROVED')row=await publishCmsAttachment(row.id,reviewerId);
   result.items.push({id:row.id,state:row.state,revisionId:row.revisionId});return result;
  }finally{await lock.query('SELECT pg_advisory_unlock(782032118)');}
 }finally{await lock.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await publishReferenceOriginals(process.argv.includes('--apply'))));}catch(error){console.error('REFERENCE_ORIGINAL_PUBLICATION_FAILED',(error as {code?:string}).code||'FAILED');process.exitCode=1;}finally{await db.$disconnect();}
}
