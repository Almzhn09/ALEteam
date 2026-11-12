import { z } from 'zod';
import { db } from './db';
import { ApiError,idSchema,json,pageSchema,queryParams,readJson,rateLimit } from './http';
import { staffContext,audit } from './staff';
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
export { archiveRecords, restoreDocument } from './archive-records';
