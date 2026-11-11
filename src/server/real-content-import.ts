import {readFile} from 'node:fs/promises';
import {db} from './db';
import {Prisma,type ContentRevision} from '../generated/prisma/index.js';
import {ApiError} from './http';
import {canonicalHash} from './catalog-import-schema';
import {realContentPackage,type RealPage} from './real-content-package';
import {prepareSourceDraftRows} from './source-drafts';
import {createCmsDraft,appendCmsDraft} from './cms-drafts';
import {applyCmsTransition,contentPayload} from './cms';
import {importReferencePackage} from './reference-import';
import {resolveMaterial,resolveEvidence} from './discovery-materials';
import {parseFact,validateFact,type FactKind} from './discovery-facts';
import {prepareDiscoveryFacts,type PublishedSourceBinding} from './artur-discovery/publication';
import {prepareRealCuration} from './artur-discovery/real-publication';
import editorialTopics from '../../data/artur/discovery/topics.json';
import {stageUpload,readStagedUpload} from './upload-storage';
import {approveCmsAttachment,publishCmsAttachment,processCmsAttachment,docxMime} from './cms-attachments';
import type {UploadMime} from '../contracts/uploads';
const authorId='ale-source-importer-v2',reviewerId='ale-source-integrity-v2';
const grants=['content.read','content.write','content.review','content.publish','catalog.read','catalog.write'].map(permission=>({permission,branchId:null}));
const reason='Технический процесс ALEteam: пользователь поручил опубликовать предоставленные источники; сверка SHA и выбранных публичных полей. Не подпись госархива.';
const hash=canonicalHash;
async function actors(){
 for(const [id,email,name]of [[authorId,'source-import@aleteam.invalid','ALEteam — автоматический импорт источников'],[reviewerId,'source-integrity@aleteam.invalid','ALEteam — автоматическая сверка источников']]){
  const current=await db.user.findUnique({where:{id},include:{accounts:true}});if(current&&(current.email!==email||current.accounts.length||current.isActive))throw Error('TECHNICAL_ACTOR_CONFLICT');
  if(!current)await db.user.create({data:{id,email,name,emailVerified:false,isActive:false}});
 }
}
async function publishRevision(revision:ContentRevision){
 let current=revision;
 for(const status of ['IN_REVIEW','APPROVED','PUBLISHED'] as const){
  if(current.status==='PUBLISHED'||current.status==='ARCHIVED')break;
  if(status==='IN_REVIEW'&&!['DRAFT','CHANGES_REQUESTED'].includes(current.status)||status==='APPROVED'&&current.status!=='IN_REVIEW'||status==='PUBLISHED'&&current.status!=='APPROVED')continue;
  current=await db.$transaction(async tx=>{const full=await tx.contentRevision.findUniqueOrThrow({where:{id:current.id},include:{item:true}});return applyCmsTransition(tx,full,{status,expectedUpdatedAt:full.updatedAt.toISOString(),reason},{user:{id:status==='IN_REVIEW'?authorId:reviewerId},grants});});
 }return current;
}
async function ensurePage(row:RealPage,namespace:string){
 const key={namespace_sourceKey_locale:{namespace,sourceKey:row.sourceKey,locale:row.locale}};
 const inputHash=hash(row),binding=await db.realContentBinding.findUnique({where:key});
 if(binding){const data=binding.data as {revisionId:string};const revision=await db.contentRevision.findUniqueOrThrow({where:{id:data.revisionId}});if(binding.inputHash!==inputHash||hash(revision.payload)!==binding.outputHash)throw new ApiError(409,'SOURCE_IMPORT_CONFLICT','Данные изменились. Обновите страницу и повторите.');return {itemId:binding.targetId,revision:await publishRevision(revision),state:revision.status==='ARCHIVED'?'withdrawn':'unchanged',slug:(await db.contentItem.findUniqueOrThrow({where:{id:binding.targetId}})).slug};}
 let revision:ContentRevision;let itemId:string;let slug=row.slug;
 const legacy=await db.sourceDraftBinding.findUnique({where:{namespace_sourceKey_locale:{namespace:'archive-20261110',sourceKey:row.sourceKey,locale:row.locale}},include:{item:true,revision:true}});
 if(legacy){
  const old=contentPayload.parse(legacy.revision.payload),original=(legacy.original as any)?.request?.payload;
  const expected=original?contentPayload.parse(original):prepareSourceDraftRows({package:'archive-20261110',mode:'branches',mappings:[{sourceKey:row.sourceKey,slug:legacy.item.slug,...(legacy.item.branchId?{branchId:legacy.item.branchId}:{})}]}).map(r=>r.payload)[0];
  if(legacy.item.isDemo||legacy.item.kind!==row.kind||!['DRAFT','PUBLISHED'].includes(legacy.revision.status)||hash(old)!==hash(expected))throw new ApiError(409,'SOURCE_IMPORT_CONFLICT','Данные изменились. Обновите страницу и повторите.');
  if(legacy.item.branchId){const branch=await db.archiveBranch.findUniqueOrThrow({where:{id:legacy.item.branchId}});if(!branch.isPublic){const documents=await db.document.count({where:{isPublic:true,deletedAt:null,fund:{branchId:branch.id}}}),otherPublications=await db.contentRevision.count({where:{status:'PUBLISHED',item:{branchId:branch.id,id:{not:legacy.itemId}}}});if(documents||otherPublications)throw new ApiError(409,'BRANCH_VISIBILITY_REVIEW_REQUIRED','Данные изменились. Обновите страницу и повторите.');}}
  itemId=legacy.itemId;slug=legacy.item.slug;
  if(legacy.revision.status==='DRAFT')revision=await db.contentRevision.update({where:{id:legacy.revision.id},data:{payload:row.payload,authorId,reviewerId:null}});
  else revision=await db.$transaction(tx=>appendCmsDraft(tx,itemId,row.locale,row.payload,authorId));
 }else{
  if(row.branchId){const existing=await db.archiveBranch.findUnique({where:{id:row.branchId}});if(existing&&existing.name!==row.branchName)throw Error('SOURCE_BRANCH_CONFLICT');if(!existing)await db.archiveBranch.create({data:{id:row.branchId,code:'source-'+row.sourceKey.replace(/[^a-zA-Z0-9_-]/g,'-'),name:row.branchName!,isPublic:false,isDemo:false}});}
  const existing=await db.contentItem.findUnique({where:{slug}});if(existing){const own=await db.realContentBinding.count({where:{namespace,targetKind:'cms',targetId:existing.id}});if(!own||existing.isDemo||existing.branchId!==row.branchId||existing.kind!==row.kind)throw new ApiError(409,'SOURCE_IMPORT_CONFLICT','Данные изменились. Обновите страницу и повторите.');itemId=existing.id;revision=await db.$transaction(tx=>appendCmsDraft(tx,itemId,row.locale,row.payload,authorId));}else{const item=await db.$transaction(tx=>createCmsDraft(tx,{slug,kind:row.kind,branchId:row.branchId,isDemo:false,locale:row.locale,payload:row.payload},authorId));itemId=item.id;revision=item.revisions[0];}
 }
 const recorded=await db.realContentBinding.create({data:{namespace,sourceKey:row.sourceKey,locale:row.locale,targetKind:'cms',targetId:itemId,inputHash,outputHash:hash(row.payload),data:{revisionId:revision.id,slug,reviewType:'automated-source-integrity',original:row.original as Prisma.InputJsonValue}}});
 revision=await publishRevision(revision);const targetBranchId=legacy?.item.branchId??row.branchId;if(targetBranchId)await db.archiveBranch.update({where:{id:targetBranchId},data:{isPublic:true,isDemo:false}});
 return {itemId,revision,state:'published',slug};
}
async function ensureFact(namespace:string,key:string,kind:FactKind,data:unknown,sources:unknown,parentId:string|null=null){
 const inputHash=hash({kind,data,sources,parentId}),where={namespace_sourceKey_locale:{namespace,sourceKey:key,locale:'ru'}};const binding=await db.realContentBinding.findUnique({where});
 if(binding){const row=await db.discoveryFact.findUniqueOrThrow({where:{id:binding.targetId}});if(binding.inputHash!==inputHash||hash(row.data)!==binding.outputHash)throw new ApiError(409,'SOURCE_IMPORT_CONFLICT','Данные изменились. Обновите страницу и повторите.');return row;}
 const parsed=parseFact(kind,data);return db.$transaction(async tx=>{
  if(!await resolveEvidence(sources,tx))throw Error('SOURCE_EVIDENCE_CHANGED');await validateFact(kind,parsed,parentId,tx);
  const draft=await tx.discoveryFact.create({data:{kind,data:parsed as Prisma.InputJsonObject,sources:sources as Prisma.InputJsonValue,parentId,authorId}});
  const verified=await tx.discoveryFact.update({where:{id:draft.id},data:{status:'VERIFIED',reviewerId}});
  await tx.auditEvent.create({data:{actorId:reviewerId,action:'SOURCE_FACT_TECHNICALLY_VERIFIED',entityId:verified.id}});
  await tx.realContentBinding.create({data:{namespace,sourceKey:key,locale:'ru',targetKind:'fact',targetId:verified.id,inputHash,outputHash:hash(parsed),data:{reviewType:'automated-source-integrity',sourcePublicationConsent:'user task R-B01'}}});return verified;
 });
}
async function ensureAttachment(namespace:string,key:string,page:{itemId:string;revision:ContentRevision},file:any){
 const where={namespace_sourceKey_locale:{namespace,sourceKey:'file-'+key,locale:page.revision.locale}},inputHash=hash([file.sha256,page.revision.id,file.publicationPages??null,file.ocrSha256??null]);const existing=await db.realContentBinding.findUnique({where});
 if(existing){if(existing.inputHash!==inputHash)throw Error('SOURCE_ATTACHMENT_CONFLICT');let current=await db.cmsAttachment.findUniqueOrThrow({where:{id:existing.targetId}});if(current.storageKey)await readStagedUpload({...current,storageKey:current.storageKey},process.env.FILE_STORAGE_ROOT||'.local/files');if(current.state==='QUARANTINED')current=await approveCmsAttachment(current.id,reviewerId);if(current.state==='APPROVED')current=await publishCmsAttachment(current.id,reviewerId);return current;}
 const bytes=await readFile('sources/archive-public-20261111/'+file.path),mime=file.name.toLowerCase().endsWith('.docx')?docxMime:'application/pdf';
 const staged=await stageUpload(new Request('http://import.invalid/',{method:'PUT',body:new Uint8Array(bytes)}),{bytes:file.bytes,sha256:file.sha256,mime:mime as UploadMime},process.env.FILE_STORAGE_ROOT||'.local/files');
 let row=await db.cmsAttachment.create({data:{revisionId:page.revision.id,name:file.name,mimeType:mime,expectedBytes:file.bytes,expectedSha256:file.sha256,storageKey:staged.storageKey,state:'QUARANTINED',uploaderId:authorId,rights:'Предоставленный оригинал; публикация в проекте по поручению пользователя.',sourceNote:file.member,sourceLabel:file.name,sourceVersion:'Предоставленный оригинал'}});
 await db.realContentBinding.create({data:{namespace,sourceKey:'file-'+key,locale:page.revision.locale,targetKind:'attachment',targetId:row.id,inputHash,outputHash:file.sha256,data:{sourceId:file.sourceId,masterSha256:file.sha256,member:file.member}}});
 if(file.publicationPages)await processCmsAttachment(row.id,{previewPage:file.publicationPages[0]});
 row=await approveCmsAttachment(row.id,reviewerId);
 if(file.sourceId==='S06'){
  const ocr=JSON.parse(await readFile('sources/archive-public-20261111/ocr-s06.json','utf8'));if(ocr.sourceSha256!==row.expectedSha256)throw Error('OCR_SOURCE_CHANGED');
  const words=ocr.pages.reduce((n:number,p:any)=>n+p.words,0),confidence=words?ocr.pages.reduce((n:number,p:any)=>n+(p.confidence??0)*p.words,0)/words/100:undefined;
  const fragments=ocr.pages.filter((p:any)=>p.text.trim()).map((p:any)=>({page:p.page,text:p.text,confidence:p.confidence===null?null:p.confidence/100,corrected:false}));
  await db.cmsAttachment.update({where:{id:row.id},data:{parsed:{...row.parsed as Prisma.InputJsonObject,fragments,publicationPages:file.publicationPages,ocr:{used:true,quality:'unreviewed',engine:ocr.engine,...(confidence!==undefined?{confidence}:{})}}}});
 }
 row=await publishCmsAttachment(row.id,reviewerId);
 return row;
}
export async function importRealContent(dryRun=true){
 const pack=await realContentPackage();if(dryRun)return {dryRun,digest:pack.digest,pages:pack.rows.map(r=>({sourceKey:r.sourceKey,locale:r.locale,slug:r.slug,kind:r.kind})),files:pack.files.map((f:any)=>({sourceId:f.sourceId,name:f.name,sha256:f.sha256})),directories:await importReferencePackage(authorId,true),excluded:pack.excluded};
 await actors();const pages=[];
 for(const row of pack.rows){const published=await ensurePage(row,pack.namespace);pages.push({...published,sourceKey:row.sourceKey,locale:row.locale,payload:row.payload});}
 const directories=await importReferencePackage(authorId,false),attachments=[];
 for(const page of pages){if(page.revision.status!=='PUBLISHED')continue;
  let files:any[]=[];
  if(page.sourceKey.startsWith('history-'))files=pack.files.filter((f:any)=>f.sourceId==='S02');
  if(page.sourceKey==='contacts')files=pack.files.filter((f:any)=>f.sourceId==='S05');
  if(page.sourceKey==='structure')files=pack.files.filter((f:any)=>f.sourceId==='S07');
  if(page.sourceKey==='branch-decree-142')files=pack.files.filter((f:any)=>f.sourceId==='S06');
  if(page.sourceKey.startsWith('calendar-'))files=pack.files.filter((f:any)=>f.sourceId==='S03'&&f.name.includes(page.sourceKey.split('-')[1]));
  if(page.sourceKey.startsWith('compliance-file-'))files=pack.files.filter((f:any)=>page.sourceKey==='compliance-file-'+f.sha256.slice(0,16));
  const notices:Record<string,string>={'compliance-14':'Информация каз.docx','compliance-15':'Информация о работе комплаенс службы.docx','compliance-16':'О проведении внутреннего анализа коррупционных рисков.docx','compliance-17':'Сыбайлас жемқорлық тәуекелдеріне ішкі талдау жүргізу туралы.docx'};
  if(notices[page.sourceKey])files=pack.files.filter((f:any)=>f.sourceId==='S04'&&f.name===notices[page.sourceKey]);
  for(const file of files)attachments.push(await ensureAttachment(pack.namespace,page.sourceKey+'-'+file.sha256,page,file));
 }
 const bindings:PublishedSourceBinding[]=[];for(const page of pages){const material=await resolveMaterial({kind:'cms',id:page.itemId},page.locale as 'ru'|'kk'|'en',false);if(material)bindings.push({sourceKey:page.sourceKey,locale:page.locale as 'ru'|'kk'|'en',body:String(page.payload.body),source:material.source as PublishedSourceBinding['source']});}
 const facts=[],parents:Record<string,{id:string;name:string}>={};
 let prepared=prepareDiscoveryFacts(bindings);for(const request of prepared.ready.filter(r=>r.request.kind==='PLACE')){const row=await ensureFact(pack.namespace,request.draftKey,'PLACE',request.request.data,request.request.sources);const data=row.data as any;parents[request.draftKey]={id:row.id,name:data.labels.ru.title};facts.push(row);}
 prepared=prepareDiscoveryFacts(bindings,parents);for(const request of prepared.ready.filter(r=>r.request.kind!=='PLACE'))facts.push(await ensureFact(pack.namespace,request.draftKey,request.request.kind,request.request.data,request.request.sources,request.request.parentId??null));
 const topics=[];const definitions=[['archives','История архива','history-1'],['cities','История городов','calendar-2026-ru'],['calendar','Календарь памятных дат','calendar-2026-ru'],['newspapers','Газеты','newspaper-directory-info'],['compliance','Комплаенс','compliance-15'],['education','Школы и образование','calendar-2026-ru'],['industry','Промышленность','calendar-2025-ru'],['people','Люди региона','calendar-2026-ru']];
 const extraTopicLabels:Record<string,Record<string,string>>={calendar:{ru:'Календарь памятных дат',kk:'Атаулы күндер күнтізбесі',en:'Commemorative dates'},compliance:{ru:'Комплаенс',kk:'Комплаенс қызметі',en:'Compliance'}};
 for(const [key,title,sourceKey]of definitions){const source=bindings.find(b=>b.sourceKey===sourceKey);if(!source)continue;const translated=editorialTopics.records.find(t=>t.id===key)?.labels??extraTopicLabels[key]??{ru:title};const labels=Object.fromEntries(Object.entries(translated).map(([locale,title])=>[locale,{title}]));const row=await ensureFact(pack.namespace,'topic-'+key,'TOPIC',{labels},[source.source]);topics.push({key,row});}
 const topicFor=(key:string)=>key.startsWith('calendar-')?'calendar':key.includes('newspaper')?'newspapers':key.includes('compliance')?'compliance':'archives';
 pages.sort((a,b)=>{const order=['history-1','calendar-2026-ru','fund-directory-info'];const ai=order.indexOf(a.sourceKey),bi=order.indexOf(b.sourceKey);return (ai<0?100:ai)-(bi<0?100:bi);});
 let index=0;for(const page of pages.filter(p=>p.locale==='ru')){const source=bindings.find(b=>b.sourceKey===page.sourceKey&&b.locale===page.locale);if(!source)continue;const topic=topics.find(t=>t.key===topicFor(page.sourceKey))??topics[0];await ensureFact(pack.namespace,'editorial-'+page.sourceKey,'EDITORIAL',{material:{kind:'cms',id:page.itemId},topicId:topic.row.id,order:index++},[source.source]);}
 const aliases=[['fund-directory-info','fonds-guide'],['branch-decree-142','decree-142-ru']];
 const curatedBindings=[...bindings,...aliases.flatMap(([from,to])=>{const source=bindings.find(b=>b.sourceKey===from&&b.locale==='ru');return source?[{...source,sourceKey:to}]:[];})];
 const curated=prepareRealCuration(curatedBindings,parents,Object.fromEntries(topics.map(t=>[t.key,t.row.id])));
 for(const row of curated.ready.filter(r=>r.request.kind==='EDITORIAL'||r.request.kind==='LINK'))await ensureFact(pack.namespace,'curated-'+row.draftKey,row.request.kind,row.request.data,row.request.sources);
 const decree=pages.find(p=>p.sourceKey==='branch-decree-142'),contact=bindings.find(b=>b.sourceKey==='contacts');
 if(decree&&contact)for(const page of pages.filter(p=>p.sourceKey.startsWith('S01-')))await ensureFact(pack.namespace,'link-decree-'+page.sourceKey,'LINK',{from:{kind:'cms',id:decree.itemId},to:{kind:'cms',id:page.itemId},reason:'same_event'},[bindings.find(b=>b.sourceKey==='branch-decree-142')!.source,bindings.find(b=>b.sourceKey===page.sourceKey)!.source]);
 await db.realContentBinding.upsert({where:{namespace_sourceKey_locale:{namespace:pack.namespace,sourceKey:'__release__',locale:'none'}},create:{namespace:pack.namespace,sourceKey:'__release__',locale:'none',targetKind:'release',targetId:pack.namespace,inputHash:pack.digest,outputHash:pack.digest,data:{completed:true}},update:{inputHash:pack.digest,outputHash:pack.digest,data:{completed:true}}});
 return {dryRun:false,digest:pack.digest,technicalReview:{actors:[authorId,reviewerId],kind:'automated source-integrity stages; not an archive signature'},pages:pages.map(p=>({sourceKey:p.sourceKey,locale:p.locale,itemId:p.itemId,revisionId:p.revision.id,state:p.state,slug:p.slug})),attachments:attachments.map(a=>({id:a.id,revisionId:a.revisionId,sha256:a.expectedSha256,state:a.state})),directories,facts:facts.length,topics:topics.length,blockedFacts:prepared.blocked,excluded:pack.excluded};
}
