/** Public search evidence: CMS and holdings metadata are not invented archival scans. */
import {materialSearch} from './material-search';
import {resolveMaterial} from './discovery-materials';
import {db} from './db';
import {directoryDTO,directoryWhere} from './reference-directory';
import {digest} from './discovery-utils';
import {unsafeInstructions} from './assistant-safety';
import {sourceExcerpt} from './artur-discovery/source-excerpts';
import type {SemanticPlan} from './semantic-catalog-plan';
import type {ContentLocale} from '../contracts/cms';
import type {GroundedAnswer} from './grounded-assistant';
import type {SearchHit} from '../contracts/real-content';
export interface PublicSearchPassage {id:string;title:string;kind:'cms'|'fund'|'newspaper';href:string;locale:ContentLocale;recordId:string;fingerprint:string;text:string}
export function publicSearchQuery(plan:SemanticPlan){
 const f=plan.filters;
 // These constraints cannot be satisfied by a holdings row or a generic page.
 if(plan.clarification||f.reference||f.fundNumber||f.inventoryNumber||f.caseNumber||f.type||f.fundId||f.inventoryId||f.caseId||f.originalLanguage||f.author||f.organization||f.branchId)return;
 const q=[f.q,f.locality].filter(Boolean).join(' ').trim();
 if(!q||q.length>100||unsafeInstructions(q))return;
 return q;
}
async function source(hit:SearchHit,locale:ContentLocale,query:string):Promise<PublicSearchPassage|undefined>{
 if(hit.kind==='material'){
  if(hit.material.kind!=='cms')return;
  const snapshot=await resolveMaterial({kind:'cms',id:hit.material.id},locale,true);
  if(!snapshot||unsafeInstructions(snapshot.text)||unsafeInstructions(snapshot.material.title))return;
  return {id:'search_cms_'+snapshot.material.id,kind:'cms',recordId:snapshot.material.id,title:snapshot.material.title,href:snapshot.source.href,locale:snapshot.source.locale,fingerprint:snapshot.source.revision,text:sourceExcerpt(snapshot.text,query,450).text};
 }
 const row=await db.referenceEntry.findFirst({where:{id:hit.id,...directoryWhere(hit.kind,{q:''})},include:{dataset:true}});if(!row)return;
 const entry=directoryDTO(row);if(unsafeInstructions(JSON.stringify(entry)))return;
 return {id:entry.id,recordId:entry.id,kind:entry.kind,title:entry.kind==='fund'?`${entry.number} — ${entry.names[0]?.name??entry.source.title}`:entry.title,href:entry.href,locale,fingerprint:digest(entry),text:entry.kind==='fund'?entry.names.slice(0,2).map(n=>n.name+(n.periodOriginal?' — '+n.periodOriginal:'')).join('\n'):`${entry.yearsOriginal}\n${entry.publisherOriginal}`};
}
export async function retrievePublicSearchPassages(plan:SemanticPlan){
 const q=publicSearchQuery(plan);if(!q)return [];
 const results=await Promise.all((['cms','fund','newspaper'] as const).map(async scope=>{
  const params=new URLSearchParams({q,scope,locale:plan.locale,pageSize:'1'});for(const key of ['category','yearFrom','yearTo'] as const)if(plan.filters[key]!==undefined)params.set(key,String(plan.filters[key]));
  const response=await materialSearch(new Request('http://search.invalid/?'+params));const data=await response.json();return data.items as SearchHit[];
 }));
 const passages=await Promise.all(results.flat().map(hit=>source(hit,plan.locale,q)));return passages.filter((p):p is PublicSearchPassage=>!!p);
}
export async function revalidatePublicSearchPassages(passages:readonly PublicSearchPassage[]){
 for(const p of passages){
  if(p.kind==='cms'){const current=await resolveMaterial({kind:'cms',id:p.recordId},p.locale,false);if(current?.source.revision!==p.fingerprint)return false;}
  else{const row=await db.referenceEntry.findFirst({where:{id:p.recordId,...directoryWhere(p.kind,{q:''})},include:{dataset:true}});if(!row||digest(directoryDTO(row))!==p.fingerprint)return false;}
 }
 return true;
}
export function publicSearchAnswer(passages:readonly PublicSearchPassage[],locale:ContentLocale):GroundedAnswer{
 const words=locale==='kk'?{intro:'Бұл сұрау бойынша жеке архив құжатының карточкасы табылмады. Бірақ жарияланған материалдар мен анықтамалық жазбалар бар:',cms:'Сайт материалы',fund:'Қор анықтамалығы',newspaper:'Газеттер анықтамалығы',note:'Анықтамалық жазба сканның бар екенін білдірмейді. Қолжетімді файлдарды көру үшін дереккөзді ашыңыз.'}:locale==='en'?{intro:'I found no individual archival document card for this query, but there are related published materials and directory records:',cms:'Site material',fund:'Fonds directory',newspaper:'Newspaper directory',note:'A directory record does not establish that a scan exists. Open the source to see available files.'}:{intro:'Отдельных карточек архивных документов по этому запросу не нашёл. Но есть связанные опубликованные материалы и справочные записи:',cms:'Материал сайта',fund:'Справочник фондов',newspaper:'Справочник газет',note:'Справочная запись не означает наличие скана. Откройте источник, чтобы увидеть доступные файлы.'};
 return {answer:[words.intro,...passages.map(p=>`${words[p.kind]}: ${p.title}\n«${p.text}»`),words.note].join('\n\n').slice(0,8000),sourceIds:passages.map(p=>p.id),noAnswer:!passages.length,mode:'retrieval'};
}
