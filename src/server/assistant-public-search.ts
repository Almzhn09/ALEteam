/** Cross-corpus city lookup. All retrieval and final validation use public read policies. */
import {materialSearch} from './material-search';
import {resolveMaterial} from './discovery-materials';
import {directoryWhere,directoryDTO} from './reference-directory';
import {db} from './db';
import {digest} from './discovery-utils';
import {expandNames} from './artur-discovery/names';
import {normalizePlaceSpelling} from './search-names';
import {unsafeInstructions} from './assistant-safety';
import type {SemanticPlan} from './semantic-catalog-plan';
export interface PublicSearchSource {id:string;kind:'cms'|'fund'|'newspaper';title:string;href:string;locale:string;isDemo:boolean;key:string;stamp:string}
export async function publicCitySources(question:string,plan:SemanticPlan):Promise<PublicSearchSource[]>{
 const f=plan.filters;if(plan.clarification||unsafeInstructions(question)||f.reference||f.fundNumber||f.inventoryNumber||f.caseNumber||f.type||f.author||f.organization||f.originalLanguage||f.branchId||f.fundId||f.tag)return [];
 const names=expandNames(normalizePlaceSpelling(question),plan.locale);if(names.status!=='resolved')return [];
 const q=[f.q,names.variants[0]].filter(Boolean).join(' ');
 const pages=await Promise.all(['cms','fund','newspaper'].map(async scope=>{
  const params=new URLSearchParams({q,scope,locale:plan.locale,pageSize:'2'});for(const key of ['yearFrom','yearTo','category']as const)if(f[key]!==undefined)params.set(key,String(f[key]));
  return (await(await materialSearch(new Request('http://internal.invalid/api/search?'+params))).json()).items;
 }));
 const result:PublicSearchSource[]=[];
 for(const hit of pages.flat()){
  if(unsafeInstructions(JSON.stringify(hit)))continue;
  if(hit.kind==='material'){
   const item=await resolveMaterial({kind:'cms',id:hit.material.id},hit.material.contentLocale,false);if(!item)continue;
   result.push({id:'cms_'+item.eventRevision,key:item.material.id,kind:'cms',title:item.material.title,href:item.source.href,locale:item.source.locale,isDemo:!!item.source.isDemo,stamp:item.source.revision});
  }else result.push({id:hit.id,key:hit.id,kind:hit.kind,title:hit.kind==='fund'?`${hit.number} — ${hit.names[0]?.name??hit.source.title}`:hit.title,href:hit.href,locale:'ru',isDemo:false,stamp:digest(hit)});
 }
 return result.slice(0,5);
}
export async function validatePublicCitySources(sources:PublicSearchSource[]){
 const checks=await Promise.all(sources.map(async s=>{
  if(s.kind==='cms'){const current=await resolveMaterial({kind:'cms',id:s.key},s.locale as 'ru'|'kk'|'en',false);return current?.source.revision===s.stamp;}
  const row=await db.referenceEntry.findFirst({where:{id:s.key,...directoryWhere(s.kind,{q:''})},include:{dataset:true}});return !!row&&digest(directoryDTO(row))===s.stamp;
 }));return checks.every(Boolean);
}
export function publicCityAnswer(sources:PublicSearchSource[],locale:string){
 const title=locale==='kk'?'Жарияланған материалдар мен анықтамалықтардан табылған мәліметтер:':locale==='en'?'Matches in published materials and directories:':'Найдены сведения в опубликованных материалах и справочниках:';
 const note=locale==='kk'?'Қорлар мен газеттердің сипаттамалары цифрлық көшірмелер емес.':locale==='en'?'Fonds and newspaper descriptions are metadata, not digital copies.':'Описания фондов и газет — справочные сведения, а не цифровые копии документов.';
 return {answer:title+'\n\n'+sources.map(s=>s.title).join('\n')+'\n\n'+note,sourceIds:sources.map(s=>s.id),noAnswer:false,mode:'retrieval' as const};
}
