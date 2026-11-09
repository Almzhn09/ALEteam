import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { db } from './db';
import { Prisma } from '../generated/prisma/index.js';
import { ApiError, idSchema, json, pageSchema, queryParams, readJson, requireUser, rateLimit } from './http';
import { allows, permissions, scopedBranches, type Grant } from './staff-policy';
export async function staffContext(request: Request, permission?: string, branchId?: string | null) {
 const user=await requireUser(request);
 const assignments=await db.staffAssignment.findMany({where:{userId:user.id},include:{role:{include:{permissions:true}}}});
 const grants:Grant[]=assignments.flatMap(a=>a.role.permissions.map(p=>({permission:p.permission,branchId:a.branchId})));
 if(!grants.length||permission&&!allows(grants,permission,branchId))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
 return {user,grants,assignments,branches:(p:string)=>scopedBranches(grants,p)};
}
export async function audit(tx:Prisma.TransactionClient,actorId:string,action:string,entityId:string){
 await tx.auditEvent.create({data:{actorId,action,entityId}});
}
export async function keepAdministrator(tx:Prisma.TransactionClient){
 const count=await tx.staffAssignment.count({where:{branchId:null,user:{isActive:true},role:{permissions:{some:{permission:'staff.roles.manage'}}}}});
 if(!count)throw new ApiError(409,'LAST_ADMIN','Нельзя отключить последнего администратора прав.');
}
export async function staffMe(request:Request){const c=await staffContext(request);return json({item:{id:c.user.id,name:c.user.name,grants:c.grants}});}
export async function staffRoles(request:Request){
 const c=await staffContext(request,'staff.roles.manage',null);
 if(request.method==='GET')return json({items:await db.staffRole.findMany({include:{permissions:true},orderBy:{id:'asc'}}),permissions});
 const p=z.object({id:idSchema,name:z.string().trim().min(1).max(120),permissions:z.array(z.string().refine(v=>permissions.includes(v))).min(1).max(permissions.length)}).strict().parse(await readJson(request));
 await rateLimit(`staff-roles:${c.user.id}`,30,60);
 const item=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032101)`;
  const role=await tx.staffRole.upsert({where:{id:p.id},create:{id:p.id,name:p.name},update:{name:p.name}});
  await tx.staffPermission.deleteMany({where:{roleId:p.id}});
  await tx.staffPermission.createMany({data:[...new Set(p.permissions)].map(permission=>({roleId:p.id,permission}))});
  await keepAdministrator(tx);await audit(tx,c.user.id,'ROLE_UPDATED',p.id);return role;
 });return json({item});
}
const userSelect={id:true,name:true,email:true,role:true,isActive:true,createdAt:true} as const;
export async function staffUsers(request:Request,id?:string){
 const c=await staffContext(request,'staff.users.manage',null);
 if(request.method==='GET'){
  const p=pageSchema.strict().parse(queryParams(request));const[items,total]=await db.$transaction([db.user.findMany({select:userSelect,orderBy:{id:'asc'},take:p.pageSize,skip:(p.page-1)*p.pageSize}),db.user.count()]);return json({items,total,...p});
 }
 await rateLimit(`staff-users:${c.user.id}`,30,60);
 if(request.method==='POST'){
  const p=z.object({email:z.email().max(200),name:z.string().trim().min(1).max(120),password:z.string().min(12).max(128)}).strict().parse(await readJson(request,4096));
  const password=await hashPassword(p.password);const userId=randomUUID();
  const item=await db.$transaction(async tx=>{const item=await tx.user.create({data:{id:userId,name:p.name,email:p.email.toLowerCase(),emailVerified:true,accounts:{create:{id:randomUUID(),providerId:'credential',accountId:userId,password}}},select:userSelect});await audit(tx,c.user.id,'USER_CREATED',userId);return item;});return json({item},201);
 }
 idSchema.parse(id);
 const p=z.object({isActive:z.boolean()}).strict().parse(await readJson(request,1024));
 const item=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032101)`;
  const item=await tx.user.update({where:{id},data:p,select:userSelect});await keepAdministrator(tx);
  if(!p.isActive)await tx.session.deleteMany({where:{userId:id}});
  await audit(tx,c.user.id,p.isActive?'USER_ENABLED':'USER_DISABLED',id!);return item;
 });return json({item});
}
export async function assignments(request:Request){
 const c=await staffContext(request,'staff.roles.manage',null);
 const p=z.object({userId:idSchema,roleId:idSchema,branchId:idSchema.nullable().default(null)}).strict().parse(await readJson(request,4096));
 await rateLimit(`staff-grants:${c.user.id}`,30,60);
 const result=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032101)`;
  if(request.method==='DELETE')await tx.staffAssignment.deleteMany({where:p});
  else{
   if(p.roleId==='BRANCH_ADMIN'&&!p.branchId)throw new ApiError(400,'BRANCH_REQUIRED','Укажите филиал для администратора филиала.');
   const role=await tx.staffRole.findUnique({where:{id:p.roleId},include:{permissions:true}});
   if(!role)throw new ApiError(404,'NOT_FOUND','Роль не найдена.');
   if(p.branchId&&role.permissions.some(g=>g.permission.startsWith('staff.')||g.permission==='settings.manage'||g.permission==='audit.read'))throw new ApiError(400,'GLOBAL_PERMISSION','Глобальное право нельзя выдать в области филиала.');
   await tx.staffAssignment.upsert({where:{userId_roleId_scopeKey:{userId:p.userId,roleId:p.roleId,scopeKey:p.branchId??'*'}},create:{...p,scopeKey:p.branchId??'*'},update:{}});
  }
  await keepAdministrator(tx);await audit(tx,c.user.id,request.method==='DELETE'?'GRANT_REVOKED':'GRANT_CREATED',p.userId);return {ok:true};
 });return json(result);
}
export async function auditList(request:Request){
 await staffContext(request,'audit.read',null);const p=pageSchema.strict().parse(queryParams(request));
 const[items,total]=await db.$transaction([db.auditEvent.findMany({orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(p.page-1)*p.pageSize,take:p.pageSize}),db.auditEvent.count()]);return json({items,total,...p});
}
