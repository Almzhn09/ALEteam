/** Static COL-B01 adapter. The caller authorizes snapshots and revalidates output sources. */
import type {AliasRef,CandidateSnapshot,DiscoveryEngines,MaterialKey,ReasonCode,SourceRef} from '../../contracts/discovery';
import {expandNames,discoveryPlaces,type AliasEntity} from './names';
import {rankRelated,rankRecommendations} from './ranking';
import {explainFragments} from './explanation';
import {planResearch} from './research';
import {semanticCatalogPlan} from '../semantic-catalog-plan';
import {sourceRefSchema,type EngineMaterial,type EngineRankedItem,type EngineLocale} from './types';
const key=(m:MaterialKey)=>m.kind+':'+m.id;
function engineSource(s:SourceRef){return sourceRefSchema.parse({id:s.id,kind:s.kind,locale:s.locale,revision:s.revision,title:s.title,href:s.href});}
function snapshot(input:readonly CandidateSnapshot[],locale:EngineLocale){
 const lookup=new Map<string,CandidateSnapshot>();
 const materials=input.map(c=>{
  if(c.source.id!==c.material.id||c.source.kind!==c.material.kind||c.source.locale!==c.material.contentLocale)throw Error('SOURCE_IDENTITY_MISMATCH');
  engineSource(c.source);if(lookup.has(key(c.material)))throw Error('DUPLICATE_MATERIAL_SNAPSHOT');lookup.set(key(c.material),c);
  // Context locale chooses labels; the original source/content locale is restored below, never relabelled to the user.
  const result:EngineMaterial={id:key(c.material),kind:c.material.kind,locale,revision:c.source.revision,title:c.material.title,href:c.material.href,
   publication:'published',metadataAllowed:true,branchVisible:true,deleted:false,textAllowed:true,description:c.text,topicIds:c.topicIds,isDemo:c.material.isDemo,
   facts:[...c.placeIds.map(id=>({kind:'place' as const,id,verified:true,sourceIds:[key(c.material)]})),...(c.personIds??[]).map(id=>({kind:'person' as const,id,verified:true,sourceIds:[key(c.material)]})),...(c.eventIds??[]).map(id=>({kind:'event' as const,id,verified:true,sourceIds:[key(c.material)]})),...(c.fundId?[{kind:'fund' as const,id:c.fundId,verified:true,sourceIds:[key(c.material)]}]:[])]};
  return result;
 });return {materials,lookup};
}
function ranked(result:EngineRankedItem[],lookup:Map<string,CandidateSnapshot>){return result.map(r=>{
 const candidate=lookup.get(r.id);if(!candidate||candidate.source.revision!==r.revision)throw Error('ENGINE_RETURNED_UNKNOWN_SOURCE');
 const reason:ReasonCode=r.reason.code==='interests'?'chosen_topic':r.reason.code==='popular'?'editorial':r.reason.code;
 return {key:{kind:candidate.material.kind,id:candidate.material.id},reason,evidence:r.reason.evidence.map(e=>{const original=lookup.get(e.id);if(!original||original.source.revision!==e.revision)throw Error('ENGINE_RETURNED_UNKNOWN_EVIDENCE');return original.source;})};
});}
function aliases(input:AliasRef[]):AliasEntity[]{return input.map(a=>{
 const names=a.aliases.filter(n=>n.status==='VERIFIED'&&n.sources.length>0);
 return {id:a.entityId,name:{ru:a.canonicalName,kk:a.canonicalName,en:a.canonicalName},aliases:[...names.map(n=>{
  const project=discoveryPlaces.flatMap(e=>e.aliases).find(x=>x.name.toLowerCase()===n.name.toLowerCase());
  return {name:n.name,locale:n.locale,forms:project?.forms??[],historical:false,transliteration:project?.transliteration??false};
 }),...(!names.some(n=>n.name.toLowerCase()===a.canonicalName.toLowerCase())?[{name:a.canonicalName,locale:'ru' as const,forms:[],historical:false,transliteration:false}]:[])],ambiguousNames:[...(a.ambiguity||discoveryPlaces.some(p=>p.ambiguousNames.includes(a.canonicalName))?[a.canonicalName]:[]),...names.filter(n=>discoveryPlaces.some(p=>p.ambiguousNames.includes(n.name))).map(n=>n.name)],evidence:names.flatMap(n=>n.sources.map(s=>({sourceId:s.id})))};
});}
export const arturDiscoveryEngines:DiscoveryEngines={
 expandNames(input,context){
  if(input.aliases.length>100)throw Error('TOO_MANY_ALIAS_ENTITIES');
  const result=expandNames(input.query,context.locale,{entities:aliases(input.aliases),...(input.placeId?{entityId:input.placeId}:{})});
  const sources:SourceRef[]=[];const seen=new Set<string>();
  for(const a of input.aliases.filter(a=>result.entityIds.includes(a.entityId)))for(const n of a.aliases.filter(n=>n.status==='VERIFIED'))for(const s of n.sources){engineSource(s);const k=key(s)+':'+s.locale+':'+s.revision;if(!seen.has(k)){seen.add(k);sources.push(s);}}
  return {mode:'expanded',applied:result.status==='resolved',variants:result.variants,entityIds:result.entityIds,clarificationRequired:result.status==='ambiguous',sources};
 },
 rankRelated(input,context){const {materials,lookup}=snapshot([input.target,...input.candidates.filter(c=>key(c.material)!==key(input.target.material))],context.locale);return ranked(rankRelated(key(input.target.material),materials,context.locale,input.limit),lookup);},
 rankRecommendations(input,context){const {materials,lookup}=snapshot(input.candidates,context.locale);const result=rankRecommendations(materials,context.locale,{personalizationEnabled:input.personalizationEnabled,historyEnabled:input.historyEnabled??false,topicIds:input.topicIds,viewedIds:(input.viewedKeys??[]).map(key)},input.limit);return ranked(result.items,lookup);},
 explainFragments(input,context){
  // COL-B03 has already checked card/copy/OCR rights; unreviewed OCR still cannot be called verified here.
  const result=explainFragments({source:engineSource(input.source),publication:'published',metadataAllowed:true,digitalCopyAllowed:true,branchVisible:true,deleted:false,
   fragments:input.fragments.map(f=>({id:f.id,text:f.text,...(f.page?{page:f.page}:{}),quality:!input.ocr.used||input.ocr.quality==='reviewed'?'verified':'ocr',...(input.ocr.used&&input.ocr.quality==='reviewed'?{confidence:1}:{})}))},context.locale);
  if(!['ready','no_text','low_quality','unsupported'].includes(result.status))throw Error('INVALID_AUTHORIZED_TEXT_STATE');
  return {status:result.status as 'ready'|'no_text'|'low_quality'|'unsupported',mode:result.status==='ready'?'extractive':null,sourceRevision:input.source.revision,
   ...(result.summary?{summary:result.summary}:{}),terms:result.terms.map(t=>({term:t.term,explanation:t.meaning,fragmentIds:result.citations.filter(c=>c.quote.toLowerCase().includes(t.term.toLowerCase())).map(c=>c.fragmentId)})),
   citations:result.citations.map(c=>({fragmentId:c.fragmentId,quote:c.quote,source:{...input.source,fragment:{id:c.fragmentId,...(c.page?{page:c.page}:{}),start:c.start,end:c.end}}})),limitations:result.limitations};
 },
 planResearch(input,context){
  const plan=semanticCatalogPlan(input.question,context.locale);const result=planResearch(input.question,context.locale,{...plan,filters:{...plan.filters,...input.filters,locale:context.locale}});
  if(!result)return {steps:[],actions:[]};const actions=result.actions.map(a=>({type:'catalogSearch' as const,filters:a.query}));
  return {steps:result.steps.map(s=>({id:s.id,text:s.title+'. '+s.description,status:'suggested' as const,sources:[],...(s.kind==='search'&&actions[0]?{action:actions[0]}:{})})),actions};
 },
};
