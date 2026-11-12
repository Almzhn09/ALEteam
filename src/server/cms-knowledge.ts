// TZ-A06: read current public, reviewed language versions; no stored index or private file expansion.
import {Prisma} from '../generated/prisma/index.js';
import {db} from './db';
import {contentPayload} from './cms';
import {unsafeInstructions} from './assistant-safety';
import type {ContentLocale} from '../contracts/cms';
import {branchContactExcerpt} from './artur-discovery/branch-contact';
import {sourceQueryTerms} from './artur-discovery/source-excerpts';
export interface CmsPassage {id:string;title:string;text:string;isDemo:boolean;kind:'cms';href:string;revisionId:string;stamp:string}
export function cmsQueryTerms(question:string){
 return sourceQueryTerms(question);
}
const visibleItem:Prisma.ContentItemWhereInput={kind:{notIn:['SETTING','ARCHIVE_DOCUMENT']},OR:[{branchId:null},{branch:{isPublic:true}}]};
function passage(row:{id:string;locale:string;payload:Prisma.JsonValue;reviewerId:string|null;authorId:string;updatedAt:Date;item:{slug:string;isDemo:boolean;kind:string}}):CmsPassage|undefined{
 if(!row.reviewerId||row.reviewerId===row.authorId)return undefined;
 const parsed=contentPayload.safeParse(row.payload);if(!parsed.success)return undefined;
 const p=parsed.data;
 const fields=row.item.kind==='BRANCH_PROFILE'?branchContactExcerpt(p,row.locale as ContentLocale):[];
 // Validate the entire source, not just its prefix. Long histories/calendars need
 // their later paragraphs available for verbatim query-focused quotations.
 const text=[...fields,p.body].join('\n');
 if(unsafeInstructions(text)||unsafeInstructions(p.title))return undefined;
 return {id:`cms_${row.id}`,title:p.title,text,isDemo:row.item.isDemo,kind:'cms',href:`/api/content/${row.item.slug}?locale=${row.locale}`,revisionId:row.id,stamp:row.updatedAt.toISOString()};
}
export async function retrieveCmsPassages(question:string,locale:ContentLocale):Promise<CmsPassage[]>{
 if(unsafeInstructions(question))return [];
 const terms=cmsQueryTerms(question);if(!terms.length)return [];
 // Bind all text parameters; IDs/private payloads are not exposed to the model.
 const haystack=Prisma.sql`lower((r.payload->>'title') || ' ' || (r.payload->>'body') || ' ' || coalesce(r.payload->>'address','') || ' ' || coalesce(r.payload->>'phone','') || ' ' || coalesce(r.payload->>'email','') || ' ' || coalesce(r.payload->>'hours','') || CASE WHEN r.payload ? 'address' THEN ' адрес мекенжай address контакты байланыс contacts' ELSE '' END || CASE WHEN r.payload ? 'phone' THEN ' телефон phone контакты байланыс contacts' ELSE '' END || CASE WHEN r.payload ? 'email' THEN ' email электронная почта контакты байланыс contacts' ELSE '' END || CASE WHEN r.payload ? 'hours' THEN ' график часы работы жұмыс уақыты hours' ELSE '' END || CASE i.kind WHEN 'BRANCH_PROFILE' THEN ' филиал филиалы филиалдар бөлімше branch branches' WHEN 'NEWS' THEN ' новости жаңалықтар news' WHEN 'EXHIBITION' THEN ' выставка көрме exhibition' WHEN 'COLLECTION' THEN ' коллекция жинақ collection' ELSE '' END)`;
 const matches=terms.map(t=>/^\d+$/u.test(t)?Prisma.sql`${haystack} ~ ${'(^|[^0-9])'+t+'([^0-9]|$)'}`:Prisma.sql`${haystack} LIKE ${'%'+t+'%'}`);
 const config=locale==='ru'?'russian':'simple';
 const relevance=Prisma.sql`ts_rank_cd(setweight(to_tsvector(${config}::regconfig,r.payload->>'title'),'A') || setweight(to_tsvector(${config}::regconfig,r.payload->>'body'),'B'),plainto_tsquery(${config}::regconfig,${question.slice(0,1000).toLowerCase()}))`;
 // Lowercased here: a database created with the C locale does not lowercase Cyrillic, so
 // "Когда" stayed a non-stopword query term and pushed the right page down the ranking.
 const ids=await db.$queryRaw<{id:string}[]>(Prisma.sql`
  SELECT r.id FROM "ContentRevision" r JOIN "ContentItem" i ON i.id=r."itemId"
  LEFT JOIN "ArchiveBranch" b ON b.id=i."branchId"
  WHERE r.status='PUBLISHED' AND r.locale=${locale} AND r."reviewerId" IS NOT NULL AND r."reviewerId"<>r."authorId"
   AND i.kind NOT IN ('SETTING','ARCHIVE_DOCUMENT') AND (i."branchId" IS NULL OR b."isPublic"=true)
   AND (${Prisma.join(matches,' AND ')})
  ORDER BY CASE WHEN ${terms.some(t=>['адрес','контак','работ','телефо'].includes(t))} AND i.kind='PAGE' AND (r.payload ? 'address' OR r.payload ? 'hours') THEN 1 ELSE 0 END DESC,${relevance} DESC,r."updatedAt" DESC,r.id ASC LIMIT 12`);
 if(!ids.length)return [];
 const rows=await db.contentRevision.findMany({where:{id:{in:ids.map(r=>r.id)},locale,status:'PUBLISHED',item:visibleItem},include:{item:true}});
 return ids.flatMap(({id})=>{const row=rows.find(r=>r.id===id);const p=row?passage(row):undefined;return p?[p]:[];}).slice(0,3);
}
export async function revalidateCmsPassages(passages:readonly CmsPassage[],locale:ContentLocale){
 if(!passages.length)return true;
 const rows=await db.contentRevision.findMany({where:{id:{in:passages.map(p=>p.revisionId)},locale,status:'PUBLISHED',item:visibleItem},include:{item:true}});
 return passages.every(p=>{const row=rows.find(r=>r.id===p.revisionId);const fresh=row?passage(row):undefined;return fresh?.stamp===p.stamp&&fresh.text===p.text&&fresh.title===p.title;});
}
