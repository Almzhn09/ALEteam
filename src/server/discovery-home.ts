import {z} from 'zod';
import {db} from './db';
import {liveFacts} from './discovery-facts';
import {boundedPage,materialKey} from './discovery-utils';
import {resolveMaterial,materialWithReason} from './discovery-materials';
import {json,queryParams,requireUser,ApiError,idSchema} from './http';
import {discoveryEngines} from './discovery-engine-registry';
import type {MaterialKey,MaterialRef} from '../contracts/discovery';
export async function home(request:Request){
 const p=boundedPage.omit({cursor:true}).extend({topicIds:z.string().max(2000).optional()}).strict().parse(queryParams(request));
 let personalizationEnabled=false,topicIds=p.topicIds?p.topicIds.split(',').filter(Boolean):[];
 topicIds=z.array(idSchema).max(20).parse(topicIds);
 try{const user=await requireUser(request),preference=await db.discoveryPreference.findUnique({where:{userId:user.id}});personalizationEnabled=preference?.personalizationEnabled??false;topicIds=personalizationEnabled?preference!.topicIds:[];}catch(error){if(!(error instanceof ApiError&&error.status===401))throw error;personalizationEnabled=topicIds.length>0;}
 const known=new Set((await liveFacts('TOPIC')).map(row=>row.id));topicIds=topicIds.filter(id=>known.has(id));
 const facts=(await liveFacts('EDITORIAL')).sort((a,b)=>(a.data as {order:number}).order-(b.data as {order:number}).order||a.id.localeCompare(b.id));
 const candidates=[],keys=new Set<string>();
 for(const row of facts){const data=row.data as {material:MaterialKey;topicId?:string;placeId?:string};
  if(personalizationEnabled&&topicIds.length&&(!data.topicId||!topicIds.includes(data.topicId)))continue;
  const material=await resolveMaterial(data.material,p.locale);if(!material||keys.has(data.material.kind+':'+data.material.id))continue;
  keys.add(data.material.kind+':'+data.material.id);material.topicIds=data.topicId?[data.topicId]:[];material.placeIds=data.placeId?[data.placeId]:[];candidates.push({...material,evidence:row.evidence});
 }
 let items:MaterialRef[]=candidates.slice(0,p.limit).map(c=>materialWithReason(c,personalizationEnabled&&topicIds.length?'chosen_topic':'editorial',c.evidence,p.locale));
 let engine='baseline';
 if(discoveryEngines.rankRecommendations){
  const ranked=discoveryEngines.rankRecommendations({candidates,topicIds,personalizationEnabled,limit:p.limit},{locale:p.locale,now:new Date().toISOString()});const seen=new Set<string>();items=[];
  for(const result of ranked.slice(0,p.limit)){const key=materialKey.parse(result.key),candidate=candidates.find(c=>c.material.id===key.id&&c.material.kind===key.kind);if(!candidate||seen.has(key.kind+':'+key.id))continue;seen.add(key.kind+':'+key.id);const fresh=await resolveMaterial(key,p.locale);if(!fresh||fresh.source.revision!==candidate.source.revision)continue;items.push(materialWithReason(fresh,personalizationEnabled&&topicIds.length?'chosen_topic':'editorial',candidate.evidence,p.locale));}engine='artur';
 }
 const popular:{status:'measured'|'unavailable';period:{from:string;to:string}|null;items:MaterialRef[]}={status:'unavailable',period:null,items:[]};
 if(process.env.DISCOVERY_AGGREGATES_ENABLED==='1'){
  const latest=await db.discoveryAggregate.findFirst({orderBy:[{periodTo:'desc'},{id:'asc'}]});
  if(latest){popular.status='measured';popular.period={from:latest.periodFrom.toISOString(),to:latest.periodTo.toISOString()};
   const rows=await db.discoveryAggregate.findMany({where:{periodFrom:latest.periodFrom,periodTo:latest.periodTo,count:{gte:5}},orderBy:[{count:'desc'},{id:'asc'}],take:100});
   for(const row of rows){const current=await resolveMaterial({kind:row.kind as MaterialKey['kind'],id:row.materialId},p.locale);if(current)popular.items.push(materialWithReason(current,'editorial',[current.source],p.locale));if(popular.items.length===p.limit)break;}
  }
 }
 return json({locale:p.locale,recommended:{mode:personalizationEnabled&&topicIds.length?'interests':'editorial',items,engine},popular,continue:{scope:'browser',items:[]},history:{status:'not_configured'}});
}
