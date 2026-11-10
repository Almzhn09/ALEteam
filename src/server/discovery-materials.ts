import {db} from './db';
import {Prisma} from '../generated/prisma/index.js';
import {publicDocumentWhere,publicContentScope} from './public-visibility';
import {contentPayload} from './cms';
import {digest} from './discovery-utils';
import type {ContentLocale} from '../contracts/cms';
import type {MaterialKey,MaterialRef,SourceRef,CandidateSnapshot,ReasonCode} from '../contracts/discovery';
export interface ResolvedMaterial extends CandidateSnapshot {eventRevision:string}
export type ReadClient=Prisma.TransactionClient;
function selectLocale<T extends {locale:string}>(rows:T[],locale:ContentLocale,fallback:boolean){return rows.find(r=>r.locale===locale)??(fallback?(rows.find(r=>r.locale==='ru')??rows[0]):undefined);}
export async function resolveMaterial(key:MaterialKey,locale:ContentLocale,fallback=true,client:ReadClient=db):Promise<ResolvedMaterial|undefined>{
 if(key.kind==='document'){
  const d=await client.document.findFirst({where:{id:key.id,...publicDocumentWhere},include:{translations:{include:{revision:true}},fund:true}});if(!d)return;
  const eligible=d.translations.filter(t=>t.revision?t.revision.status==='PUBLISHED'&&!!t.revision.reviewerId&&t.revision.authorId!==t.revision.reviewerId&&t.revision.itemId===d.contentItemId:t.locale==='ru'&&t.title===d.title&&t.description===d.description);
  const t=selectLocale(eligible,locale,fallback);if(!t)return;
  const text=d.allowDigitalCopy?`${d.reference}\n${t.description}`:`${d.reference}\n${d.year}${d.yearTo?'–'+d.yearTo:''}`;
  const fingerprint=digest([d.id,t.locale,t.title,text,t.rights,d.allowDigitalCopy,t.revisionId,d.catalogVersion,d.isDemo]);
  const source:SourceRef={kind:'document',id:d.id,locale:t.locale as ContentLocale,revision:fingerprint,title:t.title,isDemo:d.isDemo,href:`/api/documents/${encodeURIComponent(d.id)}?locale=${t.locale}`};
  const material:MaterialRef={kind:'document',id:d.id,href:source.href,title:t.title,contentLocale:source.locale,availableLocales:eligible.map(t=>t.locale as ContentLocale).sort(),translationStatus:source.locale===locale?'published':'original',isDemo:d.isDemo,yearFrom:d.year,yearTo:d.yearTo??d.year,reason:{code:'editorial',text:'',evidence:[]}};
  return {material,source,text,fundId:d.fundId,topicIds:[],placeIds:[],eventRevision:t.revisionId??fingerprint};
 }
 const item=await client.contentItem.findFirst({where:{id:key.id,...publicContentScope,kind:{notIn:['SETTING','ARCHIVE_DOCUMENT']}},include:{revisions:{where:{status:'PUBLISHED'},orderBy:{locale:'asc'}}}});if(!item)return;
 const eligible=item.revisions.filter(r=>r.reviewerId&&r.authorId!==r.reviewerId&&contentPayload.safeParse(r.payload).success);
 const r=selectLocale(eligible,locale,fallback);if(!r)return;
 const p=contentPayload.parse(r.payload),text=p.body.slice(0,10000),fingerprint=digest([r.id,r.locale,p,r.updatedAt.toISOString(),item.isDemo]);
 const source:SourceRef={kind:'cms',id:item.id,locale:r.locale as ContentLocale,revision:fingerprint,title:p.title,isDemo:item.isDemo,href:`/api/content/${encodeURIComponent(item.slug)}?locale=${r.locale}`};
 const material:MaterialRef={kind:'cms',id:item.id,href:source.href,title:p.title,contentLocale:source.locale,availableLocales:eligible.map(x=>x.locale as ContentLocale).sort(),translationStatus:source.locale===locale?'published':'original',isDemo:item.isDemo,...(p.yearFrom!==undefined?{yearFrom:p.yearFrom}:{}),...(p.yearTo!==undefined?{yearTo:p.yearTo}:{}),reason:{code:'editorial',text:'',evidence:[]}};
 return {material,source,text,topicIds:[],placeIds:[],eventRevision:r.id};
}
export async function resolveEvidence(refs:unknown,client:ReadClient=db):Promise<SourceRef[]|undefined>{
 if(!Array.isArray(refs)||refs.length===0||refs.length>20)return;
 const result:SourceRef[]=[];
 for(const ref of refs){
  if(!ref||typeof ref!=='object'||!['document','cms'].includes(ref.kind)||!['ru','kk','en'].includes(ref.locale)||typeof ref.id!=='string'||typeof ref.revision!=='string')return;
  const current=await resolveMaterial({kind:ref.kind,id:ref.id},ref.locale,false,client);if(!current||current.source.revision!==ref.revision)return;
  result.push(current.source);
 }
 return result;
}
export function reasonText(code:ReasonCode,locale:ContentLocale){
 const values:Record<ReasonCode,readonly string[]>={editorial:['Редакционная подборка','Редакторлық таңдау','Editorial selection'],chosen_topic:['Выбранная тема','Таңдалған тақырып','Chosen topic'],history:['По разрешённой истории просмотров','Рұқсат етілген қарау тарихы бойынша','Based on permitted viewing history'],same_place:['То же место','Сол орын','Same place'],same_person:['Тот же человек','Сол тұлға','Same person'],same_event:['То же событие','Сол оқиға','Same event'],same_fund:['Тот же фонд','Сол қор','Same fund'],text_similarity:['Сходство опубликованного текста','Жарияланған мәтіннің ұқсастығы','Published text similarity']};
 return values[code][locale==='ru'?0:locale==='kk'?1:2];
}
export function materialWithReason(snapshot:ResolvedMaterial,code:ReasonCode,evidence:SourceRef[],locale:ContentLocale){return {...snapshot.material,reason:{code,text:reasonText(code,locale),evidence}};}
