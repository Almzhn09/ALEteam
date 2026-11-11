import {z} from 'zod';
import {db} from './db';
import {cmsMatchesFilters} from './material-search';
import {Prisma} from '../generated/prisma/index.js';
import {ApiError,json,readJson,queryParams,requireUser,rateLimit,idSchema} from './http';
import {publicDocumentWhere,publicContentScope} from './public-visibility';
import {catalogSchema,documentList} from './catalog';
import {liveFacts} from './discovery-facts';
import {resolveMaterial,materialWithReason} from './discovery-materials';
import {boundedPage,digest,decodeCursor,encodeCursor,unavailable} from './discovery-utils';
import {publicationLock} from './discovery-publications';
import type {ContentLocale} from '../contracts/cms';
import type {MaterialKey,SubscriptionInput} from '../contracts/discovery';
const subscriptionSchema=z.object({topicId:idSchema.optional(),placeId:idSchema.optional(),locale:z.enum(['ru','kk','en']),filters:z.record(z.string(),z.unknown()).optional()}).strict().refine(v=>!!v.topicId||!!v.placeId||!!v.filters);
export function normalizedSubscription(value:unknown):SubscriptionInput{
 const parsed=subscriptionSchema.parse(value);
 if(parsed.filters){if(parsed.filters.locale!==undefined&&parsed.filters.locale!==parsed.locale)throw new ApiError(400,'INVALID_SUBSCRIPTION','Проверьте введённые данные.');const {scope,contentKind,...archiveFilters}=parsed.filters;z.enum(['all','document','cms']).optional().parse(scope);z.string().max(50).optional().parse(contentKind);const query=catalogSchema.parse({...archiveFilters,locale:parsed.locale});
  if('page' in parsed.filters||'pageSize' in parsed.filters||'sort' in parsed.filters)throw new ApiError(400,'INVALID_SUBSCRIPTION','Проверьте введённые данные.');
  const {page:_,pageSize:__,sort:___,...semantic}=query;parsed.filters={...semantic,...(scope?{scope}:{}),...(contentKind?{contentKind}:{})};
 }
 return parsed as SubscriptionInput;
}
async function validSelection(spec:SubscriptionInput){
 for(const [kind,id] of [['TOPIC',spec.topicId],['PLACE',spec.placeId]] as const)if(id&&!(await liveFacts(kind)).some(row=>row.id===id))unavailable();
}
type MatchCache={documents?:Set<string>;editorials?:Awaited<ReturnType<typeof liveFacts>>;history?:Awaited<ReturnType<typeof liveFacts>>};
export async function matchesSubscription(key:MaterialKey,spec:SubscriptionInput,cache:MatchCache={}){
 const material=await resolveMaterial(key,spec.locale,false);if(!material)return;
 if(spec.topicId||spec.placeId){
  const editorials=cache.editorials??=await liveFacts('EDITORIAL'),history=spec.placeId?(cache.history??=await liveFacts('HISTORY')):[];
  const matched=editorials.some(row=>{const d=row.data as {material:MaterialKey;topicId?:string;placeId?:string};return d.material.kind===key.kind&&d.material.id===key.id&&(!spec.topicId||d.topicId===spec.topicId)&&(!spec.placeId||d.placeId===spec.placeId);})||!spec.topicId&&history.some(row=>row.parentId===spec.placeId&&(row.data as {materials:MaterialKey[]}).materials.some(k=>k.kind===key.kind&&k.id===key.id));
  if(!matched)return;
 }
 if(spec.filters){
  if(key.kind==='cms')return await cmsMatchesFilters(key,{...spec.filters},spec.locale)?material:undefined;
  if(spec.filters.scope==='cms'||spec.filters.contentKind)return;
  if(!cache.documents){
   const query=new URLSearchParams();for(const [name,value] of Object.entries({...spec.filters,scope:undefined,contentKind:undefined,locale:spec.locale,pageSize:50}))if(value!==undefined)query.set(name,String(value));
   cache.documents=new Set<string>();
   for(let page=1;page<=20;page++){
    query.set('page',String(page));const result=await(await documentList(new Request('http://discovery.invalid/?'+query))).json();
    for(const row of result.items)cache.documents.add(row.id);
    if(page*50>=result.total)break;
    if(page===20)throw new ApiError(503,'DISCOVERY_CORPUS_LIMIT','Сервис временно недоступен.');
   }
  }
  if(!cache.documents.has(key.id))return;
 }
 return material;
}
export async function currentMaterialKeys():Promise<MaterialKey[]>{
 const docs=await db.document.findMany({where:publicDocumentWhere,select:{id:true},orderBy:{id:'asc'},take:1001});
 const cms=await db.contentItem.findMany({where:{...publicContentScope,kind:{notIn:['SETTING','ARCHIVE_DOCUMENT']},revisions:{some:{status:'PUBLISHED'}}},select:{id:true},orderBy:{id:'asc'},take:1001});
 if(docs.length>1000||cms.length>1000)throw new ApiError(503,'DISCOVERY_CORPUS_LIMIT','Сервис временно недоступен.');
 return [...docs.map(d=>({kind:'document' as const,id:d.id})),...cms.map(d=>({kind:'cms' as const,id:d.id}))];
}
function serializeSubscription(row:{id:string;spec:Prisma.JsonValue;active:boolean;createdAt:Date}){return {id:row.id,...row.spec as object,active:row.active,createdAt:row.createdAt};}
export async function subscriptions(request:Request,id?:string){
 const user=await requireUser(request);
 if(request.method==='GET'){
  const p=boundedPage.strict().parse(queryParams(request)),key=['subscriptions',user.id,p.locale],after=decodeCursor(p.cursor,key);
  const rows=await db.topicSubscription.findMany({where:{userId:user.id,active:true,...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:p.limit+1});
  const items=rows.slice(0,p.limit);return json({items:items.map(serializeSubscription),nextCursor:rows.length>p.limit?encodeCursor(items.at(-1)!.id,key):null,locale:p.locale});
 }
 await rateLimit('topic-subscriptions:'+user.id,30,60);
 if(request.method==='DELETE'){
  idSchema.parse(id);const row=await db.topicSubscription.findFirst({where:{id,userId:user.id}});if(!row)unavailable();
  if(request.body)z.object({}).strict().parse(await readJson(request,1024));
  await db.$transaction(async tx=>{await publicationLock(tx);await tx.topicSubscription.update({where:{id},data:{active:false}});});return json({ok:true});
 }
 const spec=normalizedSubscription(await readJson(request,8192));await validSelection(spec);
 const result=await db.$transaction(async tx=>{
  await publicationLock(tx);
  const fingerprint=digest(spec),existing=await tx.topicSubscription.findUnique({where:{userId_fingerprint:{userId:user.id,fingerprint}}});
  if(existing?.active)return {item:existing,created:false};
  if(await tx.topicSubscription.count({where:{userId:user.id,active:true}})>=25)throw new ApiError(409,'SUBSCRIPTION_LIMIT','Данные изменились. Обновите страницу и повторите.');
  const baseline=(await tx.materialPublication.aggregate({_max:{sequence:true}}))._max.sequence??0n;
  const row=existing?await tx.topicSubscription.update({where:{id:existing.id},data:{active:true,baseline,cursor:baseline,spec:JSON.parse(JSON.stringify(spec)) as Prisma.InputJsonValue}}):await tx.topicSubscription.create({data:{userId:user.id,fingerprint,spec:JSON.parse(JSON.stringify(spec)) as Prisma.InputJsonValue,baseline,cursor:baseline}});
  await tx.topicNotice.deleteMany({where:{subscriptionId:row.id}});
  const cache:MatchCache={};
  for(const key of await currentMaterialKeys())if(await matchesSubscription(key,spec,cache))await tx.topicNotice.create({data:{subscriptionId:row.id,materialKey:key.kind+':'+key.id,publicationSequence:0n,readAt:new Date()}});
  return {item:row,created:true};
 },{timeout:20000});
 return json({item:serializeSubscription(result.item)},result.created?201:200);
}
export async function deliverTopicNotices(){
 let scanned=0,delivered=0;
 const latest=(await db.materialPublication.aggregate({_max:{sequence:true}}))._max.sequence??0n;
 for(const sub of await db.topicSubscription.findMany({where:{active:true,cursor:{lt:latest},user:{isActive:true}},orderBy:[{updatedAt:'asc'},{id:'asc'}],take:100})){
  await db.$transaction(async tx=>{
   await publicationLock(tx);
   const current=await tx.topicSubscription.findUniqueOrThrow({where:{id:sub.id}});if(!current.active)return;
   const events=await tx.materialPublication.findMany({where:{sequence:{gt:current.cursor}},orderBy:{sequence:'asc'},take:50});
   const spec=normalizedSubscription(current.spec),cache:MatchCache={};
   for(const event of events){scanned++;if(event.locale!==spec.locale)continue;
    const key={kind:event.kind as MaterialKey['kind'],id:event.materialId};const material=await matchesSubscription(key,spec,cache);if(!material||material.eventRevision!==event.revision)continue;
    const result=await tx.topicNotice.createMany({data:[{subscriptionId:sub.id,materialKey:key.kind+':'+key.id,publicationSequence:event.sequence}],skipDuplicates:true});delivered+=result.count;
   }
   if(events.length)await tx.topicSubscription.update({where:{id:sub.id},data:{cursor:events.at(-1)!.sequence}});
  },{timeout:20000});
 }
 return {scanned,delivered};
}
async function visibleNotice(id:string,userId:string,locale:ContentLocale){
 const row=await db.topicNotice.findFirst({where:{id,subscription:{userId,active:true}},include:{subscription:true}});if(!row||row.publicationSequence<=row.subscription.baseline)return;
 const [kind,materialId]=row.materialKey.split(':');const spec=normalizedSubscription(row.subscription.spec);
 const key={kind:kind as MaterialKey['kind'],id:materialId};if(!await matchesSubscription(key,spec))return;
 const material=await resolveMaterial(key,locale,true);if(!material)return;
 return {id:row.id,subscriptionId:row.subscriptionId,material:materialWithReason(material,'chosen_topic',[material.source],locale),createdAt:row.createdAt,readAt:row.readAt};
}
export async function topicNotices(request:Request,id?:string){
 const user=await requireUser(request);
 if(id){idSchema.parse(id);z.object({}).strict().parse(await readJson(request,1024));const item=await visibleNotice(id,user.id,'ru');if(!item)unavailable();await db.topicNotice.update({where:{id},data:{readAt:new Date()}});return json({ok:true});}
 const p=boundedPage.strict().parse(queryParams(request)),key=['topic-notices',user.id,p.locale],after=decodeCursor(p.cursor,key);
 const rows=await db.topicNotice.findMany({where:{subscription:{userId:user.id,active:true},...(after?{id:{gt:after}}:{})},orderBy:{id:'asc'},take:201});
 const items=[];let last:string|undefined;
 for(const row of rows.slice(0,200)){last=row.id;const item=await visibleNotice(row.id,user.id,p.locale);if(item)items.push(item);if(items.length===p.limit)break;}
 const more=last&&rows.some(r=>r.id>last!);return json({items,nextCursor:more?encodeCursor(last!,key):null,locale:p.locale});
}
export async function interests(request:Request){
 const user=await requireUser(request);
 if(request.method==='GET'){z.object({}).strict().parse(queryParams(request));const item=await db.discoveryPreference.findUnique({where:{userId:user.id}});return json({item:item?{topicIds:item.topicIds,personalizationEnabled:item.personalizationEnabled,historyEnabled:item.historyEnabled,updatedAt:item.updatedAt}:{topicIds:[],personalizationEnabled:false,historyEnabled:false,updatedAt:null}});}
 const p=z.object({topicIds:z.array(idSchema).max(20),personalizationEnabled:z.boolean(),historyEnabled:z.boolean()}).strict().parse(await readJson(request,4096));
 if(p.historyEnabled)throw new ApiError(503,'HISTORY_NOT_CONFIGURED','Сервис временно недоступен.');
 const known=new Set((await liveFacts('TOPIC')).map(t=>t.id));if(p.topicIds.some(id=>!known.has(id)))unavailable();
 await rateLimit('interests:'+user.id,30,60);const value={...p,topicIds:[...new Set(p.topicIds)].sort()};const item=await db.discoveryPreference.upsert({where:{userId:user.id},create:{userId:user.id,...value},update:value});
 return json({item:{topicIds:item.topicIds,personalizationEnabled:item.personalizationEnabled,historyEnabled:item.historyEnabled,updatedAt:item.updatedAt}});
}
