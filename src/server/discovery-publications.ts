import type {Prisma} from '../generated/prisma/index.js';
// Publication and subscription baselines share this short transaction lock; never scan or run engines here.
export async function publicationLock(tx:Prisma.TransactionClient){await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032106)`;}
export async function recordMaterialPublication(tx:Prisma.TransactionClient,kind:'document'|'cms',materialId:string,locale:string,revision:string){
 await publicationLock(tx);
 await tx.materialPublication.upsert({where:{kind_materialId_locale_revision:{kind,materialId,locale,revision}},create:{kind,materialId,locale,revision},update:{}});
}
