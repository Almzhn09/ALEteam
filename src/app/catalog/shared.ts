// Public, serializable URL state shared by the server page and client component.
// No database or other server-only imports belong in this module.
import type {SearchResult,FundDirectoryEntry,NewspaperEntry} from '@/contracts/real-content';

export const ARCHIVE_SCOPES=['all','cms','fund','newspaper','document'] as const;
export type ArchiveScope=typeof ARCHIVE_SCOPES[number];
export interface ArchiveParams {scope:ArchiveScope;q:string;entry:string;sort:'source'|'title';number:string;page:number;legacy:boolean}
export type ArchiveEntry=FundDirectoryEntry|NewspaperEntry;
type DirectoryPage={items:ArchiveEntry[];total:number;page:number;pageSize:number};
export type ArchiveResponse=SearchResult|DirectoryPage|{item:ArchiveEntry};
export type ArchiveInitial={data:SearchResult;single:null}|{data:null;single:ArchiveEntry};
interface QueryValues {get(name:string):string|null;has(name:string):boolean}
const legacyFilters=['fundId','type','reference','fundNumber','inventoryNumber','caseNumber','locality','placeId','nameMode','inventoryId','caseId','branchId','author','organization','originalLanguage','category','tag','yearFrom','yearTo','contentLang'];
export function archiveParams(params:QueryValues):ArchiveParams {
 const raw=params.get('scope');
 const scope=ARCHIVE_SCOPES.includes(raw as ArchiveScope)?raw as ArchiveScope:'all';
 const rawPage=params.get('page')??'';
 const page=/^\d{1,5}$/.test(rawPage)&&Number(rawPage)>=1&&Number(rawPage)<=10000?Number(rawPage):1;
 const entry=params.get('entry')??'';
 return {scope,q:(params.get('q')??'').trim().slice(0,100),entry:/^[a-zA-Z0-9_-]{1,80}$/.test(entry)?entry:'',sort:params.get('sort')==='title'?'title':'source',number:(params.get('number')??'').slice(0,100),page,legacy:params.get('advanced')==='1'||legacyFilters.some(key=>params.has(key))||['year_desc','year_asc'].includes(params.get('sort')??'')};
}
export function archiveKey(params:ArchiveParams,lang:string){return JSON.stringify([lang,params.scope,params.q,params.page,params.sort,params.number,params.entry]);}
export function archiveRequest(params:ArchiveParams,lang:string){
 const {scope,q,page,sort,number,entry}=params;
 if(scope==='fund'||scope==='newspaper'){
  const base='/directories/'+(scope==='fund'?'funds':'newspapers');
  return entry?base+'/'+encodeURIComponent(entry):base+'?'+new URLSearchParams({q,page:String(page),pageSize:'10',sort,...(scope==='fund'&&number?{number}:{})});
 }
 return '/search?'+new URLSearchParams({q,scope,locale:lang,page:String(page),pageSize:'10'});
}
export function archiveResult(response:ArchiveResponse,params:ArchiveParams,lang:string):ArchiveInitial {
 if('item'in response)return {data:null,single:response.item};
 return {single:null,data:'counts'in response?response:{...response,locale:lang,counts:{materials:0,funds:params.scope==='fund'?response.total:0,newspapers:params.scope==='newspaper'?response.total:0}}};
}
