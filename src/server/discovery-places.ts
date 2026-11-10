import {arturDiscoveryEngines} from './artur-discovery/transport';
import {db} from './db';
import {publicDocumentWhere} from './public-visibility';
import {z} from 'zod';
import {boundedPage,decodeCursor,encodeCursor,unavailable} from './discovery-utils';
import {liveFacts,localLabel,parseFact} from './discovery-facts';
import {resolveMaterial,resolveEvidence,materialWithReason} from './discovery-materials';
import {json,queryParams,idSchema,ApiError} from './http';
import type {ContentLocale} from '../contracts/cms';
import type {PlaceRef,HistoryEntry,MaterialKey,HistoricalDate} from '../contracts/discovery';
export function dateBounds(date:HistoricalDate):[number|undefined,number|undefined]{return date.datePrecision==='range'?[date.yearFrom,date.yearTo]:date.dateParts?[date.dateParts.year,date.dateParts.year]:[undefined,undefined];}
export async function placeRows(locale:ContentLocale){
 const places=await liveFacts('PLACE'),history=await liveFacts('HISTORY');
 return places.map(row=>{const data=row.data as {labels:unknown;coordinates:{latitude:number;longitude:number}|null},label=localLabel(data.labels,locale);
  const item:PlaceRef={id:row.id,name:label.value.title,description:label.value.body,contentLocale:label.contentLocale,availableLocales:label.availableLocales,translationStatus:label.translationStatus,mapAvailable:!!data.coordinates,coordinates:data.coordinates,historyCount:history.filter(h=>h.parentId===row.id).length,isDemo:row.evidence.some(s=>s.isDemo)};
  return {item,evidence:row.evidence};
 });
}
function orderDate(date:HistoricalDate,id:string){return String(dateBounds(date)[0]??9999).padStart(4,'0')+'-'+String(date.dateParts?.month??0).padStart(2,'0')+'-'+String(date.dateParts?.day??0).padStart(2,'0')+'-'+id;}
export async function places(request:Request,id?:string){
 if(!id){
  const p=boundedPage.extend({q:z.string().trim().max(200).default('')}).strict().parse(queryParams(request));const key=['places',p.locale,p.q],after=decodeCursor(p.cursor,key);
  const all=(await placeRows(p.locale)).map(r=>r.item).filter(r=>(!after||r.id>after)&&(!p.q||r.name.toLowerCase().includes(p.q.toLowerCase())));
  const items=all.slice(0,p.limit);return json({items,nextCursor:all.length>p.limit?encodeCursor(items.at(-1)!.id,key):null,locale:p.locale});
 }
 idSchema.parse(id);
 const p=boundedPage.extend({yearFrom:z.coerce.number().int().min(1).max(2100).optional(),yearTo:z.coerce.number().int().min(1).max(2100).optional()}).strict().refine(v=>v.yearFrom===undefined||v.yearTo===undefined||v.yearFrom<=v.yearTo).parse(queryParams(request));
 const place=(await placeRows(p.locale)).find(r=>r.item.id===id);if(!place)unavailable();
 const key=['history',id,p.locale,p.yearFrom??null,p.yearTo??null],after=decodeCursor(p.cursor,key),history=await liveFacts('HISTORY');
 const marker=p.cursor?z.string().max(200).parse(JSON.parse(Buffer.from(p.cursor,'base64url').toString('utf8')).position):undefined;
 const result:HistoryEntry[]=[];
 for(const row of history.filter(r=>r.parentId===id).sort((a,b)=>orderDate(parseFact('HISTORY',a.data).date,a.id).localeCompare(orderDate(parseFact('HISTORY',b.data).date,b.id)))){
  if(marker&&orderDate(parseFact('HISTORY',row.data).date,row.id)<=marker)continue;
  const data=parseFact('HISTORY',row.data),bounds=dateBounds(data.date);
  if((p.yearFrom!==undefined||p.yearTo!==undefined)&&bounds[0]===undefined)continue;
  if(p.yearFrom!==undefined&&bounds[1]!==undefined&&bounds[1]<p.yearFrom||p.yearTo!==undefined&&bounds[0]!==undefined&&bounds[0]>p.yearTo)continue;
  const label=localLabel(data.labels,p.locale),materials=[];
  for(const target of data.materials){const material=await resolveMaterial(target,p.locale);if(material)materials.push(materialWithReason(material,'same_place',row.evidence,p.locale));}
  result.push({id:row.id,...data.date,title:label.value.title,body:label.value.body,contentLocale:label.contentLocale,translationStatus:label.translationStatus,materials,sources:row.evidence,certainty:data.certainty});
 }
 const items=result.slice(0,p.limit);return json({place:place.item,items,nextCursor:result.length>p.limit?encodeCursor(items.at(-1)!.id,key,orderDate(items.at(-1)!,items.at(-1)!.id)):null,locale:p.locale,order:'chronological'});
}
export async function related(request:Request,id:string){
 const p=boundedPage.omit({cursor:true}).strict().parse(queryParams(request));
 const target=await resolveMaterial({kind:'document',id:idSchema.parse(id)},p.locale);if(!target)unavailable();
 const links=await liveFacts('LINK'),items=[];const keys=new Set(['document:'+id]);
 for(const row of links){
  const data=row.data as {from:MaterialKey;to:MaterialKey;reason:'same_place'|'same_person'|'same_event'|'same_fund'};
  const to=data.from.kind==='document'&&data.from.id===id?data.to:data.to.kind==='document'&&data.to.id===id?data.from:null;
  if(!to||keys.has(to.kind+':'+to.id))continue;
  const material=await resolveMaterial(to,p.locale);if(!material)continue;
  const evidence=await resolveEvidence(row.evidence);if(!evidence)continue;
  keys.add(to.kind+':'+to.id);items.push(materialWithReason(material,data.reason,evidence,p.locale));
  if(items.length>=p.limit)break;
 }
 if(items.length<p.limit){
  const candidates=[];for(const row of await db.document.findMany({where:{...publicDocumentWhere,id:{not:id}},select:{id:true},orderBy:{id:'asc'},take:100})){const material=await resolveMaterial({kind:'document',id:row.id},p.locale);if(material&&!keys.has('document:'+row.id))candidates.push(material);}
  const ranked=arturDiscoveryEngines.rankRelated({target,candidates,limit:p.limit-items.length},{locale:p.locale,now:new Date().toISOString()});
  for(const match of ranked){
   const candidate=candidates.find(r=>r.material.kind===match.key.kind&&r.material.id===match.key.id);if(!candidate)throw new ApiError(502,'INVALID_ENGINE_RESPONSE','Сервис временно недоступен.');
   const current=await resolveMaterial(match.key,candidate.source.locale,false);if(!current||current.source.revision!==candidate.source.revision)continue;
   const evidence=await resolveEvidence(match.evidence);if(!evidence)continue;
   items.push(materialWithReason(current,match.reason,evidence,p.locale));
  }
 }
 const currentTarget=await resolveMaterial({kind:'document',id},target.source.locale,false);if(!currentTarget)unavailable();if(currentTarget.source.revision!==target.source.revision)throw new ApiError(409,'SOURCE_CHANGED','Данные изменились. Обновите страницу и повторите.');
 const textual=items.filter(i=>i.reason.code==='text_similarity').length;
 return json({items,method:textual?(textual===items.length?'text_similarity':'mixed'):'curated',locale:p.locale,engine:'artur',candidateLimit:100});
}
