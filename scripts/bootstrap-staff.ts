import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { db } from '../src/server/db';
const p=z.object({email:z.email(),name:z.string().trim().min(1).max(120),password:z.string().min(12).max(128)}).parse({email:process.env.STAFF_ADMIN_EMAIL,name:process.env.STAFF_ADMIN_NAME,password:process.env.STAFF_ADMIN_PASSWORD});
try{
 const password=await hashPassword(p.password);
 const id=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032101)`;
  const admin=await tx.staffAssignment.count({where:{branchId:null,user:{isActive:true},role:{permissions:{some:{permission:'staff.roles.manage'}}}}});
  if(admin)throw new Error('BOOTSTRAP_ALREADY_COMPLETE: use the authenticated staff API');
  if(await tx.user.findUnique({where:{email:p.email.toLowerCase()}}))throw new Error('BOOTSTRAP_EXISTING_USER: no automatic elevation of an existing account');
  const id=randomUUID();await tx.user.create({data:{id,email:p.email.toLowerCase(),name:p.name,emailVerified:true,accounts:{create:{id:randomUUID(),providerId:'credential',accountId:id,password}}}});
  await tx.staffAssignment.create({data:{userId:id,roleId:'SUPERADMIN',scopeKey:'*'}});
  await tx.auditEvent.create({data:{actorId:id,action:'ADMIN_BOOTSTRAP',entityId:id}});return id;
 });console.log(`Initial staff administrator created: ${id}. Credentials were not printed.`);
}finally{await db.$disconnect();}
