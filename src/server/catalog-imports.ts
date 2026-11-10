import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Prisma, CatalogImport} from '../generated/prisma/index.js';
import {db} from './db';
import {ApiError, idSchema, json, pageSchema, queryParams, readJson, rateLimit} from './http';
import {staffContext, audit} from './staff';
import {allows} from './staff-policy';
import {catalogLock} from './archive-publication';
import {catalogImportSchema, importManifestDigest, type CatalogImportManifest} from './catalog-import-schema';
import {validateCatalogImport} from './catalog-import-plan';
import {documentMetadataSchema} from './archive-schema';

interface CreatedDocument {id: string; updatedAt: string; revisions: {id: string; updatedAt: string}[]}
function dto(row: CatalogImport, includeManifest = false) {
  return {id: row.id, branchId: row.branchId, sourceNamespace: row.sourceNamespace, authorId: row.authorId,
    digest: row.digest, state: row.state, report: row.report, createdDocuments: row.createdDocuments,
    createdAt: row.createdAt, updatedAt: row.updatedAt, ...(includeManifest ? {manifest: row.manifest} : {})};
}
const stamp = (row: {updatedAt: Date}) => new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
function stale() {throw new ApiError(409, 'STALE_IMPORT', 'Импорт изменился. Обновите данные и повторите проверку.');}
async function contextFor(request: Request, branchId: string, write = false) {
  const context = await staffContext(request, 'catalog.read', branchId);
  if (write && !allows(context.grants, 'catalog.write', branchId)) throw new ApiError(403, 'FORBIDDEN', 'Недостаточно прав сотрудника.');
  return context;
}
async function authorized(request: Request, id: string, write = false) {
  const batch = await db.catalogImport.findUnique({where: {id: idSchema.parse(id)}});
  if (!batch) throw new ApiError(404, 'NOT_FOUND', 'Импорт не найден.');
  return {batch, context: await contextFor(request, batch.branchId, write)};
}
const control = z.object({expectedUpdatedAt: z.iso.datetime(), digest: z.string().regex(/^[a-f0-9]{64}$/u)}).strict();
export async function catalogImports(request: Request, id?: string) {
  if (request.method === 'GET') {
    if (id) {z.object({}).strict().parse(queryParams(request)); return json({item: dto((await authorized(request,id)).batch,true)});}
    const context = await staffContext(request); const branches = context.branches('catalog.read');
    if (branches !== null && !branches.length) throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
    const p = pageSchema.extend({branchId: idSchema.optional()}).strict().parse(queryParams(request));
    if (p.branchId && !allows(context.grants,'catalog.read',p.branchId)) throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
    const where = p.branchId ? {branchId: p.branchId} : branches === null ? {} : {branchId: {in: branches}};
    const [items,total] = await db.$transaction([db.catalogImport.findMany({where,orderBy:[{createdAt:'desc'},{id:'asc'}],take:p.pageSize,skip:(p.page-1)*p.pageSize}),db.catalogImport.count({where})]);
    return json({items:items.map(row=>dto(row)),total,page:p.page,pageSize:p.pageSize});
  }
  const manifest = catalogImportSchema.parse(await readJson(request, 2 * 1024 * 1024));
  const context = await contextFor(request,manifest.branchId,true);
  await rateLimit(`import-create:${context.user.id}`,10,60);
  const batch = await db.$transaction(async tx => {
    await catalogLock(tx);
    if (!await tx.archiveBranch.count({where:{id:manifest.branchId}})) throw new ApiError(404,'NOT_FOUND','Филиал не найден.');
    if (await tx.catalogImport.count({where:{authorId:context.user.id,state:{in:['READY','VALIDATION_FAILED']}}})>=20) throw new ApiError(409,'IMPORT_QUOTA','Завершите или отмените предыдущие планы импорта.');
    const plan = await validateCatalogImport(tx,manifest);
    const batch = await tx.catalogImport.create({data:{id:randomUUID(),branchId:manifest.branchId,sourceNamespace:manifest.sourceNamespace,
      authorId:context.user.id,manifest:manifest as unknown as Prisma.InputJsonObject,digest:importManifestDigest(manifest),
      state:plan.report.valid?'READY':'VALIDATION_FAILED',report:plan.report as unknown as Prisma.InputJsonObject,createdDocuments:[]}});
    await audit(tx,context.user.id,'IMPORT_STAGED',batch.id);return batch;
  },{timeout:30000,isolationLevel:'RepeatableRead'});
  return json({item:dto(batch,true)},201);
}
async function materialize(tx:Prisma.TransactionClient, manifest:CatalogImportManifest, actorId:string, batchId:string, plan:Awaited<ReturnType<typeof validateCatalogImport>>) {
  for(const row of manifest.funds)if(!plan.funds.has(row.key)) {
    const node=await tx.fund.create({data:{id:randomUUID(),branchId:manifest.branchId,number:row.number,name:row.name,description:row.description}});plan.funds.set(row.key,node.id);await audit(tx,actorId,'IMPORT_FUND_CREATED',node.id);
  }
  for(const row of manifest.inventories)if(!plan.inventories.has(row.key)) {
    const node=await tx.inventory.create({data:{id:randomUUID(),fundId:plan.funds.get(row.fundKey)!,number:row.number,title:row.title}});plan.inventories.set(row.key,node.id);await audit(tx,actorId,'IMPORT_INVENTORY_CREATED',node.id);
  }
  for(const row of manifest.cases)if(!plan.cases.has(row.key)) {
    const inventoryId=plan.inventories.get(row.inventoryKey)!;const fundKey=manifest.inventories.find(i=>i.key===row.inventoryKey)!.fundKey;
    const node=await tx.archivalCase.create({data:{id:randomUUID(),inventoryId,fundId:plan.funds.get(fundKey)!,number:row.number,title:row.title}});plan.cases.set(row.key,node.id);await audit(tx,actorId,'IMPORT_CASE_CREATED',node.id);
  }
  const created:CreatedDocument[]=[];
  for(const rowPlan of plan.report.rows) {
    if(rowPlan.action!=='CREATE')continue;
    const row=manifest.documents[rowPlan.index];const id=randomUUID();
    const payload=documentMetadataSchema.parse({...row.metadata,caseId:row.caseKey?plan.cases.get(row.caseKey):null});
    const item=await tx.contentItem.create({data:{slug:'_archive-'+id,kind:'ARCHIVE_DOCUMENT',branchId:manifest.branchId,isDemo:manifest.isDemo}});
    const document=await tx.document.create({data:{id,fundId:plan.funds.get(row.fundKey)!,...payload,allowDigitalCopy:false,isPublic:false,isDemo:manifest.isDemo,contentItemId:item.id}});
    const ru=await tx.contentRevision.create({data:{itemId:item.id,locale:'ru',version:1,status:'DRAFT',payload,authorId:actorId,catalogBaseVersion:0}});
    const revisions=[{id:ru.id,updatedAt:ru.updatedAt.toISOString()}];
    for(const [locale,translated] of Object.entries(row.translations))if(translated) {
      const revision=await tx.contentRevision.create({data:{itemId:item.id,locale,version:1,status:'DRAFT',payload:translated,authorId:actorId,catalogBaseVersion:0}});
      revisions.push({id:revision.id,updatedAt:revision.updatedAt.toISOString()});
    }
    await tx.catalogImportSource.create({data:{branchId:manifest.branchId,sourceNamespace:manifest.sourceNamespace,sourceId:row.sourceId,batchId,documentId:id,contentHash:rowPlan.contentHash}});
    created.push({id,updatedAt:document.updatedAt.toISOString(),revisions});rowPlan.documentId=id;
    await audit(tx,actorId,'DOCUMENT_DRAFT_IMPORTED',id);
  }
  return created;
}
export async function importAction(request:Request,id:string,action:string) {
  const {batch,context}=await authorized(request,id,true);
  const p=control.parse(await readJson(request,2048));
  if(p.digest!==batch.digest)stale();
  await rateLimit(`import-action:${context.user.id}`,30,60);
  const updated=await db.$transaction(async tx=>{
    await catalogLock(tx);await tx.$queryRaw`SELECT id FROM "CatalogImport" WHERE id=${id} FOR UPDATE`;
    const current=await tx.catalogImport.findUniqueOrThrow({where:{id}});
    if(action==='commit'&&current.state==='COMMITTED')return current; // Already committed: no second write set.
    if(current.updatedAt.toISOString()!==p.expectedUpdatedAt)stale();
    if(action==='rollback') {
      if(current.state!=='COMMITTED')stale();
      const created=current.createdDocuments as unknown as CreatedDocument[];
      for(const original of created) {
        const document=await tx.document.findUnique({where:{id:original.id},include:{contentItem:{include:{revisions:true}},_count:{select:{files:true,uploads:true,comments:true,favorites:true}}}});
        if(!document||document.deletedAt||document.isPublic||document.updatedAt.toISOString()!==original.updatedAt
          ||Object.values(document._count).some(n=>n>0)||document.contentItem?.revisions.length!==original.revisions.length
          ||original.revisions.some(r=>!document.contentItem!.revisions.some(v=>v.id===r.id&&v.status==='DRAFT'&&v.updatedAt.toISOString()===r.updatedAt)))throw new ApiError(409,'IMPORT_ROLLBACK_CHANGED','После импорта появились изменения. Автоматический откат запрещён.');
      }
      for(const original of created) {
        const now=new Date();await tx.document.update({where:{id:original.id},data:{deletedAt:now,isPublic:false,allowDigitalCopy:false,catalogVersion:{increment:1}}});
        await tx.contentRevision.updateMany({where:{id:{in:original.revisions.map(r=>r.id)}},data:{status:'ARCHIVED',updatedAt:now}});
        for(const revision of original.revisions)await tx.publicationEvent.create({data:{revisionId:revision.id,actorId:context.user.id,fromStatus:'DRAFT',toStatus:'ARCHIVED',reason:'Мягкий откат неизменённого пакета импорта; история сохранена.'}});
        await audit(tx,context.user.id,'IMPORT_DOCUMENT_ROLLED_BACK',original.id);
      }
      await audit(tx,context.user.id,'IMPORT_ROLLED_BACK',id);
      return tx.catalogImport.update({where:{id},data:{state:'ROLLED_BACK',updatedAt:stamp(current)}});
    }
    if(!['READY','VALIDATION_FAILED'].includes(current.state))stale();
    if(action==='cancel') {await audit(tx,context.user.id,'IMPORT_CANCELLED',id);return tx.catalogImport.update({where:{id},data:{state:'CANCELLED',updatedAt:stamp(current)}});}
    const manifest=catalogImportSchema.parse(current.manifest);const plan=await validateCatalogImport(tx,manifest);
    if(action==='validate') {
      await audit(tx,context.user.id,'IMPORT_REVALIDATED',id);return tx.catalogImport.update({where:{id},data:{state:plan.report.valid?'READY':'VALIDATION_FAILED',report:plan.report as unknown as Prisma.InputJsonObject,updatedAt:stamp(current)}});
    }
    if(action!=='commit'||!plan.report.valid)throw new ApiError(409,'IMPORT_CONFLICT','План импорта содержит конфликты. Повторите проверку.');
    const created=await materialize(tx,manifest,context.user.id,id,plan);
    await audit(tx,context.user.id,'IMPORT_COMMITTED',id);
    return tx.catalogImport.update({where:{id},data:{state:'COMMITTED',report:plan.report as unknown as Prisma.InputJsonObject,createdDocuments:created as unknown as Prisma.InputJsonArray,updatedAt:stamp(current)}});
  },{timeout:30000});
  return json({item:dto(updated,true)});
}
export async function exportImport(request:Request,id:string) {
  z.object({}).strict().parse(queryParams(request));
  await authorized(request,id);
  const result=await db.$transaction(async tx=>{
    const batch=await tx.catalogImport.findUniqueOrThrow({where:{id}});
    const manifest=catalogImportSchema.parse(batch.manifest);
    const materialized=await tx.catalogImportSource.findMany({
      where:{branchId:batch.branchId,sourceNamespace:batch.sourceNamespace,sourceId:{in:manifest.documents.map(d=>d.sourceId)}},
      select:{sourceId:true,document:{select:{
        id:true,isPublic:true,deletedAt:true,fund:{select:{number:true}},
        archivalCase:{select:{number:true,inventory:{select:{number:true}}}},
        contentItem:{select:{revisions:{select:{locale:true,version:true,status:true,payload:true},orderBy:[{locale:'asc'},{version:'desc'}]}}},
      }}},orderBy:{sourceId:'asc'},
    });
    const verified=await validateCatalogImport(tx,manifest);
    return {version:1,kind:'metadata-import-audit-export',batchId:batch.id,state:batch.state,digest:batch.digest,
      sourceManifest:manifest,currentValidation:verified.report,materialized,includesFileBytes:false,includesPrivateNotes:false};
  },{isolationLevel:'RepeatableRead',timeout:30000});
  return json(result);
}
