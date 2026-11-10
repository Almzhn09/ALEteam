import {z} from 'zod';
import pack from '../../../data/artur/discovery/places.json';
import type {EngineLocale} from './types';
const alias=z.object({name:z.string().min(1).max(100),locale:z.enum(['ru','kk','en']),forms:z.array(z.string().min(1).max(100)).max(12),historical:z.boolean(),transliteration:z.boolean()});
const entity=z.object({id:z.string().regex(/^[a-z0-9-]+$/),name:z.object({ru:z.string(),kk:z.string(),en:z.string()}),aliases:z.array(alias).max(20),ambiguousNames:z.array(z.string()).max(15),evidence:z.array(z.object({sourceId:z.string(),path:z.string(),sha256:z.string().length(64),line:z.number().int().positive(),quote:z.string()})).min(1)});
export const discoveryPlaces=z.array(entity).max(100).parse(pack.records);
export type AliasEntity=Omit<z.infer<typeof entity>,'evidence'>&{evidence:{sourceId:string}[]};
export interface NameExpansion {status:'none'|'resolved'|'ambiguous'|'literal';entityIds:string[];matches:{entityId:string;input:string;canonicalName:string;transliteration:boolean;sourceIds:string[]}[];variants:string[];normalizedQuestion:string}
const norm=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[‐‑‒–—]/gu,'-');
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
export function expandNames(question:string,locale:EngineLocale,options:{mode?:'literal'|'expanded';entityId?:string;entities?:readonly AliasEntity[]}={}):NameExpansion{
 if(question.length>4000)throw Error('NAME_QUERY_TOO_LONG');
 const empty:NameExpansion={status:options.mode==='literal'?'literal':'none',entityIds:[],matches:[],variants:[],normalizedQuestion:question};
 if(options.mode==='literal')return empty;
 const normalized=normalizedOffsets(question);const input=normalized.text;const entities=options.entities??discoveryPlaces;
 if(entities.length>100)throw Error('TOO_MANY_ALIAS_ENTITIES');
 if(options.entityId&&!entities.some(e=>e.id===options.entityId))throw Error('UNKNOWN_PLACE_ID');
 const matches:NameExpansion['matches']=[];const positions:{start:number;end:number;entityId:string}[]=[];let ambiguous=false;
 for(const e of entities){if(options.entityId&&e.id!==options.entityId)continue;
  for(const a of e.aliases){for(const name of [a.name,...a.forms]){
   const pattern=new RegExp(`(?<![\\p{L}\\p{N}])${escape(norm(name)).replaceAll(' ','[-\\s]+')}(?![\\p{L}\\p{N}])`,'gu');
   for(const m of input.matchAll(pattern)){
    const normalizedStart=m.index!;const normalizedEnd=normalizedStart+m[0].length;
    const start=normalized.starts[normalizedStart],end=normalized.ends[normalizedEnd-1];
    if(positions.some(p=>p.entityId===e.id&&start>=p.start&&end<=p.end))continue;
    // "Altay" can mean a city, district or wider region. An explicit selected city resolves it.
    const cityContext=/(?:город(?:а|е|у|ом)?|г\.|қала\p{L}*|city|town)\s*$/iu.test(input.slice(Math.max(0,normalizedStart-30),normalizedStart))||/^\s*(?:қала\p{L}*|city|town)/iu.test(input.slice(normalizedEnd,normalizedEnd+25));
    if(!options.entityId&&!cityContext&&e.ambiguousNames.some(n=>norm(n)===m[0]))ambiguous=true;
    matches.push({entityId:e.id,input:question.slice(start,end),canonicalName:e.name[locale],transliteration:a.transliteration,sourceIds:[...new Set(e.evidence.map(s=>s.sourceId))]});
    positions.push({start,end,entityId:e.id});
   }
  }}
 }
 const entityIds=[...new Set(matches.map(m=>m.entityId))];
 if(!matches.length)return options.entityId?{...empty,status:'resolved',entityIds:[options.entityId],variants:variantsFor(entities.find(e=>e.id===options.entityId)!)}:empty;
 if(entityIds.length>1)ambiguous=true;
 const sorted=positions.filter((p,i)=>positions.findIndex(x=>x.start===p.start&&x.end===p.end)===i).sort((a,b)=>b.start-a.start);let cleaned=question;
 for(const p of sorted)cleaned=cleaned.slice(0,p.start)+' '+cleaned.slice(p.end);
 // Remove grammatical city labels left by stripping the actual name, never archive references.
 cleaned=cleaned.replace(/(?<!\p{L})(?:город(?:а|е|у|ом)?|г\.|қала(?:сы|сында|сының)?|city|town)(?!\p{L})/giu,' ').replace(/\s+/gu,' ').trim();
 return {status:ambiguous?'ambiguous':'resolved',entityIds,matches,variants:ambiguous?[]:variantsFor(entities.find(e=>e.id===entityIds[0])!),normalizedQuestion:cleaned};
}
function variantsFor(e:AliasEntity){return [...new Set(e.aliases.flatMap(a=>[a.name,...a.forms.filter(f=>a.transliteration||f.includes(' '))]))].slice(0,8);}

function normalizedOffsets(text:string){
 let normalized='';const starts:number[]=[],ends:number[]=[];
 for(const part of new Intl.Segmenter('und',{granularity:'grapheme'}).segment(text)){
  const value=norm(part.segment);normalized+=value;for(let i=0;i<value.length;i++){starts.push(part.index);ends.push(part.index+part.segment.length);}
 }
 return {text:normalized,starts,ends};
}
