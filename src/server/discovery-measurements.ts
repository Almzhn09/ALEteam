import {z} from 'zod';
import {db} from './db';
import {staffContext,audit} from './staff';
import {allows} from './staff-policy';
import {ApiError,idSchema,json,queryParams,readJson,rateLimit} from './http';
import {resolveMaterial} from './discovery-materials';
import {materialKey,localeSchema} from './discovery-utils';
const period=z.object({periodFrom:z.iso.datetime(),periodTo:z.iso.datetime(),sourceNote:z.string().trim().min(3).max(1000)});
export async function measurements(request:Request){
 const c=await staffContext(request);
 if(request.method==='GET'){
  const p=z.object({branchId:idSchema.optional()}).strict().parse(queryParams(request));
  if(p.branchId&&!allows(c.grants,'analytics.read',p.branchId))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
  const branches=c.branches('analytics.read');if(branches!==null&&!branches.length)throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
  if(process.env.DISCOVERY_AGGREGATES_ENABLED!=='1')return json({status:'unavailable',items:[],collectionEnabled:false});
  const rows=await db.siteMeasurement.findMany({where:{...(branches===null?{}:{branchId:{in:branches}}),...(p.branchId?{branchId:p.branchId}:{})},orderBy:[{periodTo:'desc'},{id:'asc'}],take:100});
  return json({status:rows.length?'measured':'unavailable',collectionEnabled:false,minimumGroup:5,items:rows.map(r=>({id:r.id,metric:r.metric,branchId:r.branchId,periodFrom:r.periodFrom,periodTo:r.periodTo,count:r.count>0&&r.count<5?null:r.count,suppressed:r.count>0&&r.count<5}))});
 }
 await staffContext(request,'settings.manage',null);await rateLimit('measurement-import:'+c.user.id,20,60);
 if(process.env.DISCOVERY_AGGREGATES_ENABLED!=='1')throw new ApiError(503,'AGGREGATES_NOT_CONFIGURED','Сервис временно недоступен.');
 if(request.method==='DELETE'){const p=period.extend({approved:z.literal(true)}).strict().parse(await readJson(request,4096));const result=await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032107)`;const scope={periodFrom:new Date(p.periodFrom),periodTo:new Date(p.periodTo)};const site=await tx.siteMeasurement.deleteMany({where:scope}),materials=await tx.discoveryAggregate.deleteMany({where:scope});await audit(tx,c.user.id,'AGGREGATES_WITHDRAWN',p.periodFrom+'/'+p.periodTo);return {site:site.count,materials:materials.count};});return json({...result,collectionEnabled:false});}
 const p=period.extend({approved:z.literal(true),site:z.array(z.object({metric:z.enum(['views','errors']),branchId:idSchema.nullable().default(null),count:z.number().int().min(0).max(2147483647)}).strict()).max(100).default([]),materials:z.array(materialKey.extend({locale:localeSchema,count:z.number().int().min(0).max(2147483647)}).strict()).max(100).default([])}).strict().refine(p=>p.periodFrom<p.periodTo&&new Date(p.periodTo).getTime()<=Date.now()).parse(await readJson(request,65536));
 for(const row of p.materials)if(!await resolveMaterial({kind:row.kind,id:row.id},row.locale,false))throw new ApiError(404,'NOT_FOUND','Материал не найден.');
 const count=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032107)`;
  const from=new Date(p.periodFrom),to=new Date(p.periodTo);
  for(const row of p.site){await tx.siteMeasurement.deleteMany({where:{metric:row.metric,branchId:row.branchId,periodFrom:from,periodTo:to}});await tx.siteMeasurement.create({data:{...row,periodFrom:from,periodTo:to,sourceNote:p.sourceNote,approvedBy:c.user.id}});}
  for(const row of p.materials)await tx.discoveryAggregate.upsert({where:{kind_materialId_locale_periodFrom_periodTo:{kind:row.kind,materialId:row.id,locale:row.locale,periodFrom:from,periodTo:to}},create:{kind:row.kind,materialId:row.id,locale:row.locale,count:row.count,periodFrom:from,periodTo:to,sourceNote:p.sourceNote,approvedBy:c.user.id},update:{count:row.count,sourceNote:p.sourceNote,approvedBy:c.user.id}});
  await audit(tx,c.user.id,'AGGREGATES_IMPORTED',from.toISOString()+'/'+to.toISOString());return p.site.length+p.materials.length;
 });return json({count,collectionEnabled:false});
}
