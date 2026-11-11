import {z} from 'zod';
import requests from '../../data/archive-20261110/cms-draft-requests.json';
import branches from '../../data/archive-20261110/branches.json';
import registry from '../../sources/archive-20261110/manifest.json';
import {db} from './db';
import {Prisma} from '../generated/prisma/index.js';
import {contentPayload,checkPayload} from './cms';
import {createCmsDraft,appendCmsDraft} from './cms-drafts';
import {staffContext,audit} from './staff';
import {allows} from './staff-policy';
import {ApiError,idSchema,json,queryParams,readJson,rateLimit} from './http';
import {canonical,digest,conflict,unavailable} from './discovery-utils';
const namespace='archive-20261110';
const mapping=z.object({sourceKey:z.string().min(1).max(160),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),branchId:idSchema.nullable().optional()}).strict();
const manifest=z.object({package:z.literal(namespace),mode:z.enum(['cms','branches']),mappings:z.array(mapping).min(1).max(50)}).strict();
interface Row {sourceKey:string;locale:string;sourceHash:string;requestHash:string;slug:string;kind:'PAGE'|'BRANCH_PROFILE';branchId:string|null;newBranch:boolean;branchName?:string;payload:Prisma.InputJsonValue;original:Prisma.InputJsonValue}
function sourceHash(id:string){const source=registry.sources.find(s=>s.id===id.split('/')[0]);if(!source)conflict();return source.sha256;}
function rows(input:z.infer<typeof manifest>):Row[]{
 if(new Set(input.mappings.map(r=>r.sourceKey)).size!==input.mappings.length)throw new ApiError(400,'DUPLICATE_SOURCE','Проверьте введённые данные.');
 const output:Row[]=[];
 for(const map of input.mappings){
  if(input.mode==='cms'){
   const r=requests.records.find(r=>r.sourceKey===map.sourceKey);if(!r)unavailable();
   const payload=contentPayload.parse(r.request.payload);checkPayload(r.request.kind,payload,false);
   const data={sourceKey:map.sourceKey,locale:r.request.locale,sourceHash:sourceHash(r.sourceId),slug:map.slug,kind:'PAGE' as const,branchId:map.branchId??null,newBranch:false,payload,original:r};
   output.push({...data,requestHash:digest(data)});
  }else{
   const r=branches.records.find(r=>r.sourceKey===map.sourceKey);if(!r)unavailable();
   const review={address:'unverified',phone:r.phone?'unverified':'missing',email:r.email?(r.issues.includes('email-domain-needs-confirmation')?'needs_confirmation':'unverified'):'missing',hours:'missing',coordinates:'missing'};
   const validEmail=z.email().safeParse(r.email);
   const payload=contentPayload.parse({title:r.name.trim().replace(/\s+/g,' '),body:[r.name,r.address,r.phone??'',r.email??''].filter(Boolean).join('\n'),rights:'Предоставленный архивом материал; права и актуальность требуют проверки сотрудником.',sourceNote:'S01, лист '+r.source.sheet+', строка '+r.source.row+'. Исходные значения сохранены; требуется редакционная сверка.',address:r.address,...(r.phone?{phone:r.phone}:{}),...(validEmail.success?{email:validEmail.data}:{}),contactReview:review});
   checkPayload('BRANCH_PROFILE',payload,false);
   const data={sourceKey:map.sourceKey,locale:'ru',sourceHash:sourceHash('S01'),slug:map.slug,kind:'BRANCH_PROFILE' as const,branchId:map.branchId??'src_'+digest([namespace,map.sourceKey]).slice(0,24),newBranch:!map.branchId,branchName:payload.title,payload,original:r};
   output.push({...data,requestHash:digest(data)});
  }
 }
 const languageKeys=output.map(r=>r.slug+':'+r.locale);
 if(new Set(languageKeys).size!==languageKeys.length)throw new ApiError(400,'DUPLICATE_LANGUAGE','Проверьте введённые данные.');
 for(const row of output)if(output.some(other=>other.slug===row.slug&&(other.kind!==row.kind||other.branchId!==row.branchId)))throw new ApiError(400,'INCONSISTENT_TARGET','Проверьте введённые данные.');
 return output;
}
async function authorize(request:Request,items:Row[]){
 const c=await staffContext(request);
 for(const r of items){
  if(!allows(c.grants,'content.write',r.newBranch?null:r.branchId))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
  if(r.kind==='BRANCH_PROFILE'&&!allows(c.grants,'branches.manage',r.newBranch?null:r.branchId))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
 }
 return c;
}
async function inspect(tx:Prisma.TransactionClient,items:Row[]){
 const report=[];
 for(const r of items){
  let state:'create'|'unchanged'|'conflict'='create';let code:string|undefined;
  const binding=await tx.sourceDraftBinding.findUnique({where:{namespace_sourceKey_locale:{namespace,sourceKey:r.sourceKey,locale:r.locale}},include:{item:true,revision:true}});
  if(binding){
   if(binding.requestHash===r.requestHash&&binding.item.slug===r.slug&&digest(binding.revision.payload)===digest(r.payload))state='unchanged';else{state='conflict';code='SOURCE_BINDING_CHANGED';}
  }else{
   const item=await tx.contentItem.findUnique({where:{slug:r.slug},include:{sourceDraftBindings:true,revisions:{where:{locale:r.locale}}}});
   if(item&&(!item.sourceDraftBindings.some(b=>b.namespace===namespace)||item.kind!==r.kind||item.branchId!==r.branchId||item.revisions.length)){state='conflict';code='TARGET_EXISTS';}
   if(r.branchId&&!r.newBranch&&!await tx.archiveBranch.count({where:{id:r.branchId}})){state='conflict';code='BRANCH_MISSING';}
   if(r.newBranch&&await tx.archiveBranch.count({where:{id:r.branchId!}})&&!await tx.sourceDraftBinding.count({where:{namespace,branchId:r.branchId}})){state='conflict';code='BRANCH_EXISTS';}
  }
  report.push({sourceKey:r.sourceKey,locale:r.locale,slug:r.slug,state,...(code?{code}:{})});
 }
 return report;
}
export async function sourceDrafts(request:Request,id?:string,action?:string){
 if(!id&&request.method==='GET'){
  await staffContext(request,'content.write',null);z.object({}).strict().parse(queryParams(request));
  return json({package:namespace,draftsOnly:true,cms:requests.records.map(r=>({sourceKey:r.sourceKey,sourceId:r.sourceId,slug:r.request.slug,locale:r.request.locale,sourceHash:sourceHash(r.sourceId)})),branches:branches.records.map(r=>({sourceKey:r.sourceKey,issues:r.issues,sourceHash:sourceHash('S01')})),pairing:'explicit-mappings-required'});
 }
 if(!id){
  const input=manifest.parse(await readJson(request,65536));const items=rows(input);const c=await authorize(request,items);await rateLimit('source-stage:'+c.user.id,20,60);
  const report=await db.$transaction(tx=>inspect(tx,items));
  const item=await db.sourceDraftBatch.create({data:{digest:digest(items),mode:input.mode,manifest:input,report,status:report.some(r=>r.state==='conflict')?'CONFLICT':'READY',authorId:c.user.id}});
  return json({item},201);
 }
 const batch=await db.sourceDraftBatch.findUnique({where:{id:idSchema.parse(id)}});if(!batch)unavailable();
 const input=manifest.parse(batch.manifest),items=rows(input);const c=await authorize(request,items);
 if(c.user.id!==batch.authorId&&!allows(c.grants,'audit.read',null))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
 if(request.method==='GET')return json({item:batch});
 z.object({}).strict().parse(await readJson(request,1024));
 if(action!=='commit')unavailable();
 await rateLimit('source-commit:'+c.user.id,20,60);
 const item=await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032104)`;
  const current=await tx.sourceDraftBatch.findUniqueOrThrow({where:{id}});
  if(current.status==='COMMITTED')return current;
  if(current.digest!==digest(items))conflict('SOURCE_PACKAGE_CHANGED');
  const report=await inspect(tx,items);if(report.some(r=>r.state==='conflict'))conflict();
  for(const r of items){
   if(report.find(x=>x.sourceKey===r.sourceKey)?.state==='unchanged')continue;
   if(r.newBranch&&!await tx.archiveBranch.count({where:{id:r.branchId!}}))await tx.archiveBranch.create({data:{id:r.branchId!,code:'source-'+digest([namespace,r.sourceKey]).slice(0,24),name:r.branchName!,isDemo:false,isPublic:false}});
   let target=await tx.contentItem.findUnique({where:{slug:r.slug}});let revision;
   if(!target){const created=await createCmsDraft(tx,{slug:r.slug,kind:r.kind,branchId:r.branchId,isDemo:false,locale:r.locale,payload:r.payload},c.user.id);target=created;revision=created.revisions[0];}
   else revision=await appendCmsDraft(tx,target.id,r.locale,r.payload,c.user.id);
   await tx.sourceDraftBinding.create({data:{namespace,sourceKey:r.sourceKey,locale:r.locale,requestHash:r.requestHash,sourceHash:r.sourceHash,itemId:target.id,revisionId:revision.id,branchId:r.branchId,original:r.original}});
   await audit(tx,c.user.id,'SOURCE_DRAFT_CREATED',revision.id);
  }
  await audit(tx,c.user.id,'SOURCE_BATCH_COMMITTED',id!);
  return tx.sourceDraftBatch.update({where:{id},data:{status:'COMMITTED',committedAt:new Date(),report}});
 },{timeout:20000});
 return json({item});
}

export {rows as prepareSourceDraftRows};
