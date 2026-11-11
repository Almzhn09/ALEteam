/** R-A04: citations from currently public CMS originals, using the shared byte/rights checks. */
import {Prisma} from '../generated/prisma/index.js';
import {db} from './db';
import {cmsFileText} from './cms-attachments';
import {resolveMaterial} from './discovery-materials';
import {digest} from './discovery-utils';
import {unsafeInstructions} from './assistant-safety';
import {sourceQueryTerms,sourceExcerpt} from './artur-discovery/source-excerpts';
import type {ContentLocale} from '../contracts/cms';
import type {GroundedAnswer} from './grounded-assistant';
export interface CmsFilePassage {id:string;fileId:string;materialId:string;materialRevision:string;locale:ContentLocale;isDemo:boolean;page?:number;title:string;text:string;href:string;fingerprint:string;isOcr:boolean}
function fingerprint(item:Awaited<ReturnType<typeof cmsFileText>>){return digest([item.sourceSha256,item.textSha256,item.fragments,item.ocr]);}
function readable(item:Awaited<ReturnType<typeof cmsFileText>>){
 if(!item.isOcr||item.corrected)return true;
 const confidence=item.confidence;
 return item.ocr.quality!=='low'&&typeof confidence==='number'&&Number.isFinite(confidence)&&(confidence>1?confidence/100:confidence)>=.85;
}
export async function retrieveCmsFilePassages(question:string,locale:ContentLocale):Promise<CmsFilePassage[]>{
 const terms=sourceQueryTerms(question);if(!terms.length||unsafeInstructions(question))return [];
 const haystack=Prisma.sql`lower((r.payload->>'title') || ' ' || a.name || ' ' || coalesce((a.parsed->'fragments')::text,''))`;
 const rows=await db.$queryRaw<{id:string;name:string;title:string;materialId:string;revisionId:string;parsed:Prisma.JsonValue}[]>(Prisma.sql`
  SELECT a.id,a.name,r.payload->>'title' AS title,i.id AS "materialId",r.id AS "revisionId",a.parsed FROM "CmsAttachment" a
  JOIN "ContentRevision" r ON r.id=a."revisionId" JOIN "ContentItem" i ON i.id=r."itemId"
  LEFT JOIN "ArchiveBranch" b ON b.id=i."branchId"
  WHERE a.state='PUBLISHED' AND a."reviewerId" IS NOT NULL AND a."reviewerId"<>a."uploaderId"
   AND r.status='PUBLISHED' AND r.locale=${locale} AND r."reviewerId" IS NOT NULL AND r."reviewerId"<>r."authorId"
   AND i.kind NOT IN ('SETTING','ARCHIVE_DOCUMENT') AND (i."branchId" IS NULL OR b."isPublic"=true)
   AND (${Prisma.join(terms.map(t=>Prisma.sql`${haystack} LIKE ${'%'+t+'%'}`),' AND ')})
  ORDER BY a.id ASC LIMIT 12`);
 const passages:CmsFilePassage[]=[];
 for(const row of rows){
  const parsed=row.parsed as {fragments?:{page?:number;text:string}[];publicationPages?:number[]};
  // Page selection may improve a long PDF excerpt, but never expands its declared public subset.
  const fragments=(parsed?.fragments??[]).filter(f=>!parsed.publicationPages||f.page!==undefined&&parsed.publicationPages.includes(f.page));
  const ranked=fragments.map(f=>({page:f.page,score:terms.reduce((n,t)=>n+(f.text.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
  const page=ranked[0]?.page;
  try{
   const text=await cmsFileText(row.id,page);
   if(!readable(text)||unsafeInstructions(text.text))continue;
   const material=await resolveMaterial({kind:'cms',id:row.materialId},locale,false);if(!material||material.eventRevision!==row.revisionId)continue;
   const actual=(row.title+'\n'+row.name+'\n'+text.text).toLowerCase();if(!terms.every(t=>actual.includes(t)))continue;
   passages.push({id:'cmsfile_'+row.id,fileId:row.id,materialId:row.materialId,materialRevision:material.source.revision,locale,isDemo:material.material.isDemo,...(page?{page}:{}),title:(row.title+' — '+row.name).slice(0,500),text:text.text,href:'/api/material-files/'+row.id+'/text'+(page?'?page='+page:''),fingerprint:fingerprint(text),isOcr:text.isOcr});
   if(passages.length===3)break;
  }catch(error){if((error as {status?:number}).status!==404)throw error;}
 }
 return passages;
}
export async function revalidateCmsFilePassages(passages:readonly CmsFilePassage[]){
 for(const p of passages){try{const current=await cmsFileText(p.fileId,p.page),parent=await resolveMaterial({kind:'cms',id:p.materialId},p.locale,false);if(parent?.source.revision!==p.materialRevision||fingerprint(current)!==p.fingerprint||!readable(current))return false;}catch(error){if((error as {status?:number}).status===404)return false;throw error;}}
 return true;
}
export function cmsFileAnswer(passages:readonly CmsFilePassage[],locale:ContentLocale,question:string):GroundedAnswer{
 const heading=locale==='en'?'Excerpts from published original files:':locale==='kk'?'Жарияланған түпнұсқа файлдардан үзінділер:':'Фрагменты опубликованных исходных файлов:';
 const ocr=passages.some(p=>p.isOcr)?'\n'+(locale==='en'?'Recognized text may contain errors; compare it with the original.':locale==='kk'?'Танылған мәтінде қате болуы мүмкін; түпнұсқамен салыстырыңыз.':'В распознанном тексте возможны ошибки; сравните с оригиналом.'):'';
 const demo=passages.some(p=>p.isDemo)?'\n'+(locale==='en'?'DEMO: fictional test material.':locale==='kk'?'ДЕМО: ойдан шығарылған сынақ материалы.':'ДЕМО: вымышленный тестовый материал.'):'';
 return {answer:(heading+ocr+demo+'\n\n'+passages.map(p=>p.title+'\n«'+sourceExcerpt(p.text,question).text+'»').join('\n\n')).slice(0,8000),sourceIds:passages.map(p=>p.id),noAnswer:passages.length===0,mode:'retrieval'};
}
