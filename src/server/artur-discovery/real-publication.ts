/** Resolve R-A03 editorial recipes against current authorized CMS source snapshots.
 * Pure preparation only: the existing API owns grants, independent review and writes.
 */
import curation from '../../../data/artur/real-content-v2/curation.json';
import {prepareDiscoveryFacts,type PublishedSourceBinding} from './publication';
import type {PlaceRef} from '../../contracts/discovery';
import type {ContentLocale} from '../../contracts/cms';

type FactReference={kind:'cms';id:string;locale:ContentLocale;revision:string};
type Label={title:string;body?:string};
export interface PreparedCurationRow {draftKey:string;request:{kind:'TOPIC'|'EDITORIAL'|'LINK';branchId:null;data:unknown;sources:FactReference[]};requiresReview:true}
export function prepareRealCuration(input:readonly PublishedSourceBinding[],parents:Record<string,Pick<PlaceRef,'id'|'name'>>={},topics:Record<string,string>={}){
 const facts=prepareDiscoveryFacts(input,parents,curation.assertions);
 const ready:PreparedCurationRow[]=[];
 const blocked:{draftKey:string;reason:string;keys:string[]}[]=[];
 function refs(keys:string[]):FactReference[]|undefined{
  const rows=keys.map(key=>input.find(b=>b.sourceKey===key));
  if(rows.some(r=>!r))return;
  return rows.map(r=>({kind:'cms' as const,id:r!.source.id,locale:r!.source.locale,revision:r!.source.revision}))
   .filter((r,i,all)=>all.findIndex(s=>s.id===r.id&&s.locale===r.locale&&s.revision===r.revision)===i);
 }
 for(const row of curation.topics){
  const sources=refs(row.sourceKeys),draftKey='topic-'+row.id;
  if(!sources){blocked.push({draftKey,reason:'source_mapping_missing',keys:row.sourceKeys});continue;}
  const labels=Object.fromEntries(Object.entries(row.labels).map(([locale,title])=>[locale,{title}])) as Record<ContentLocale,Label>;
  ready.push({draftKey,request:{kind:'TOPIC',branchId:null,data:{labels},sources},requiresReview:true});
 }
 for(const row of curation.editorial){
  const source=input.find(b=>b.sourceKey===row.sourceKey);
  if(!source||row.evidence.some(e=>!input.find(b=>b.sourceKey===e.sourceKey&&b.source.locale===e.locale)?.body.includes(e.quote))){blocked.push({draftKey:row.key,reason:'source_mapping_missing_or_quote_changed',keys:[row.sourceKey]});continue;}
  for(const topic of row.topicKeys){
   const topicId=topics[topic],draftKey=row.key+'-'+topic;
   if(!topicId){blocked.push({draftKey,reason:'topic_unresolved',keys:[topic]});continue;}
   if(!/^[a-zA-Z0-9_-]{1,80}$/.test(topicId))throw Error('INVALID_TOPIC_BINDING');
   ready.push({draftKey,request:{kind:'EDITORIAL',branchId:null,data:{material:{kind:'cms',id:source.source.id},topicId,order:row.order},sources:[{kind:'cms',id:source.source.id,locale:source.source.locale,revision:source.source.revision}]},requiresReview:true});
  }
 }
 for(const row of curation.links){
  const matches=row.evidence.map(e=>({recipe:e,source:input.find(b=>b.sourceKey===e.sourceKey&&b.source.locale===e.locale)}));
  if(matches.some(m=>!m.source?.body.includes(m.recipe.quote))){blocked.push({draftKey:row.key,reason:'source_mapping_missing_or_quote_changed',keys:row.evidence.map(e=>e.sourceKey)});continue;}
  const sources=refs(row.evidence.map(e=>e.sourceKey))!;
  if(sources.length<2||sources[0].id===sources[1].id){blocked.push({draftKey:row.key,reason:'same_material',keys:[]});continue;}
  ready.push({draftKey:row.key,request:{kind:'LINK',branchId:null,data:{from:{kind:'cms',id:sources[0].id},to:{kind:'cms',id:sources[1].id},reason:row.reason},sources},requiresReview:true});
 }
 return {version:2 as const,draftsOnly:true as const,ready:[...facts.ready,...ready],blocked:[...facts.blocked,...blocked]};
}
