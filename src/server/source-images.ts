import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import manifest from '../../sources/archive-visual-20261111/manifest.json';
import {db} from './db';
import {canonicalHash} from './catalog-import-schema';
import {resolveMaterial} from './discovery-materials';
import {stageUpload,readStagedUpload} from './upload-storage';
import {approveCmsAttachment,publishCmsAttachment} from './cms-attachments';

const uploaderId='ale-source-importer-v2',reviewerId='ale-source-integrity-v2';
/** No implicit history/event parent: each photograph needs its own reviewed context. */
export function sourceImagePublicationParent(image:{id:string;publicationParentSourceKey?:unknown}){
 const sourceKey=image.publicationParentSourceKey;
 return typeof sourceKey==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(sourceKey)?{namespace:'real-content-20261111',sourceKey,locale:'ru' as const}:null;
}
/** An explicit operator step: curated photos use the existing private upload/review/publication workflow. */
export async function publishSourceImages(apply=false){
 const photographs=manifest.images.filter(image=>image.origin==='official_archive_site');
 const blocked:{id:string;reason:string}[]=photographs.filter(image=>image.decoderValidation.status!=='complete_decode').map(image=>({id:image.id,reason:'incomplete_source'}));
 const ready=photographs.filter(image=>image.decoderValidation.status==='complete_decode').flatMap(image=>{
  const parent=sourceImagePublicationParent(image);
  if(!parent){blocked.push({id:image.id,reason:'context_required'});return [];}
  return [{image,parent}];
 });
 const readySummary=ready.map(({image,parent})=>({id:image.id,path:image.path,sha256:image.sha256,parentSourceKey:parent.sourceKey,locale:parent.locale}));
 if(!apply||!ready.length)return {apply,ready:readySummary,items:[],blocked};
 const actors=await db.user.findMany({where:{id:{in:[uploaderId,reviewerId]}},include:{accounts:true}});
 const emails:Record<string,string>={[uploaderId]:'source-import@aleteam.invalid',[reviewerId]:'source-integrity@aleteam.invalid'};
 if(actors.length!==2||actors.some(actor=>actor.isActive||actor.accounts.length||actor.email!==emails[actor.id]))throw Error('SOURCE_IMAGE_TECHNICAL_ACTORS_REQUIRED');
 const storage=process.env.FILE_STORAGE_ROOT||'.local/files',items=[];
 for(const {image,parent} of ready){
  const binding=await db.realContentBinding.findUniqueOrThrow({where:{namespace_sourceKey_locale:parent}});
  const revision=await db.contentRevision.findUniqueOrThrow({where:{id:(binding.data as {revisionId:string}).revisionId}});
  const material=await resolveMaterial({kind:'cms',id:binding.targetId},parent.locale,false);
  if(!material||material.eventRevision!==revision.id||canonicalHash(revision.payload)!==binding.outputHash)throw Error('SOURCE_IMAGE_PARENT_REVIEW_REQUIRED');
  const bytes=await readFile(image.path);if(bytes.length!==image.bytes||createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw Error('SOURCE_IMAGE_HASH_CHANGED');
  let row=await db.cmsAttachment.findFirst({where:{revisionId:revision.id,expectedSha256:image.sha256},orderBy:{createdAt:'desc'}});
  const priorDecision=await db.cmsAttachment.findFirst({where:{revision:{itemId:binding.targetId},expectedSha256:image.sha256,state:{in:['WITHDRAWN','REJECTED']}}});
  if(priorDecision&&row?.state!=='PUBLISHED'){blocked.push({id:image.id,reason:priorDecision.state});continue;}
  // An editor's rejection/withdrawal or unfinished upload is never overridden.
  if(row&&row.state!=='PUBLISHED'&&(row.uploaderId!==uploaderId||!['QUARANTINED','APPROVED'].includes(row.state))){blocked.push({id:image.id,reason:row.state});continue;}
  if(!row){
   if(await db.cmsAttachment.count({where:{revisionId:revision.id,state:{notIn:['REJECTED','WITHDRAWN']}}})>=20)throw Error('SOURCE_IMAGE_ATTACHMENT_QUOTA');
   const mime=image.path.endsWith('.png')?'image/png' as const:'image/jpeg' as const;
   const staged=await stageUpload(new Request('http://source-import.invalid/',{method:'PUT',body:new Uint8Array(bytes)}),{bytes:image.bytes,sha256:image.sha256,mime},storage);
   row=await db.cmsAttachment.create({data:{revisionId:revision.id,name:path.basename(image.path),mimeType:mime,expectedBytes:image.bytes,expectedSha256:image.sha256,storageKey:staged.storageKey,state:'QUARANTINED',uploaderId,rights:'Предоставленный официальный источник; техническая публикация ALEteam по поручению пользователя, не подпись госархива.',sourceLabel:image.caption,sourceVersion:'Снимок источника '+(('downloadedAt' in image&&typeof image.downloadedAt==='string')?image.downloadedAt.slice(0,10):manifest.retrieved),sourceNote:image.sourceImageUrl+'; '+image.sourceUrl}});
   await db.auditEvent.create({data:{actorId:uploaderId,action:'SOURCE_IMAGE_STAGED',entityId:row.id}});
  }
  if(!row.storageKey)throw Error('SOURCE_IMAGE_STORAGE_MISSING');
  await readStagedUpload({...row,storageKey:row.storageKey},storage);
  if(row.state==='QUARANTINED'){
   row=await approveCmsAttachment(row.id,reviewerId);
   await db.auditEvent.create({data:{actorId:reviewerId,action:'SOURCE_IMAGE_TECHNICALLY_VERIFIED',entityId:row.id}});
  }
  if(row.state==='APPROVED')row=await publishCmsAttachment(row.id,reviewerId);
  items.push({sourceId:image.id,parentSourceKey:parent.sourceKey,locale:parent.locale,id:row.id,sha256:row.expectedSha256,state:row.state});
 }
 return {apply,ready:readySummary,items,blocked};
}
