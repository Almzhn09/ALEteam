import { z } from 'zod';
import { db } from './db';
import { ApiError,idSchema,json,pageSchema,queryParams,readJson,rateLimit } from './http';
import { staffContext,audit } from './staff';
import { allows } from './staff-policy';
export async function adminBranches(request:Request,id?:string){
 if(request.method==='GET'){
  const c=await staffContext(request);const branches=c.branches('branches.manage');const read=c.branches('catalog.read');const content=c.branches('content.read');
  const ids=branches===null||read===null||content===null?null:[...new Set([...branches,...read,...content])];
  const p=pageSchema.strict().parse(queryParams(request));const where=ids===null?{}:{id:{in:ids}};
  const[items,total]=await db.$transaction([db.archiveBranch.findMany({where,orderBy:{code:'asc'},take:p.pageSize,skip:(p.page-1)*p.pageSize}),db.archiveBranch.count({where})]);return json({items,total,...p});
 }
 const p=z.object({code:z.string().trim().min(1).max(80),name:z.string().trim().min(1).max(200),isDemo:z.boolean().default(true),isPublic:z.boolean().default(false),expectedUpdatedAt:z.iso.datetime().optional()}).strict().parse(await readJson(request,4096));
 const c=await staffContext(request,'branches.manage',id??null);if(id)idSchema.parse(id);
 await rateLimit(`branches:${c.user.id}`,30,60);
 const item=await db.$transaction(async tx=>{
  if(!id){const item=await tx.archiveBranch.create({data:{id:crypto.randomUUID(),code:p.code,name:p.name,isDemo:p.isDemo,isPublic:false}});await audit(tx,c.user.id,'BRANCH_CREATED',item.id);return item;}
  await tx.$queryRaw`SELECT id FROM "ArchiveBranch" WHERE id=${id} FOR UPDATE`;
  const current=await tx.archiveBranch.findUnique({where:{id}});if(!current)throw new ApiError(404,'NOT_FOUND','Филиал не найден.');
  if(current.updatedAt.toISOString()!==p.expectedUpdatedAt)throw new ApiError(409,'STALE_BRANCH','Филиал изменился.');
  const item=await tx.archiveBranch.update({where:{id},data:{code:p.code,name:p.name,isDemo:p.isDemo,isPublic:p.isPublic,updatedAt:new Date(Math.max(Date.now(),current.updatedAt.getTime()+1))}});await audit(tx,c.user.id,'BRANCH_UPDATED',id);return item;
 });return json({item},id?200:201);
}
export async function archiveRecords(request:Request,kind:string){
 if(request.method==='GET'){
  const c=await staffContext(request);const branches=c.branches('catalog.read');if(branches!==null&&!branches.length)throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
  const p=pageSchema.extend({fundId:idSchema.optional()}).strict().parse(queryParams(request));
  const fundWhere={...(branches===null?{}:{branchId:{in:branches}}),...(p.fundId?{id:p.fundId}:{})};
  const base={take:p.pageSize,skip:(p.page-1)*p.pageSize,orderBy:{id:'asc' as const}};
  if(kind==='funds'){const[items,total]=await db.$transaction([db.fund.findMany({...base,where:fundWhere}),db.fund.count({where:fundWhere})]);return json({items,total,...p});}
  if(kind==='inventories'){const where={fund:fundWhere};const[items,total]=await db.$transaction([db.inventory.findMany({...base,where}),db.inventory.count({where})]);return json({items,total,...p});}
  if(kind==='cases'){const where={inventory:{fund:fundWhere}};const[items,total]=await db.$transaction([db.archivalCase.findMany({...base,where}),db.archivalCase.count({where})]);return json({items,total,...p});}
  const where={fund:fundWhere};const[items,total]=await db.$transaction([db.document.findMany({...base,where}),db.document.count({where})]);return json({items,total,...p});
 }
 const raw=await readJson(request);
 if(kind==='funds'){
  const p=z.object({branchId:idSchema,number:z.string().trim().min(1).max(80),name:z.string().trim().min(1).max(200),description:z.string().trim().min(1).max(2000)}).strict().parse(raw);
  const c=await staffContext(request,'catalog.write',p.branchId);await rateLimit(`catalog-write:${c.user.id}`,60,60);
  const item=await db.$transaction(async tx=>{const item=await tx.fund.create({data:{id:crypto.randomUUID(),...p}});await audit(tx,c.user.id,'FUND_CREATED',item.id);return item;});return json({item},201);
 }
 if(kind==='inventories'||kind==='cases'){
  const p=z.object({fundId:idSchema,inventoryId:kind==='cases'?idSchema:z.never().optional(),number:z.string().trim().min(1).max(80),title:z.string().trim().min(1).max(200)}).strict().parse(raw);
  const fund=await db.fund.findUnique({where:{id:p.fundId}});if(!fund)throw new ApiError(404,'NOT_FOUND','Фонд не найден.');
  const c=await staffContext(request,'catalog.write',fund.branchId);await rateLimit(`catalog-write:${c.user.id}`,60,60);
  const item=await db.$transaction(async tx=>{const item=kind==='inventories'?await tx.inventory.create({data:{id:crypto.randomUUID(),fundId:p.fundId,number:p.number,title:p.title}}):await tx.archivalCase.create({data:{id:crypto.randomUUID(),fundId:p.fundId,inventoryId:p.inventoryId!,number:p.number,title:p.title}});await audit(tx,c.user.id,kind==='cases'?'CASE_CREATED':'INVENTORY_CREATED',item.id);return item;});return json({item},201);
 }
 const p=z.object({fundId:idSchema,caseId:idSchema.nullable().default(null),title:z.string().trim().min(1).max(200),description:z.string().trim().min(1).max(4000),reference:z.string().trim().min(1).max(120),year:z.number().int().min(1).max(2100),yearTo:z.number().int().min(1).max(2100).nullable().default(null),type:z.enum(['LETTER','PHOTO','MAP','REPORT']),rights:z.string().trim().min(1).max(1000),authorName:z.string().max(200).nullable().default(null),organization:z.string().max(200).nullable().default(null),locality:z.string().max(200).nullable().default(null),originalLanguage:z.string().max(60).nullable().default(null),leafCount:z.number().int().min(0).nullable().default(null),storageLocation:z.string().max(500).nullable().default(null),accessConditions:z.string().max(1000).nullable().default(null),internalNotes:z.string().max(2000).nullable().default(null),isDemo:z.boolean().default(true)}).strict().refine(p=>p.yearTo===null||p.yearTo>=p.year).parse(raw);
 const fund=await db.fund.findUnique({where:{id:p.fundId}});if(!fund)throw new ApiError(404,'NOT_FOUND','Фонд не найден.');
 const c=await staffContext(request,'catalog.write',fund.branchId);await rateLimit(`catalog-write:${c.user.id}`,60,60);
 const item=await db.$transaction(async tx=>{const item=await tx.document.create({data:{id:crypto.randomUUID(),...p,isPublic:false,allowDigitalCopy:false}});await audit(tx,c.user.id,'DOCUMENT_DRAFT_CREATED',item.id);return item;});return json({item},201);
}
