/** R-A04: current public fonds/newspaper metadata, separate from archival documents. */
import {db} from './db';
import {directoryDTO,directoryWhere} from './reference-directory';
import {digest} from './discovery-utils';
import {unsafeInstructions} from './assistant-safety';
import type {ContentLocale} from '../contracts/cms';
import type {GroundedAnswer} from './grounded-assistant';
import type {FundDirectoryEntry,NewspaperEntry} from '../contracts/real-content';

export interface DirectoryIntent {kind:'fund'|'newspaper';number?:string;q:string}
export interface DirectoryPassage {id:string;kind:'fund'|'newspaper';title:string;href:string;fingerprint:string;entry:FundDirectoryEntry|NewspaperEntry}
export function directoryIntent(question:string):DirectoryIntent|undefined{
 if(question.length>1000||unsafeInstructions(question))return;
 const fund=/(?<!\p{L})(?:фонд(?:а|у|ом|ы|ов)?|қор(?:ы|ын|лар|лардан)?|fonds?|funds?)(?!\p{L})/iu.exec(question);
 const paper=/(?<!\p{L})(?:газет\p{L}*|newspapers?)(?!\p{L})/iu.exec(question);
 if(fund&&paper)return;
 if(fund){
  const tail=question.slice(fund.index+fund[0].length).trim().replace(/^(?:№|номер|number|no\.?)\s*/iu,'');
  const quoted=/^[«"“]([^»"”]{1,100})[»"”]/u.exec(tail);
  if(quoted){if(/^\s*(?:(?:и|and)(?!\p{L})|,)/iu.test(tail.slice(quoted[0].length)))return;return /\d/u.test(quoted[1])?{kind:'fund',number:quoted[1],q:''}:{kind:'fund',q:quoted[1]};}
  const literal=/^((?:[\p{L}]{1,3}[-–])?\d[\p{L}\p{N}._/-]*(?:\s+ч\.с\.)?)(?=$|\s|[?!])/iu.exec(tail);
  if(literal){if(/^\s*(?:(?:и|and)(?!\p{L})|,)/iu.test(tail.slice(literal[0].length)))return;return {kind:'fund',number:literal[1],q:''};}
  // Definitions stay with the site's glossary. A topic name is not a guessed number.
  if(!/что такое|деген|what is|explain|түсіндір|объясни/iu.test(question)&&tail&&!/^[:?.!]/u.test(tail)&&tail.length<=100)return {kind:'fund',q:tail.replace(/[?!]+$/u,'').trim()};
 }
 if(paper){
  const quoted=/[«"“]([^»"”]{1,100})[»"”]/u.exec(question);
  if(quoted)return {kind:'newspaper',q:quoted[1]};
  const tail=question.slice(paper.index+paper[0].length).trim().replace(/[?.!]+$/u,'');
  if(tail.length<=100&&!/^(?:хранятся|есть|имеются|are|do|stored|сақта)/iu.test(tail))return {kind:'newspaper',q:tail};
 }
 return;
}
function passage(entry:FundDirectoryEntry|NewspaperEntry):DirectoryPassage{
 return {id:entry.id,kind:entry.kind,title:entry.kind==='fund'?`${entry.number} — ${entry.names[0]?.name??entry.source.title}`:entry.title,href:entry.href,fingerprint:digest(entry),entry};
}
export async function retrieveDirectoryPassages(intent:DirectoryIntent){
 const where=directoryWhere(intent.kind,{q:intent.q});
 // Accounting characters and leading zeroes are literal. Only letter case may vary.
 if(intent.number!==undefined)where.number={equals:intent.number,mode:'insensitive'};
 const rows=await db.referenceEntry.findMany({where,include:{dataset:true},orderBy:[{datasetId:'asc'},{position:'asc'},{id:'asc'}],take:3});
 return rows.map(r=>passage(directoryDTO(r))).filter(p=>!unsafeInstructions(JSON.stringify(p.entry)));
}
export async function revalidateDirectoryPassages(passages:readonly DirectoryPassage[]){
 for(const p of passages){
  const row=await db.referenceEntry.findFirst({where:{id:p.id,...directoryWhere(p.kind,{q:''})},include:{dataset:true}});
  if(!row||digest(directoryDTO(row))!==p.fingerprint)return false;
 }
 return true;
}
export function directoryAnswer(passages:readonly DirectoryPassage[],locale:ContentLocale):GroundedAnswer{
 const words=locale==='kk'?{heading:'Анықтамалықтағы мәліметтер (түпнұсқа тілінде):',number:'Қор нөмірі',names:'Атаулар',years:'Жылдар',edition:'Дереккөз нұсқасы',rows:'Газеттердің сақталуы туралы жолдар; цифрлық көшірмелер емес.',empty:'Ашық анықтамалықтан дәл осы нөмір не атау табылмады.'}:locale==='en'?{heading:'Directory information (in its original language):',number:'Fonds number',names:'Source names',years:'Years',edition:'Source edition',rows:'Newspaper holdings rows; these are not digital copies.',empty:'No public directory entry matches that exact identifier or title.'}:{heading:'Сведения справочника (на языке источника):',number:'Номер фонда',names:'Названия в источнике',years:'Годы',edition:'Версия источника',rows:'Строки хранения газет; цифровые копии выпусков не представлены.',empty:'В открытом справочнике нет записи с таким точным номером или названием.'};
 if(!passages.length)return {answer:words.empty,sourceIds:[],noAnswer:true,mode:'retrieval'};
 const lines=passages.map(p=>{
  const e=p.entry;
  const body=e.kind==='fund'?`${words.number}: ${e.number}\n${words.names}:\n`+e.names.slice(0,5).map(n=>`«${n.name}»${n.periodOriginal?' — '+n.periodOriginal:''}`).join('\n'):`«${e.title}»\n${words.years}: ${e.yearsOriginal}\n${e.publisherOriginal}\n${words.rows}`;
  return body+`\n${words.edition}: ${e.source.edition}\n${e.source.notes}`;
 });
 return {answer:(words.heading+'\n\n'+lines.join('\n\n')).slice(0,8000),sourceIds:passages.map(p=>p.id),noAnswer:false,mode:'retrieval'};
}
