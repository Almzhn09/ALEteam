import {createHash} from 'node:crypto';
import {documentList,publicDocument} from './catalog';
import {db} from './db';
import {unsafeInstructions} from './assistant-safety';
import type {ContentLocale} from '../contracts/cms';
import type {SemanticPlan} from './semantic-catalog-plan';
import type {GroundedAnswer} from './grounded-assistant';
export interface CatalogPassage {id:string;title:string;text:string;isDemo:boolean;kind:'document';locale:ContentLocale;href:string;digitalCopyAllowed:boolean;fingerprint:string;year:number}
function request(locale:ContentLocale){return new Request('http://catalog.invalid/?locale='+locale);}
async function source(id:string,locale:ContentLocale):Promise<CatalogPassage|undefined>{
 let d:Awaited<ReturnType<typeof publicDocument>>;
 try{d=await publicDocument(id,request(locale));}catch(error){if((error as {status?:number})?.status===404)return undefined;throw error;}
 const projection=await db.documentTranslation.findUnique({where:{documentId_locale:{documentId:id,locale}},include:{revision:true,document:{select:{isPublic:true,deletedAt:true,contentItemId:true,allowDigitalCopy:true,title:true,description:true}}}});
 if(!projection||!projection.document.isPublic||projection.document.deletedAt||projection.document.allowDigitalCopy!==d.allowDigitalCopy)return undefined;
 const revision=projection.revision;
 if(revision&&(revision.status!=='PUBLISHED'||!revision.reviewerId||revision.authorId===revision.reviewerId||revision.itemId!==projection.document.contentItemId))return undefined;
 // Only legacy RU snapshots may lack historical review metadata; never invent a reviewer/translation.
 if(!revision&&(locale!=='ru'||!d.allowDigitalCopy||projection.document.title!==projection.title||projection.document.description!==projection.description))return undefined;
 const labels=locale==='en'?['Reference','Period','Digital copy restricted; published metadata only.']:locale==='kk'?['Шифр','Кезең','Цифрлық көшірме шектелген; тек жарияланған метадеректер.']:['Шифр','Период','Доступ к цифровой копии ограничен; только опубликованные метаданные.'];
 const metadata=`${labels[0]}: ${d.reference}\n${labels[1]}: ${d.year}${d.yearTo!==null&&d.yearTo!==d.year?'–'+d.yearTo:''}`;
 const text=d.allowDigitalCopy?`${metadata}\n${d.description}`:`${metadata}\n${labels[2]}`;
 if(unsafeInstructions(d.title)||unsafeInstructions(text))return undefined;
 const fingerprint=createHash('sha256').update(JSON.stringify([id,locale,d.title,text,d.isDemo,d.rights,d.allowDigitalCopy,revision?.id??null])).digest('hex');
 return {id,title:d.title,text,isDemo:d.isDemo,kind:'document',locale,href:`/api/documents/${id}?locale=${locale}`,digitalCopyAllowed:d.allowDigitalCopy,fingerprint,year:d.year};
}
export async function retrieveSemanticCatalog(plan:SemanticPlan):Promise<CatalogPassage[]>{
 if(!plan.handled||plan.clarification)return [];
 const ids=new Set<string>();
 for(const locality of plan.localityVariants.length?plan.localityVariants:[undefined]){
  const params=new URLSearchParams();for(const [key,value] of Object.entries({...plan.filters,...(locality?{locality}:{})}))if(value!==undefined)params.set(key,String(value));
  // In-process call of the same public catalog implementation, not an HTTP/network request.
  const response=await documentList(new Request('http://catalog.invalid/?'+params));
  if(!response.ok)throw Error('Catalog unavailable');
  const result=await response.json();for(const row of result.items)ids.add(row.id);
 }
 const sources:CatalogPassage[]=[];
 for(const id of ids){const p=await source(id,plan.locale);if(!p)continue;
  if(plan.filters.reference){const current=await publicDocument(id,request(plan.locale));if(current.reference.toLowerCase()!==plan.filters.reference.toLowerCase())continue;}
  sources.push(p);
 }
 const terms=(plan.filters.q??'').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
 const score=(p:CatalogPassage)=>terms.reduce((n,t)=>n+(p.title.toLowerCase().includes(t)?2:0)+(p.text.toLowerCase().includes(t)?1:0),0);
 return sources.sort((a,b)=>score(b)-score(a)||a.year-b.year||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,3);
}
export async function revalidateCatalogSources(passages:readonly CatalogPassage[]){
 for(const p of passages){const current=await source(p.id,p.locale);if(current?.fingerprint!==p.fingerprint)return false;}
 return true;
}
export function semanticCatalogAnswer(passages:readonly CatalogPassage[],plan:SemanticPlan,local=false):GroundedAnswer{
 const mode=local&&(plan.method==='local-model'||plan.clarification==='unsafe')?'local-model':'retrieval';
 const locale=plan.locale;
 if(plan.clarification==='subject')return {answer:locale==='en'?'What subject would you like to research? Please name a place, institution, person or topic.':locale==='kk'?'Нені зерттегіңіз келеді? Орынды, мекемені, тұлғаны немесе тақырыпты көрсетіңіз.':'Что вы хотите исследовать? Назовите место, учреждение, человека или тему.',sourceIds:[],noAnswer:true,mode};
 if(plan.clarification==='place')return {answer:locale==='en'?'Please specify the place: Altay can mean a city or a wider region; multiple places also need clarification.':locale==='kk'?'Орынды нақтылаңыз: Алтай қала не кең өңір болуы мүмкін; бірнеше орынды да нақтылау қажет.':'Уточните место: Алтай может означать город или более широкий регион; несколько мест тоже требуют уточнения.',sourceIds:[],noAnswer:true,mode};
 if(plan.clarification==='type')return {answer:locale==='en'?'Please specify one document type; exclusions or multiple types need clarification.':locale==='kk'?'Бір құжат түрін нақтылаңыз; бірнеше түрді немесе алып тастауды нақтылау қажет.':'Уточните один тип документа: исключения и несколько типов требуют уточнения.',sourceIds:[],noAnswer:true,mode};
 if(plan.clarification){const answer=plan.clarification==='period'?(locale==='en'?'Please clarify one ordered date range.':locale==='kk'?'Бір дұрыс кезеңді нақтылаңыз.':'Уточните один непротиворечивый период.'):(locale==='en'?'I cannot override access rules or reveal secrets.':locale==='kk'?'Қол жеткізу ережелерін айналып өтуге немесе құпияларды ашуға болмайды.':'Не могу обходить правила доступа или раскрывать секреты.');return {answer,sourceIds:[],noAnswer:true,mode};}
 if(!passages.length)return {answer:locale==='en'?'No published catalog records match this query in the selected language.':locale==='kk'?'Таңдалған тілде осы сұрауға сәйкес жарияланған карточкалар табылмады.':'В выбранном языке нет опубликованных карточек по этому запросу.',sourceIds:[],noAnswer:true,mode};
 const heading=locale==='en'?'Published catalog evidence:':locale==='kk'?'Жарияланған каталог деректері:':'Опубликованные сведения каталога:';
 const demo=passages.some(p=>p.isDemo)?'\n'+(locale==='en'?'DEMO: fictional project materials, not historical evidence.':locale==='kk'?'ДЕМО: ойдан шығарылған оқу материалдары, тарихи деректер емес.':'ДЕМО: вымышленные учебные материалы, не исторические свидетельства.'):'';
 return {answer:(heading+demo+'\n\n'+passages.map(p=>`${p.title}\n«${p.text.slice(0,1500)}»`).join('\n\n')).slice(0,8000),sourceIds:passages.map(p=>p.id),noAnswer:false,mode};
}
