import { z } from 'zod';
import { locales, contentKinds } from '../contracts/cms';
import { db } from './db';
import { Prisma } from '../generated/prisma/index.js';
import { ApiError, idSchema, json, pageSchema, queryParams, readJson, rateLimit } from './http';
import { staffContext, audit } from './staff';
import { allows } from './staff-policy';
import { parseDocumentPayload } from './archive-schema';
import { catalogLock, validateDocumentRevision, applyDocumentPublication } from './archive-publication';
export const localeSchema=z.enum(locales);
export const kindSchema=z.enum(contentKinds);
const safeUrl=z.string().url().max(2000).refine(value=>{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;});
export const contentPayload=z.object({
 title:z.string().trim().min(1).max(200),body:z.string().trim().min(1).max(10000),
 sourceUrl:safeUrl.optional(),sourceNote:z.string().trim().min(1).max(1000).optional(),rights:z.string().trim().min(1).max(1000),
 date:z.iso.date().optional(),yearFrom:z.number().int().min(1).max(2100).optional(),yearTo:z.number().int().min(1).max(2100).optional(),
 category:z.string().trim().min(1).max(100).optional(),tags:z.array(z.string().trim().min(1).max(60)).max(20).default([]),
 documentIds:z.array(idSchema).max(50).default([]),contentIds:z.array(idSchema).max(50).default([]),
 fileIds:z.array(idSchema).max(20).default([]),exhibitIds:z.array(idSchema).max(100).default([]),
 address:z.string().trim().max(500).optional(),phone:z.string().trim().max(60).optional(),email:z.email().max(200).optional(),hours:z.string().trim().max(500).optional(),
 latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional(),
 seoDescription:z.string().max(300).optional(),seoKeywords:z.array(z.string().max(60)).max(20).default([]),
 links:z.array(z.object({label:z.string().min(1).max(120),url:safeUrl}).strict()).max(30).default([]),
}).strict().refine(p=>p.yearFrom===undefined||p.yearTo===undefined||p.yearFrom<=p.yearTo,{path:['yearTo'],message:'Invalid interval'});
export const transitions:Record<string,readonly string[]>={DRAFT:['IN_REVIEW'],CHANGES_REQUESTED:['IN_REVIEW'],IN_REVIEW:['CHANGES_REQUESTED','APPROVED'],APPROVED:['PUBLISHED'],PUBLISHED:['ARCHIVED']};
function checkPayload(kind:string,p:z.infer<typeof contentPayload>,isDemo:boolean){
 if(!isDemo&&!p.sourceUrl&&!p.sourceNote)throw new ApiError(400,'SOURCE_REQUIRED','Укажите происхождение материала.');
 if(new Set(p.exhibitIds).size!==p.exhibitIds.length)throw new ApiError(400,'DUPLICATE_EXHIBIT','Экспонат указан повторно.');
 if(kind==='BRANCH_PROFILE'&&(!p.address||!p.phone||!p.email||!p.hours||p.latitude===undefined||p.longitude===undefined))throw new ApiError(400,'BRANCH_FIELDS_REQUIRED','Заполните контакты, график и координаты филиала.');
}
function scopeWhere(branches:string[]|null){return branches===null?{}:{branchId:{in:branches}};}
async function authorizedItem(request:Request,id:string,permission:string){
 idSchema.parse(id);const item=await db.contentItem.findUnique({where:{id}});if(!item||item.kind==='ARCHIVE_DOCUMENT')throw new ApiError(404,'NOT_FOUND','Материал не найден.');
 const c=await staffContext(request,permission,item.branchId);return {item,c};
}
export async function adminContent(request:Request,id?:string){
 if(request.method==='GET'){
  const c=await staffContext(request);const branches=c.branches('content.read');if(branches!==null&&!branches.length)throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
  const p=pageSchema.extend({kind:kindSchema.optional(),branchId:idSchema.optional()}).strict().parse(queryParams(request));
  if(p.branchId&&!allows(c.grants,'content.read',p.branchId))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
  const where={...scopeWhere(branches),...(id?{id:idSchema.parse(id)}:{}),...(p.branchId?{branchId:p.branchId}:{}),kind:p.kind??{not:'ARCHIVE_DOCUMENT' as const}};
  const[items,total]=await db.$transaction([db.contentItem.findMany({where,include:{revisions:{orderBy:[{locale:'asc'},{version:'desc'}]}},orderBy:{id:'asc'},take:p.pageSize,skip:(p.page-1)*p.pageSize}),db.contentItem.count({where})]);return json({items,total,...p});
 }
 const p=z.object({slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),kind:kindSchema,branchId:idSchema.nullable().default(null),isDemo:z.boolean().default(true),locale:localeSchema,payload:contentPayload}).strict().parse(await readJson(request));
 const c=await staffContext(request,p.kind==='SETTING'?'settings.manage':'content.write',p.branchId);
 if(p.kind==='SETTING'&&p.branchId)throw new ApiError(400,'GLOBAL_SETTING','Настройки сайта имеют глобальную область.');
 if(p.kind==='BRANCH_PROFILE'&&!p.branchId)throw new ApiError(400,'BRANCH_REQUIRED','Укажите филиал.');
 checkPayload(p.kind,p.payload,p.isDemo);await rateLimit(`cms-write:${c.user.id}`,60,60);
 const item=await db.$transaction(async tx=>{const item=await tx.contentItem.create({data:{slug:p.slug,kind:p.kind,branchId:p.branchId,isDemo:p.isDemo,revisions:{create:{locale:p.locale,version:1,payload:p.payload,authorId:c.user.id}}},include:{revisions:true}});await audit(tx,c.user.id,'CONTENT_CREATED',item.id);return item;});return json({item},201);
}
export async function newRevision(request:Request,itemId:string){
 const {item,c}=await authorizedItem(request,itemId,'content.write');
 if(item.kind==='SETTING'&&!allows(c.grants,'settings.manage',null))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
 const p=z.object({locale:localeSchema,payload:contentPayload}).strict().parse(await readJson(request));checkPayload(item.kind,p.payload,item.isDemo);
 await rateLimit(`cms-write:${c.user.id}`,60,60);
 const revision=await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id=${itemId} FOR UPDATE`;
  const latest=await tx.contentRevision.findFirst({where:{itemId,locale:p.locale},orderBy:{version:'desc'}});
  if(latest&&['DRAFT','CHANGES_REQUESTED','IN_REVIEW','APPROVED'].includes(latest.status))throw new ApiError(409,'DRAFT_EXISTS','Сначала завершите текущую редакцию.');
  const revision=await tx.contentRevision.create({data:{itemId,locale:p.locale,version:(latest?.version??0)+1,payload:p.payload,authorId:c.user.id}});await audit(tx,c.user.id,'REVISION_CREATED',revision.id);return revision;
 });return json({item:revision},201);
}
export async function editRevision(request:Request,id:string){
 idSchema.parse(id);const revision=await db.contentRevision.findUnique({where:{id},include:{item:true}});if(!revision)throw new ApiError(404,'NOT_FOUND','Редакция не найдена.');
 const catalog=revision.item.kind==='ARCHIVE_DOCUMENT';
 const c=await staffContext(request,catalog?'catalog.write':'content.write',revision.item.branchId);
 if(revision.item.kind==='SETTING'&&!allows(c.grants,'settings.manage',null))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
 const body=z.object({expectedUpdatedAt:z.iso.datetime(),payload:z.unknown()}).strict().parse(await readJson(request));
 const p={expectedUpdatedAt:body.expectedUpdatedAt,payload:catalog?parseDocumentPayload(revision.locale,body.payload):contentPayload.parse(body.payload)};
 if(!catalog)checkPayload(revision.item.kind,contentPayload.parse(p.payload),revision.item.isDemo);
 await rateLimit(`cms-write:${c.user.id}`,60,60);
 const item=await db.$transaction(async tx=>{
  if(catalog)await catalogLock(tx);
  await tx.$queryRaw`SELECT id FROM "ContentRevision" WHERE id=${id} FOR UPDATE`;
  const current=await tx.contentRevision.findUniqueOrThrow({where:{id}});
  if(current.updatedAt.toISOString()!==p.expectedUpdatedAt||!['DRAFT','CHANGES_REQUESTED'].includes(current.status))throw new ApiError(409,'STALE_REVISION','Редакция изменилась или недоступна для правки.');
  const document=catalog?await validateDocumentRevision(tx,revision.itemId,revision.locale,p.payload):null;
  const updated=await tx.contentRevision.update({where:{id},data:{...(document?{catalogBaseVersion:document.catalogVersion}:{}),payload:p.payload,authorId:c.user.id,reviewerId:null,updatedAt:new Date(Math.max(Date.now(),current.updatedAt.getTime()+1))}});await audit(tx,c.user.id,'REVISION_UPDATED',id);return updated;
 });return json({item});
}
async function publicationLinks(tx:Prisma.TransactionClient,revision:{itemId:string;locale:string;payload:Prisma.JsonValue}){
 const p=contentPayload.parse(revision.payload);
 if(p.documentIds.length!==await tx.document.count({where:{id:{in:p.documentIds},isPublic:true}}))throw new ApiError(409,'UNAVAILABLE_SOURCE','Связанный документ недоступен.');
 if(p.fileIds.length!==await tx.archiveFile.count({where:{id:{in:p.fileIds},isPublic:true,document:{isPublic:true,allowDigitalCopy:true}}}))throw new ApiError(409,'UNAVAILABLE_FILE','Связанный файл недоступен.');
 for(const id of [...p.contentIds,...p.exhibitIds]){
  if(id===revision.itemId)throw new ApiError(400,'SELF_REFERENCE','Материал не может ссылаться на себя.');
  const r=await tx.contentRevision.findFirst({where:{itemId:id,locale:revision.locale,status:'PUBLISHED'},include:{item:true}});
  const visibleBranch=r?.item.kind!=='BRANCH_PROFILE'||!!r.item.branchId&&!!(await tx.archiveBranch.findUnique({where:{id:r.item.branchId}}))?.isPublic;
  if(!r||r.item.kind==='ARCHIVE_DOCUMENT'||!visibleBranch||p.exhibitIds.includes(id)&&r.item.kind!=='EXHIBIT')throw new ApiError(409,'UNAVAILABLE_SOURCE','Связанный материал недоступен.');
 }
}
export async function transitionRevision(request:Request,id:string){
 idSchema.parse(id);const current=await db.contentRevision.findUnique({where:{id},include:{item:true}});if(!current)throw new ApiError(404,'NOT_FOUND','Редакция не найдена.');
 const p=z.object({status:z.enum(['IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','ARCHIVED']),expectedUpdatedAt:z.iso.datetime(),reason:z.string().trim().min(3).max(500)}).strict().parse(await readJson(request,4096));
 const catalog=current.item.kind==='ARCHIVE_DOCUMENT';
 const permission=p.status==='IN_REVIEW'?(catalog?'catalog.write':'content.write'):['APPROVED','CHANGES_REQUESTED'].includes(p.status)?'content.review':'content.publish';
 const c=await staffContext(request,permission,current.item.branchId);
 if(catalog&&permission!=='catalog.write')await staffContext(request,'catalog.read',current.item.branchId);
 if(current.item.kind==='SETTING'&&!allows(c.grants,'settings.manage',null))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
 await rateLimit(`cms-transition:${c.user.id}`,60,60);
 const item=await db.$transaction(async tx=>{
  if(catalog)await catalogLock(tx);
  await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id=${current.itemId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ContentRevision" WHERE id=${id} FOR UPDATE`;
  const r=await tx.contentRevision.findUniqueOrThrow({where:{id}});
  if(r.updatedAt.toISOString()!==p.expectedUpdatedAt)throw new ApiError(409,'STALE_REVISION','Редакция изменилась или недоступна для правки.');
  if(!transitions[r.status]?.includes(p.status))throw new ApiError(409,'INVALID_TRANSITION','Недопустимый переход публикации.');
  if(p.status==='APPROVED'&&r.authorId===c.user.id)throw new ApiError(403,'SELF_APPROVAL','Проверку должен выполнить другой сотрудник.');
  if(catalog&&p.status!=='CHANGES_REQUESTED')await applyDocumentPublication(tx,r,p.status,c.user.id);
  if(p.status==='PUBLISHED'){
   if(!r.reviewerId)throw new ApiError(409,'REVIEW_REQUIRED','Сначала необходима проверка редакции.');
   if(!catalog)await publicationLinks(tx,r);
   const previous=await tx.contentRevision.findMany({where:{itemId:r.itemId,locale:r.locale,status:'PUBLISHED'},select:{id:true}});
   await tx.contentRevision.updateMany({where:{id:{in:previous.map(v=>v.id)}},data:{status:'ARCHIVED',updatedAt:new Date()}});
   for(const version of previous){
    await tx.publicationEvent.create({data:{revisionId:version.id,actorId:c.user.id,fromStatus:'PUBLISHED',toStatus:'ARCHIVED',reason:'Заменена следующей утверждённой редакцией.'}});
    await audit(tx,c.user.id,'REVISION_ARCHIVED',version.id);
   }
  }
  const updated=await tx.contentRevision.update({where:{id},data:{status:p.status,...(p.status==='APPROVED'?{reviewerId:c.user.id}:{}),updatedAt:new Date(Math.max(Date.now(),r.updatedAt.getTime()+1))}});
  const recipients=new Set([r.authorId]);
  if(p.status==='IN_REVIEW'){
   const reviewers=await tx.staffAssignment.findMany({where:{user:{isActive:true},role:{permissions:{some:{permission:'content.review'}}},OR:[{branchId:null},{branchId:current.item.branchId}]},select:{userId:true}});reviewers.forEach(r=>recipients.add(r.userId));
  }
  await tx.editorialNotice.createMany({data:[...recipients].filter(userId=>userId!==c.user.id).map(userId=>({userId,revisionId:id,event:p.status}))});
  // Reasons go in a private revision event, never in the public payload or content-body logs.
  await audit(tx,c.user.id,`REVISION_${p.status}`,id);
  await tx.publicationEvent.create({data:{revisionId:id,actorId:c.user.id,fromStatus:r.status,toStatus:p.status,reason:p.reason}});
  return updated;
 });return json({item});
}
export async function editorialNotices(request:Request){
 const c=await staffContext(request);const p=pageSchema.strict().parse(queryParams(request));
 const branches=c.branches('content.read');
 const catalogBranches=c.branches('catalog.read');
 const where={userId:c.user.id,revision:{item:{OR:[{kind:{not:'ARCHIVE_DOCUMENT' as const},...scopeWhere(branches)},{kind:'ARCHIVE_DOCUMENT' as const,...scopeWhere(catalogBranches)}]}}};
 const[items,total]=await db.$transaction([db.editorialNotice.findMany({where,orderBy:{createdAt:'desc'},skip:(p.page-1)*p.pageSize,take:p.pageSize}),db.editorialNotice.count({where})]);return json({items,total,...p});
}
export async function revisionEvents(request:Request,id:string){
 const revision=await db.contentRevision.findUnique({where:{id:idSchema.parse(id)},include:{item:true}});if(!revision)throw new ApiError(404,'NOT_FOUND','Редакция не найдена.');
 await staffContext(request,revision.item.kind==='ARCHIVE_DOCUMENT'?'catalog.read':'content.read',revision.item.branchId);const p=pageSchema.strict().parse(queryParams(request));
 const where={revisionId:id};const[items,total]=await db.$transaction([db.publicationEvent.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(p.page-1)*p.pageSize,take:p.pageSize}),db.publicationEvent.count({where})]);return json({items,total,...p});
}
async function publicDTO(r:{id:string;itemId:string;locale:string;payload:Prisma.JsonValue;updatedAt:Date;item:{slug:string;kind:string;isDemo:boolean;branchId:string|null}}){
 const p=contentPayload.parse(r.payload);
 // Source withdrawal also applies to embedded references; IDs are never expanded from a private record.
 const docs=await db.document.findMany({where:{id:{in:p.documentIds},isPublic:true},select:{id:true}});
 const files=await db.archiveFile.findMany({where:{id:{in:p.fileIds},isPublic:true,document:{isPublic:true,allowDigitalCopy:true}},select:{id:true}});
 const linked=await db.contentRevision.findMany({where:{itemId:{in:[...p.contentIds,...p.exhibitIds]},locale:r.locale,status:'PUBLISHED',item:{kind:{not:'ARCHIVE_DOCUMENT'},OR:[{kind:{not:'BRANCH_PROFILE'}},{branch:{isPublic:true}}]}},select:{itemId:true}});const ids=new Set(linked.map(x=>x.itemId));
 const docIds=new Set(docs.map(d=>d.id));const fileIds=new Set(files.map(f=>f.id));
 const published=await db.contentRevision.findMany({where:{itemId:r.itemId,status:'PUBLISHED'},select:{locale:true},orderBy:{locale:'asc'}});
 return {id:r.itemId,slug:r.item.slug,kind:r.item.kind,branchId:r.item.branchId,isDemo:r.item.isDemo,locale:r.locale,availableLocales:published.map(v=>v.locale),updatedAt:r.updatedAt,payload:{...p,documentIds:p.documentIds.filter(id=>docIds.has(id)),fileIds:p.fileIds.filter(id=>fileIds.has(id)),contentIds:p.contentIds.filter(id=>ids.has(id)),exhibitIds:p.exhibitIds.filter(id=>ids.has(id))}};
}
export async function publicContent(request:Request,slug?:string){
 const p=pageSchema.extend({locale:localeSchema.default('ru'),kind:kindSchema.optional(),branchId:idSchema.optional(),q:z.string().trim().max(100).default('')}).strict().parse(queryParams(request));
 const where:Prisma.ContentRevisionWhereInput={status:'PUBLISHED',locale:p.locale,item:{...(slug?{slug}:{}),kind:p.kind??{not:'ARCHIVE_DOCUMENT'},...(p.branchId?{branchId:p.branchId}:{}),OR:[{kind:{not:'BRANCH_PROFILE'}},{branch:{isPublic:true}}]},...(p.q?{payload:{path:['title'],string_contains:p.q}}:{})};
 const[rows,total]=await db.$transaction([db.contentRevision.findMany({where,include:{item:true},orderBy:[{updatedAt:'desc'},{id:'asc'}],skip:(p.page-1)*p.pageSize,take:p.pageSize}),db.contentRevision.count({where})],{isolationLevel:'RepeatableRead'});
 const items=await Promise.all(rows.map(publicDTO));if(slug){if(!items.length)throw new ApiError(404,'NOT_FOUND','Публикация не найдена.');return json({item:items[0]});}return json({items,total,page:p.page,pageSize:p.pageSize,locale:p.locale});
}
