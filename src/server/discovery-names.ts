import {liveFacts,localLabel} from './discovery-facts';
import {boundedPage} from './discovery-utils';
import {json,queryParams} from './http';
import {z} from 'zod';
import type {ContentLocale} from '../contracts/cms';
import type {AliasRef,NameExpansion} from '../contracts/discovery';
export async function checkedAliases(locale:ContentLocale){
 const places=await liveFacts('PLACE'),aliases=await liveFacts('ALIAS');
 const groups:AliasRef[]=[];
 for(const place of places){
  const label=localLabel((place.data as {labels:unknown}).labels,locale);
  groups.push({entityId:place.id,canonicalName:label.value.title,ambiguity:false,aliases:aliases.filter(a=>a.parentId===place.id).map(a=>{const d=a.data as {name:string;locale:ContentLocale;validFrom?:number;validTo?:number};return {...d,sources:a.evidence,status:'VERIFIED' as const};})});
 }
 return groups;
}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().trim();
export async function expandCatalogNames(input:{q?:string;locality?:string;placeId?:string;nameMode?:'literal'|'expanded';yearFrom?:number;yearTo?:number},locale:ContentLocale):Promise<NameExpansion & {allowedDocumentIds?:string[]}>{
 const mode=input.nameMode??'literal';const empty:NameExpansion={mode,applied:false,variants:[],entityIds:[],clarificationRequired:false,sources:[]};
 if(mode==='literal'&&!input.placeId)return empty;
 const aliases=await checkedAliases(locale),needle=normalize(input.locality??input.q??'');
 const found=aliases.filter(g=>input.placeId?g.entityId===input.placeId:normalize(g.canonicalName)===needle||g.aliases.some(a=>normalize(a.name)===needle));
 if(found.length!==1)return {...empty,entityIds:found.map(g=>g.entityId),clarificationRequired:found.length>1||!!input.placeId};
 const group=found[0];const applicable=group.aliases.filter(a=>(input.yearFrom===undefined||a.validTo===undefined||a.validTo>=input.yearFrom)&&(input.yearTo===undefined||a.validFrom===undefined||a.validFrom<=input.yearTo));
 const variants=mode==='literal'?[group.canonicalName]:[...new Set([group.canonicalName,...applicable.map(a=>a.name)])].slice(0,8);
 let allowedDocumentIds:string[]|undefined;
 if(input.placeId){const curated=await liveFacts('EDITORIAL'),history=await liveFacts('HISTORY');allowedDocumentIds=[...new Set([...curated.flatMap(r=>{const d=r.data as {placeId?:string;material:{kind:string;id:string}};return d.placeId===input.placeId&&d.material.kind==='document'?[d.material.id]:[];}),...history.filter(r=>r.parentId===input.placeId).flatMap(r=>(r.data as {materials:{kind:string;id:string}[]}).materials.filter(k=>k.kind==='document').map(k=>k.id))])];}
 return {...(allowedDocumentIds?{allowedDocumentIds}:{}),mode,applied:mode==='expanded',variants,entityIds:[group.entityId],clarificationRequired:false,sources:applicable.flatMap(a=>a.sources).filter((s,i,all)=>all.findIndex(x=>x.kind===s.kind&&x.id===s.id&&x.revision===s.revision)===i)};
}
export async function aliasList(request:Request){
 const p=boundedPage.omit({cursor:true}).extend({q:z.string().trim().max(200).default(''),entityType:z.literal('place').optional()}).strict().parse(queryParams(request));
 const groups=await checkedAliases(p.locale);const q=normalize(p.q);
 const matches=groups.filter(g=>!q||normalize(g.canonicalName).includes(q)||g.aliases.some(a=>normalize(a.name).includes(q)));
 const items=matches.slice(0,p.limit).map(g=>({...g,ambiguity:matches.some(other=>other.entityId!==g.entityId&&[g.canonicalName,...g.aliases.map(a=>a.name)].some(name=>[other.canonicalName,...other.aliases.map(a=>a.name)].some(n=>normalize(n)===normalize(name))))}));
 return json({items,locale:p.locale});
}
