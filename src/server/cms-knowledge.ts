// TZ-A06: read current public, reviewed language versions; no stored index or private file expansion.
import {Prisma} from '../generated/prisma/index.js';
import {db} from './db';
import {contentPayload} from './cms';
import {unsafeInstructions} from './assistant-safety';
import type {ContentLocale} from '../contracts/cms';
export interface CmsPassage {id:string;title:string;text:string;isDemo:boolean;kind:'cms';href:string;revisionId:string;stamp:string}
const stop=new Set('расскажи покажи найти найди какой какая какие когда где как что это про для архив архива сайт сайта пожалуйста ма ме туралы қандай қайда қалай мен the a an is are of on in at for about where what when how tell show please find document documents records record material materials information there any have has can may me my need help archive archives site website get do want документ документы документа документов материалы материал сведения информация есть можно нужно нужны нужен покажите расскажите құжат құжаттар құжаттарды мұрағат мұрағаттың ақпарат мәлімет керек бар'.split(' '));
export function cmsQueryTerms(question:string){
 return [...new Set((question.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu)??[]).filter(w=>w.length>=3&&!stop.has(w)).map(w=>w.length>6?w.slice(0,6):w))].slice(0,8);
}
const visibleItem:Prisma.ContentItemWhereInput={kind:{not:'SETTING'},OR:[{branchId:null},{branch:{isPublic:true}}]};
function passage(row:{id:string;locale:string;payload:Prisma.JsonValue;reviewerId:string|null;authorId:string;updatedAt:Date;item:{slug:string;isDemo:boolean;kind:string}}):CmsPassage|undefined{
 if(!row.reviewerId||row.reviewerId===row.authorId)return undefined;
 const parsed=contentPayload.safeParse(row.payload);if(!parsed.success)return undefined;
 const p=parsed.data;
 const labels=row.locale==='en'?['Address','Phone','Email','Hours']:row.locale==='kk'?['Мекенжай','Телефон','Email','Жұмыс уақыты']:['Адрес','Телефон','Email','Часы работы'];
 const fields=row.item.kind==='BRANCH_PROFILE'?[p.address,p.phone,p.email,p.hours].flatMap((v,i)=>v?[`${labels[i]}: ${v}`]:[]):[];
 const text=[...fields,p.body].join('\n').slice(0,4000);
 if(unsafeInstructions(text)||unsafeInstructions(p.title))return undefined;
 return {id:`cms_${row.id}`,title:p.title,text,isDemo:row.item.isDemo,kind:'cms',href:`/api/content/${row.item.slug}?locale=${row.locale}`,revisionId:row.id,stamp:row.updatedAt.toISOString()};
}
export async function retrieveCmsPassages(question:string,locale:ContentLocale):Promise<CmsPassage[]>{
 if(unsafeInstructions(question))return [];
 const terms=cmsQueryTerms(question);if(!terms.length)return [];
 // Bind all text parameters; IDs/private payloads are not exposed to the model.
 const haystack=Prisma.sql`lower((r.payload->>'title') || ' ' || (r.payload->>'body') || ' ' || coalesce(r.payload->>'address','') || ' ' || coalesce(r.payload->>'phone','') || ' ' || coalesce(r.payload->>'email','') || ' ' || coalesce(r.payload->>'hours','') || CASE i.kind WHEN 'BRANCH_PROFILE' THEN ' адрес телефон контакты график часы работы филиал филиалы мекенжай байланыс филиалдар бөлімше address phone contacts hours branch branches' WHEN 'NEWS' THEN ' новости жаңалықтар news' WHEN 'EXHIBITION' THEN ' выставка көрме exhibition' WHEN 'COLLECTION' THEN ' коллекция жинақ collection' ELSE '' END)`;
 const matches=terms.map(t=>Prisma.sql`${haystack} LIKE ${'%'+t+'%'}`);
 const ids=await db.$queryRaw<{id:string}[]>(Prisma.sql`
  SELECT r.id FROM "ContentRevision" r JOIN "ContentItem" i ON i.id=r."itemId"
  LEFT JOIN "ArchiveBranch" b ON b.id=i."branchId"
  WHERE r.status='PUBLISHED' AND r.locale=${locale} AND r."reviewerId" IS NOT NULL AND r."reviewerId"<>r."authorId"
   AND i.kind<>'SETTING' AND (i."branchId" IS NULL OR b."isPublic"=true)
   AND (${Prisma.join(matches,' AND ')})
  ORDER BY r."updatedAt" DESC,r.id ASC LIMIT 12`);
 if(!ids.length)return [];
 const rows=await db.contentRevision.findMany({where:{id:{in:ids.map(r=>r.id)},locale,status:'PUBLISHED',item:visibleItem},include:{item:true}});
 return ids.flatMap(({id})=>{const row=rows.find(r=>r.id===id);const p=row?passage(row):undefined;return p?[p]:[];}).slice(0,3);
}
export async function revalidateCmsPassages(passages:readonly CmsPassage[],locale:ContentLocale){
 if(!passages.length)return true;
 const rows=await db.contentRevision.findMany({where:{id:{in:passages.map(p=>p.revisionId)},locale,status:'PUBLISHED',item:visibleItem},include:{item:true}});
 return passages.every(p=>{const row=rows.find(r=>r.id===p.revisionId);const fresh=row?passage(row):undefined;return fresh?.stamp===p.stamp&&fresh.text===p.text&&fresh.title===p.title;});
}
