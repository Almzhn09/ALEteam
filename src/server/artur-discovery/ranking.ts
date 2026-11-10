import {z} from 'zod';
import topics from '../../../data/artur/discovery/topics.json';
import {unsafeInstructions} from '../assistant-safety';
import {materialListSchema,eligible,sourceRef,compareIds,type EngineLocale,type EngineMaterial,type NormalizedMaterial,type EngineRankedItem,type ReasonCode} from './types';
const knownTopics=new Set(topics.records.map(t=>t.id));
const words=(s:string)=>new Set((s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[]).filter(w=>!['документ','документы','история','материал','материалы','архив','document','documents','history','archive','құжат','тарихы'].includes(w)));
function active(input:readonly EngineMaterial[],locale:EngineLocale){const all=materialListSchema.parse(input).filter(m=>eligible(m,locale)&&!unsafeInstructions(m.title));
 if(new Set(all.map(m=>m.id)).size!==all.length)throw Error('DUPLICATE_MATERIAL_SNAPSHOT');
 return all;
}
const labels:Record<ReasonCode,Record<EngineLocale,string>>={
 same_place:{ru:'В опубликованных описаниях указано одно место',kk:'Жарияланған сипаттамаларда бір орын көрсетілген',en:'The published descriptions identify the same place'},
 same_person:{ru:'В описаниях указан один человек',kk:'Сипаттамаларда бір тұлға көрсетілген',en:'The descriptions identify the same person'},
 same_event:{ru:'Материалы отнесены к одному событию',kk:'Материалдар бір оқиғаға қатысты',en:'The materials are linked to the same event'},
 same_fund:{ru:'Материалы из одного фонда',kk:'Материалдар бір қордан',en:'Materials from the same fund'},
 text_similarity:{ru:'Похожие слова в разрешённых описаниях; историческая связь не подтверждена',kk:'Рұқсат етілген сипаттамалардағы ұқсас сөздер; тарихи байланыс расталмаған',en:'Similar wording in permitted descriptions; a historical connection is not established'},
 interests:{ru:'Соответствует выбранным вами темам',kk:'Сіз таңдаған тақырыптарға сәйкес',en:'Matches the topics you selected'},
 history:{ru:'Связано с просмотренными вами открытыми материалами',kk:'Сіз көрген ашық материалдарға байланысты',en:'Related to public materials you viewed'},
 editorial:{ru:'Редакционная подборка, без персонализации',kk:'Жекелендірусіз редакциялық топтама',en:'Editorial selection without personalization'},
 popular:{ru:'По реальным агрегированным просмотрам за указанный период',kk:'Көрсетілген кезеңдегі нақты жиынтық қаралымдар бойынша',en:'Based on measured aggregate views in the stated period'},
};
function output(m:NormalizedMaterial,code:ReasonCode,score:number,evidence:NormalizedMaterial[]=[]):EngineRankedItem{return {id:m.id,kind:m.kind,locale:m.locale,revision:m.revision,title:m.title,href:m.href,isDemo:m.isDemo,score:Math.round(score*1000)/1000,reason:{code,text:labels[code][m.locale],evidence:evidence.map(sourceRef)}};}
function boundedLimit(limit:number){return z.number().int().min(1).max(20).parse(limit);}
export function rankRelated(targetId:string,input:readonly EngineMaterial[],locale:EngineLocale,limit=5):EngineRankedItem[]{
 boundedLimit(limit);const all=active(input,locale);const target=all.find(m=>m.id===targetId);if(!target)return [];
 const visibleIds=new Set(all.map(m=>m.id));const verified=(m:NormalizedMaterial)=>m.facts.filter(f=>f.verified&&f.sourceIds.length>0&&f.sourceIds.every(id=>visibleIds.has(id)));
 const baseFacts=verified(target);const baseWords=words(target.title+(target.textAllowed?' '+target.description:''));
 return all.filter(m=>m.id!==targetId).map(m=>{
  const common=verified(m).filter(f=>baseFacts.some(b=>b.kind===f.kind&&b.id===f.id));
  const priority=['event','person','place','fund'] as const;const strongest=priority.find(k=>common.some(f=>f.kind===k));
  if(strongest){const f=common.find(f=>f.kind===strongest)!;const b=baseFacts.find(b=>b.kind===strongest&&b.id===f.id)!;
   const refs=[...new Set([...f.sourceIds,...b.sourceIds])].map(id=>all.find(s=>s.id===id)!);
   return output(m,('same_'+strongest) as ReasonCode,10-priority.indexOf(strongest),refs);
  }
  const other=words(m.title+(m.textAllowed?' '+m.description:''));const overlap=[...baseWords].filter(w=>other.has(w)).length;const score=overlap/Math.max(1,Math.sqrt(baseWords.size*other.size));
  return overlap>=2&&score>=.15?output(m,'text_similarity',score,[target,m]):null;
 }).filter((r):r is EngineRankedItem=>r!==null).sort((a,b)=>b.score-a.score||compareIds(a.id,b.id)).slice(0,limit);
}
const profileSchema=z.object({personalizationEnabled:z.boolean(),historyEnabled:z.boolean(),topicIds:z.array(z.string().max(120)).max(30),viewedIds:z.array(z.string().max(120)).max(100)}).strict();
export type RecommendationProfile=z.infer<typeof profileSchema>;
export function rankRecommendations(input:readonly EngineMaterial[],locale:EngineLocale,profile:RecommendationProfile,limit=3){
 boundedLimit(limit);const p=profileSchema.parse(profile);const all=active(input,locale);
 const selected=p.personalizationEnabled?new Set(p.topicIds.filter(t=>knownTopics.has(t))):new Set<string>();
 const viewed=p.personalizationEnabled&&p.historyEnabled?all.filter(m=>p.viewedIds.includes(m.id)):[];
 const historyTopics=new Set(viewed.flatMap(m=>m.topicIds).filter(t=>knownTopics.has(t)));
 const mode=selected.size?'interests':historyTopics.size?'history':'editorial';
 let candidates=all.map(m=>{
  const interest=[...new Set(m.topicIds)].filter(t=>selected.has(t)).length;const history=[...new Set(m.topicIds)].filter(t=>historyTopics.has(t)).length;
  const score=interest*3+history-(viewed.some(v=>v.id===m.id)?1:0);
  return {m,score,code:interest?'interests':history?'history':'editorial' as ReasonCode};
 });
 // Personal blocks contain genuine matches only; if no matches, disclose the editorial fallback.
 if(mode!=='editorial'&&candidates.some(c=>c.score>0))candidates=candidates.filter(c=>c.score>0);
 else return {mode:'editorial' as const,items:all.sort((a,b)=>(a.editorialRank??1000000)-(b.editorialRank??1000000)||compareIds(a.id,b.id)).slice(0,limit).map(m=>output(m,'editorial',0))};
 return {mode:(candidates.some(c=>c.code==='interests')?'interests':'history') as 'interests'|'history',items:candidates.sort((a,b)=>b.score-a.score||(a.m.editorialRank??1000000)-(b.m.editorialRank??1000000)||compareIds(a.m.id,b.m.id)).slice(0,limit).map(c=>output(c.m,c.code as ReasonCode,c.score))};
}
const aggregateSchema=z.object({status:z.literal('measured'),from:z.iso.datetime(),to:z.iso.datetime(),views:z.array(z.object({id:z.string().max(120),count:z.number().int().min(0).max(1000000000)}).strict()).max(2000)}).strict();
export function rankPopular(input:readonly EngineMaterial[],locale:EngineLocale,aggregate:unknown,limit=3){
 boundedLimit(limit);if(aggregate===null||aggregate===undefined)return {status:'unavailable' as const,items:[]};
 const a=aggregateSchema.parse(aggregate);if(Date.parse(a.from)>=Date.parse(a.to))throw Error('INVALID_POPULARITY_PERIOD');
 if(new Set(a.views.map(v=>v.id)).size!==a.views.length)throw Error('DUPLICATE_POPULARITY_ID');
 const all=active(input,locale);const counts=new Map(a.views.map(v=>[v.id,v.count]));
 return {status:'measured' as const,period:{from:a.from,to:a.to},items:all.filter(m=>(counts.get(m.id)??0)>0).sort((x,y)=>counts.get(y.id)!-counts.get(x.id)!||compareIds(x.id,y.id)).slice(0,limit).map(m=>output(m,'popular',counts.get(m.id)!))};
}
