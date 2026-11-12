import {Prisma} from '../generated/prisma/index.js';
import {ApiError} from './http';
export async function createCmsDraft(tx:Prisma.TransactionClient, input:{slug:string;kind:Prisma.ContentItemCreateInput['kind'];branchId:string|null;isDemo:boolean;locale:string;payload:Prisma.InputJsonValue}, authorId:string){
 return tx.contentItem.create({data:{slug:input.slug,kind:input.kind,branchId:input.branchId,isDemo:input.isDemo,revisions:{create:{locale:input.locale,version:1,payload:input.payload,authorId}}},include:{revisions:true}});
}
export async function appendCmsDraft(tx:Prisma.TransactionClient,itemId:string,locale:string,payload:Prisma.InputJsonValue,authorId:string){
 await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id=${itemId} FOR UPDATE`;
 const latest=await tx.contentRevision.findFirst({where:{itemId,locale},orderBy:{version:'desc'}});
 if(latest&&['DRAFT','CHANGES_REQUESTED','IN_REVIEW','APPROVED'].includes(latest.status))throw new ApiError(409,'DRAFT_EXISTS','Сначала завершите текущую редакцию.');
 return tx.contentRevision.create({data:{itemId,locale,version:(latest?.version??0)+1,payload,authorId}});
}
