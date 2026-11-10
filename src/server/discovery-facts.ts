import {z} from 'zod';
import {db} from './db';
import {digest} from './discovery-utils';
import {publicBranchScope} from './public-visibility';
import {ApiError,idSchema,json,queryParams,readJson,rateLimit} from './http';
import {staffContext,audit} from './staff';
import {localeSchema,materialKey,boundedPage,decodeCursor,encodeCursor,conflict,unavailable} from './discovery-utils';
import {resolveEvidence,resolveMaterial} from './discovery-materials';
import type {ContentLocale} from '../contracts/cms';
const caption=z.object({title:z.string().trim().min(1).max(200),body:z.string().trim().max(3000).default('')}).strict();
export const labelsSchema=z.object({ru:caption.optional(),kk:caption.optional(),en:caption.optional()}).strict().refine(v=>Object.values(v).some(Boolean));
const evidence=z.array(materialKey.extend({locale:localeSchema,revision:z.string().regex(/^[a-f0-9]{64}$/),href:z.string().max(2000).optional(),title:z.string().max(200).optional(),isDemo:z.boolean().optional()}).strict().transform(({href:_,title:__,isDemo:___,...proof})=>proof)).min(1).max(20);
const period=z.object({datePrecision:z.enum(['day','month','year','range','unknown']),dateParts:z.object({year:z.number().int().min(1).max(2100),month:z.number().int().min(1).max(12).optional(),day:z.number().int().min(1).max(31).optional()}).strict().optional(),yearFrom:z.number().int().min(1).max(2100).optional(),yearTo:z.number().int().min(1).max(2100).optional()}).strict().refine(v=>{
 if(v.datePrecision==='unknown')return !v.dateParts&&v.yearFrom===undefined&&v.yearTo===undefined;
 if(v.datePrecision==='range')return !v.dateParts&&v.yearFrom!==undefined&&v.yearTo!==undefined&&v.yearFrom<=v.yearTo;
 if(!v.dateParts||v.yearFrom!==undefined||v.yearTo!==undefined)return false;
 const p=v.dateParts;
 if(v.datePrecision==='year')return p.month===undefined&&p.day===undefined;
 if(v.datePrecision==='month')return p.month!==undefined&&p.day===undefined;
 if(p.month===undefined||p.day===undefined)return false;
 return p.day<=new Date(Date.UTC(p.year,p.month,0)).getUTCDate();
});
const shapes={
 PLACE:z.object({labels:labelsSchema,coordinates:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict().nullable().default(null)}).strict(),
 TOPIC:z.object({labels:labelsSchema}).strict(),
 ALIAS:z.object({name:z.string().trim().min(1).max(160),locale:localeSchema,validFrom:z.number().int().min(1).max(2100).optional(),validTo:z.number().int().min(1).max(2100).optional()}).strict().refine(v=>v.validFrom===undefined||v.validTo===undefined||v.validFrom<=v.validTo),
 HISTORY:z.object({labels:labelsSchema,date:period,materials:z.array(materialKey).max(20).default([]),certainty:z.enum(['source_assertion','approximate'])}).strict(),
 LINK:z.object({from:materialKey,to:materialKey,reason:z.enum(['same_place','same_person','same_event','same_fund'])}).strict(),
 EDITORIAL:z.object({material:materialKey,topicId:idSchema.optional(),placeId:idSchema.optional(),order:z.number().int().min(0).max(10000).default(0)}).strict(),
};
export type FactKind=keyof typeof shapes;
export function parseFact<K extends FactKind>(kind:K,data:unknown):z.output<(typeof shapes)[K]>{return shapes[kind].parse(data) as z.output<(typeof shapes)[K]>;}
export async function liveFacts(kind:FactKind){
 const rows=await db.discoveryFact.findMany({where:{kind,status:'VERIFIED',...publicBranchScope},orderBy:{id:'asc'},take:201});
 if(rows.length>200)throw new ApiError(503,'DISCOVERY_CORPUS_LIMIT','Сервис временно недоступен.');
 const result=[];const cache=new Map<string,Awaited<ReturnType<typeof resolveEvidence>>>();
 async function evidenceFor(value:unknown){const key=digest(value);if(!cache.has(key))cache.set(key,await resolveEvidence(value));return cache.get(key);}
 for(const row of rows){if(!shapes[kind].safeParse(row.data).success)continue;const refs=await evidenceFor(row.sources);if(!refs)continue;
  if(row.parentId){const parent=await db.discoveryFact.findFirst({where:{id:row.parentId,kind:'PLACE',status:'VERIFIED',...publicBranchScope}});if(!parent||!await evidenceFor(parent.sources))continue;}
  if(kind==='EDITORIAL'){
   const data=row.data as {topicId?:string;placeId?:string};let valid=true;
   for(const [type,id] of [['TOPIC',data.topicId],['PLACE',data.placeId]])if(id){const target=await db.discoveryFact.findFirst({where:{id,kind:type,status:'VERIFIED',...publicBranchScope}});if(!target||!await evidenceFor(target.sources)){valid=false;break;}}
   if(!valid)continue;
  }
  result.push({...row,evidence:refs});
 }
 return result;
}
export function localLabel(labels:unknown,locale:ContentLocale){const value=labelsSchema.parse(labels),chosen=value[locale]?locale:value.ru?'ru':value.kk?'kk':'en';return {value:value[chosen]!,contentLocale:chosen,availableLocales:Object.keys(value).filter(k=>value[k as ContentLocale]) as ContentLocale[],translationStatus:chosen===locale?'published' as const:'original' as const};}
async function validateFact(kind:FactKind,data:unknown,parentId:string|null,client:Parameters<typeof resolveEvidence>[1]){
 const parsed=parseFact(kind,data);
 if(['ALIAS','HISTORY'].includes(kind)){
  const parent=parentId?await client!.discoveryFact.findFirst({where:{id:parentId,kind:'PLACE',status:'VERIFIED',...publicBranchScope}}):null;
  if(!parent||!await resolveEvidence(parent.sources,client))conflict('PLACE_UNAVAILABLE');
 }
 const keys=kind==='HISTORY'?(parsed as z.infer<typeof shapes.HISTORY>).materials:kind==='LINK'?[(parsed as z.infer<typeof shapes.LINK>).from,(parsed as z.infer<typeof shapes.LINK>).to]:kind==='EDITORIAL'?[(parsed as z.infer<typeof shapes.EDITORIAL>).material]:[];
 for(const key of keys)if(!await resolveMaterial(key,'ru',true,client))conflict('MATERIAL_UNAVAILABLE');
 if(kind==='EDITORIAL'){
  const d=parsed as {topicId?:string;placeId?:string};
  for(const [type,id] of [['TOPIC',d.topicId],['PLACE',d.placeId]])if(id){const target=await client!.discoveryFact.findFirst({where:{id,kind:type,status:'VERIFIED',...publicBranchScope}});if(!target||!await resolveEvidence(target.sources,client))conflict('SOURCE_CHANGED');}
 }
 if(kind==='LINK'&&JSON.stringify(keys[0])===JSON.stringify(keys[1]))throw new ApiError(400,'SELF_REFERENCE','Материал не может ссылаться на себя.');
 return parsed;
}
export async function adminFacts(request:Request,id?:string,action?:string){
 if(request.method==='GET'){
  const c=await staffContext(request);const branches=c.branches('content.read');
  const p=z.object({kind:z.enum(['PLACE','ALIAS','TOPIC','LINK','HISTORY','EDITORIAL']).optional()}).strict().parse(queryParams(request));
  return json({items:await db.discoveryFact.findMany({where:{...(branches===null?{}:{branchId:{in:branches}}),...(p.kind?{kind:p.kind}:{}),...(id?{id:idSchema.parse(id)}:{})},orderBy:{id:'asc'},take:100})});
 }
 const current=id?await db.discoveryFact.findUnique({where:{id:idSchema.parse(id)}}):null;if(id&&!current)unavailable();
 const permission=action==='verify'?'content.review':action==='withdraw'?'content.publish':'content.write';
 const c=await staffContext(request,id?permission:undefined,current?.branchId??null);
 await rateLimit('discovery-write:'+c.user.id,60,60);
 const raw=await readJson(request,65536);
 if(!id){
  const p=z.object({kind:z.enum(['PLACE','ALIAS','TOPIC','LINK','HISTORY','EDITORIAL']),branchId:idSchema.nullable().default(null),parentId:idSchema.nullable().default(null),data:z.unknown(),sources:evidence}).strict().parse(raw);
  await staffContext(request,'content.write',p.branchId);
  if(p.parentId&&!['ALIAS','HISTORY'].includes(p.kind))throw new ApiError(400,'INVALID_PARENT','Проверьте введённые данные.');
  const data=parseFact(p.kind,p.data);
  const item=await db.$transaction(async tx=>{const item=await tx.discoveryFact.create({data:{...p,data,authorId:c.user.id}});await audit(tx,c.user.id,'DISCOVERY_FACT_CREATED',item.id);return item;});
  return json({item},201);
 }
 const p=(request.method==='PATCH'?z.object({expectedUpdatedAt:z.iso.datetime(),data:z.unknown().optional(),sources:evidence.optional()}).strict().refine(v=>v.data!==undefined||v.sources!==undefined):z.object({expectedUpdatedAt:z.iso.datetime()}).strict()).parse(raw);
 const item=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032105)`;
  const row=await tx.discoveryFact.findUniqueOrThrow({where:{id}});if(row.updatedAt.toISOString()!==p.expectedUpdatedAt)conflict('STALE_FACT');
  if(request.method==='PATCH'){
   if(row.status!=='DRAFT')conflict('INVALID_FACT_STATE');
   const patch=p as {data?:unknown;sources?:unknown};
   const item=await tx.discoveryFact.update({where:{id},data:{data:parseFact(row.kind as FactKind,patch.data??row.data),sources:(patch.sources??row.sources) as never,authorId:c.user.id,reviewerId:null,updatedAt:new Date(Math.max(Date.now(),row.updatedAt.getTime()+1))}});
   await audit(tx,c.user.id,'DISCOVERY_FACT_UPDATED',id!);return item;
  }
  if(action==='verify'){
   if(row.status!=='DRAFT')conflict('INVALID_FACT_STATE');
   if(row.authorId===c.user.id)throw new ApiError(403,'SELF_APPROVAL','Проверку должен выполнить другой сотрудник.');
   if(!await resolveEvidence(row.sources,tx))conflict('SOURCE_CHANGED');
   await validateFact(row.kind as FactKind,row.data,row.parentId,tx);
  }else if(!['withdraw','revise'].includes(action??''))unavailable();
  const item=await tx.discoveryFact.update({where:{id},data:{status:action==='verify'?'VERIFIED':action==='revise'?'DRAFT':'WITHDRAWN',...(action==='verify'?{reviewerId:c.user.id}:action==='revise'?{reviewerId:null,authorId:c.user.id}:{}),updatedAt:new Date(Math.max(Date.now(),row.updatedAt.getTime()+1))}});
  await audit(tx,c.user.id,action==='verify'?'DISCOVERY_FACT_VERIFIED':'DISCOVERY_FACT_WITHDRAWN',id!);return item;
 });return json({item});
}
