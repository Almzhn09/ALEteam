import {z} from 'zod';
import {db} from './db';
import {matchesSearchText} from './search-names';
import {publicContentScope,publicDocumentWhere} from './public-visibility';
import {resolveMaterial} from './discovery-materials';
import {directoryWhere,directoryDTO} from './reference-directory';
import {documentList} from './catalog';
import {contentPayload,kindSchema} from './cms';
import {json,queryParams,ApiError} from './http';
import type {MaterialKey} from '../contracts/discovery';
import type {SearchHit,SearchResult} from '../contracts/real-content';
export const materialQuery=z.object({q:z.string().trim().max(100).default(''),nameMode:z.enum(['literal','expanded']).default('expanded'),scope:z.enum(['all','document','cms','fund','newspaper']).default('all'),locale:z.enum(['ru','kk','en']).default('ru'),category:z.string().trim().max(100).optional(),contentKind:kindSchema.optional(),yearFrom:z.coerce.number().int().min(1).max(2100).optional(),yearTo:z.coerce.number().int().min(1).max(2100).optional(),page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).strict().refine(v=>v.yearFrom===undefined||v.yearTo===undefined||v.yearFrom<=v.yearTo);
export async function cmsMatchesFilters(key:MaterialKey,filters:Record<string,unknown>,locale:'ru'|'kk'|'en',fallback=false){
 if(key.kind!=='cms'||filters.scope==='document'||filters.type||filters.reference||filters.fundId||filters.fundNumber||filters.inventoryId||filters.inventoryNumber||filters.caseId||filters.caseNumber||filters.originalLanguage||filters.author||filters.organization||filters.locality||filters.placeId)return false;
 const material=await resolveMaterial(key,locale,fallback);if(!material)return false;
 const item=await db.contentItem.findUnique({where:{id:key.id},include:{revisions:{where:{status:'PUBLISHED',locale:material.source.locale}}}});if(!item||filters.branchId&&item.branchId!==filters.branchId||filters.contentKind&&filters.contentKind!==item.kind)return false;
 const revision=item.revisions[0];if(!revision)return false;const p=contentPayload.parse(revision.payload);
 if(filters.category&&filters.category!==p.category||filters.tag&&!p.tags.includes(String(filters.tag)))return false;
 const from=p.yearFrom??(p.date?Number(p.date.slice(0,4)):undefined),to=p.yearTo??from;
 if(filters.yearFrom!==undefined&&(to===undefined||to<Number(filters.yearFrom))||filters.yearTo!==undefined&&(from===undefined||from>Number(filters.yearTo)))return false;
 const text=(material.material.title+'\n'+material.text+'\n'+p.tags.join(' ')).toLocaleLowerCase();return matchesSearchText(text,String(filters.q??''),filters.nameMode==='literal'?'literal':'expanded');
}
export async function publicCmsKeys(locale:'ru'|'kk'|'en',fallback=false){
 const items=await db.contentItem.findMany({where:{...publicContentScope,kind:{notIn:['SETTING','ARCHIVE_DOCUMENT']},revisions:{some:{status:'PUBLISHED',...(fallback?{}:{locale})}}},select:{id:true},orderBy:{id:'asc'},take:1001});
 if(items.length>1000)throw new ApiError(503,'DISCOVERY_CORPUS_LIMIT','Сервис временно недоступен.');return items.map(i=>({kind:'cms' as const,id:i.id}));
}
export async function materialSearch(request:Request){
 const p=materialQuery.parse(queryParams(request));const materials:SearchHit[]=[];
 if(['all','document'].includes(p.scope)&&!p.contentKind){
  const q=new URLSearchParams({q:p.q,nameMode:p.nameMode,locale:p.locale,pageSize:'50'});for(const key of ['category','yearFrom','yearTo'] as const)if(p[key]!==undefined)q.set(key,String(p[key]));
  for(let page=1;page<=20;page++){q.set('page',String(page));const result=await(await documentList(new Request('http://search.invalid/?'+q))).json();for(const row of result.items){const material=await resolveMaterial({kind:'document',id:row.id},p.locale,false);if(material)materials.push({kind:'material',material:material.material,snippet:material.text.slice(0,350)});}if(page*50>=result.total)break;if(page===20)throw new ApiError(503,'DISCOVERY_CORPUS_LIMIT','Сервис временно недоступен.');}
 }
 if(['all','cms'].includes(p.scope))for(const key of await publicCmsKeys(p.locale,true))if(await cmsMatchesFilters(key,{...p,scope:'cms'},p.locale,true)){const material=await resolveMaterial(key,p.locale,true);if(material)materials.push({kind:'material',material:material.material,snippet:material.text.slice(0,350)});}
 const eligibleRegistry=!p.category&&!p.contentKind&&p.yearFrom===undefined&&p.yearTo===undefined;
 const fundWhere=directoryWhere('fund',{q:p.q,nameMode:p.nameMode}),paperWhere=directoryWhere('newspaper',{q:p.q,nameMode:p.nameMode});
 const funds=eligibleRegistry&&['all','fund'].includes(p.scope)?await db.referenceEntry.count({where:fundWhere}):0,newspapers=eligibleRegistry&&['all','newspaper'].includes(p.scope)?await db.referenceEntry.count({where:paperWhere}):0;
 const total=materials.length+funds+newspapers,skip=(p.page-1)*p.pageSize,items=materials.slice(skip,skip+p.pageSize);let remaining=p.pageSize-items.length;
 if(remaining&&skip<materials.length+funds&&funds){const rows=await db.referenceEntry.findMany({where:fundWhere,include:{dataset:true},orderBy:[{datasetId:'asc'},{position:'asc'},{id:'asc'}],skip:Math.max(0,skip-materials.length),take:remaining});items.push(...rows.map(directoryDTO));remaining=p.pageSize-items.length;}
 if(remaining&&newspapers){const rows=await db.referenceEntry.findMany({where:paperWhere,include:{dataset:true},orderBy:[{position:'asc'},{id:'asc'}],skip:Math.max(0,skip-materials.length-funds),take:remaining});items.push(...rows.map(directoryDTO));}
 const result:SearchResult={items,total,page:p.page,pageSize:p.pageSize,locale:p.locale,counts:{materials:materials.length,funds,newspapers}};return json(result);
}
