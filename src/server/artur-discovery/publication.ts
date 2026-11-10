/** Build real COL-B04 DRAFT request bodies from source-key bindings. No DB/network or publication. */
import {z} from 'zod';
import manifest from '../../../data/artur/discovery/publication-plan.json';
import type {ContentLocale} from '../../contracts/cms';
import type {PlaceRef} from '../../contracts/discovery';
const reference=z.object({kind:z.literal('cms'),id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),locale:z.enum(['ru','kk','en']),revision:z.string().regex(/^[a-f0-9]{64}$/),href:z.string().max(500),title:z.string().max(500)});
const binding=z.object({sourceKey:z.string().min(1).max(160),locale:z.enum(['ru','kk','en']),body:z.string().max(20000),source:reference});
export type PublishedSourceBinding=z.input<typeof binding>;
export interface PreparedFact {draftKey:string;request:{kind:'PLACE'|'ALIAS'|'HISTORY';branchId:null;parentId?:string;data:unknown;sources:{kind:'cms';id:string;locale:ContentLocale;revision:string}[]};requiresReview:true;notes:string[]}
export function prepareDiscoveryFacts(input:readonly PublishedSourceBinding[],parents:Record<string,Pick<PlaceRef,'id'|'name'>>={}){
 const bindings=z.array(binding).max(100).parse(input);const keys=bindings.map(b=>b.sourceKey+':'+b.locale);if(new Set(keys).size!==keys.length)throw Error('DUPLICATE_SOURCE_BINDING');
 const ready:PreparedFact[]=[],blocked:{draftKey:string;reason:'source_mapping_missing'|'source_quote_changed'|'parent_unresolved'|'parent_label_mismatch';keys:string[]}[]=[];
 for(const row of manifest.records){
  const matches=row.evidenceBindings.map(e=>({expected:e,binding:bindings.find(b=>b.sourceKey===e.sourceKey&&b.locale===e.locale)}));
  const missing=matches.filter(m=>!m.binding);if(missing.length){blocked.push({draftKey:row.draftKey,reason:'source_mapping_missing',keys:missing.map(m=>m.expected.sourceKey)});continue;}
  if(matches.some(m=>m.binding!.source.locale!==m.expected.locale||!m.binding!.body.includes(m.expected.quote))){blocked.push({draftKey:row.draftKey,reason:'source_quote_changed',keys:matches.map(m=>m.expected.sourceKey)});continue;}
  const sources=matches.map(m=>({kind:'cms' as const,id:m.binding!.source.id,locale:m.binding!.source.locale,revision:m.binding!.source.revision})).filter((s,i,all)=>all.findIndex(a=>a.id===s.id&&a.locale===s.locale&&a.revision===s.revision)===i);
  const original=row.data as Record<string,unknown>;const kind=row.proposedKind as PreparedFact['request']['kind'];let data:unknown,parentId:string|undefined;
  const parentKey='parentDraftKey' in row?row.parentDraftKey:undefined;
  if(parentKey){
   const parent=parents[parentKey];if(!parent){blocked.push({draftKey:row.draftKey,reason:'parent_unresolved',keys:[parentKey]});continue;}
   z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).parse(parent.id);
   const place=manifest.records.find(r=>r.draftKey===parentKey)!.data as {names:Record<string,string>};
   if(!Object.values(place.names).includes(parent.name)){blocked.push({draftKey:row.draftKey,reason:'parent_label_mismatch',keys:[parentKey]});continue;}
   parentId=parent.id;
  }
  if(kind==='PLACE'){
   const names=original.names as Record<string,string>;
   // Only RU labels by default; translated editorial labels are separately reviewed, not auto-certified.
   data={labels:{ru:{title:names.ru,body:'Материалы о городе и его названиях. Даты и происхождение указаны у источников.'}},coordinates:null};
  }else if(kind==='ALIAS')data={name:original.name,locale:original.locale};
  else{
   const date=original.date as {precision:string;year:number;month?:number;day?:number};
   data={labels:{ru:{title:original.title,body:(original.sourceAnniversaryText as string).slice(0,3000)}},date:{datePrecision:date.precision,dateParts:{year:date.year,...(date.month?{month:date.month}:{}),...(date.day?{day:date.day}:{})}},materials:sources.map(s=>({kind:s.kind,id:s.id})).filter((s,i,all)=>all.findIndex(t=>t.kind===s.kind&&t.id===s.id)===i),certainty:'source_assertion'};
  }
  ready.push({draftKey:row.draftKey,request:{kind,branchId:null,...(parentId?{parentId}:{}),data,sources},requiresReview:true,notes:['DRAFT only; a different reviewer must check source/current revision and facts before verification.',...(kind==='ALIAS'&&original.transliteration?['Editorial transliteration requires language review.']:[])]});
 }
 return {version:1 as const,draftsOnly:true as const,ready,blocked};
}
