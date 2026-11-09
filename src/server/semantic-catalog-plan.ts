// TZ-A07 hybrid planner: learned known subject routing + explicit, bounded metadata rules.
import type {CatalogFilters} from '../contracts/catalog';
import type {ContentLocale} from '../contracts/cms';
import dictionary from '../../data/artur/semantic-dictionary.json';
import candidate from '../../training/full-tz/models/query-model.json';
import {generateLocalQuery} from './local-model';
import {archiveSearchIntent} from './archive-search-intent';
import {unsafeInstructions} from './assistant-safety';
export interface SemanticPlan {
 handled:boolean;locale:ContentLocale;filters:CatalogFilters;localityVariants:string[];
 method:'rules'|'dictionary'|'local-model';clarification?:'period'|'unsafe'|'type';periodOnly:boolean;
}
const typePatterns:[RegExp,'PHOTO'|'MAP'|'LETTER'|'REPORT'][]=[
 [/(?<!\p{L})(?:фотограф\p{L}*|фото(?:лар\p{L}*)?|photos?|photographs?|фотосурет\p{L}*)(?!\p{L})/giu,'PHOTO'],
 [/(?<!\p{L})(?:карт[аыуе]|maps?)(?!\p{L})/giu,'MAP'],
 [/(?<!\p{L})(?:письм\p{L}*|хат(?:тар\p{L}*)?|letters?)(?!\p{L})/giu,'LETTER'],
 [/(?<!\p{L})(?:отч[её]т\p{L}*|есеп(?:тер\p{L}*)?|reports?)(?!\p{L})/giu,'REPORT'],
];
const placePattern=/(?<!\p{L})(?:усть[-\s]каменогорск(?:а|е|у|ом)?|ust[-\s]kamenogorsk|өскемен(?:нің|ге|де|нен|ді)?|oskemen|öskemen)(?!\p{L})/giu;
const fillers=new Set('найди найти найдите покажи покажите документы документ документов материал материалы что такое где когда какой какие как расскажи о об для мне за в на по до после с про пожалуйста есть ли год году года годов годы город города from in the of a an to between before after through please show find need want what where when which how about are is can you do documents document materials records record photos year years city town маған туралы керек бар ма құжат құжаттар құжаттарды құжаттары мәлімет ақпарат қала қаласының жылы жылға жылдан жыл жылдар дейін кейін ізде іздеп көрсет табу ал а and'.split(' '));
function stripPeriods(value:string){return value.replace(/(?<!\d)((?:18|19|20)\d)0\s*(?:[-–]?\s*(?:х|е)(?:\s+год\p{L}*)?|s|жылдар\p{L}*)(?!\d)/giu,' ').replace(/(?<!\d)(?:18|19|20)\d{2}(?!\d)/gu,' ');}
export function semanticCatalogPlan(question:string,locale:ContentLocale,useModel=false):SemanticPlan{
 if(question.length>4000)throw Error('Invalid question');
 const empty:SemanticPlan={handled:false,locale,filters:{locale,sort:'year_asc',pageSize:5},localityVariants:[],method:'rules',periodOnly:false};
 if(unsafeInstructions(question))return {...empty,handled:true,clarification:'unsafe'};
 let text=question;const filters:CatalogFilters={...empty.filters};
 const reference=text.match(/(?<![\p{L}\p{N}])DEMO-[\p{L}\p{N}_/-]{1,100}/iu)?.[0];
 if(reference){filters.reference=reference;text=text.replace(reference,' ');}
 for(const [key,pattern] of [
  ['fundNumber',/(?<!\p{L})(?:фонд\p{L}*|fonds?|funds?|қор\p{L}*)\s+([\p{N}][\p{L}\p{N}/_-]{0,79})/iu],
  ['inventoryNumber',/(?<!\p{L})(?:опись|описи|inventory|тізімдеме\p{L}*)\s+([\p{N}][\p{L}\p{N}/_-]{0,79})/iu],
  ['caseNumber',/(?<!\p{L})(?:дело|дела|case|іс)\s+([\p{N}][\p{L}\p{N}/_-]{0,79})/iu],
 ] as const){const match=text.match(pattern);if(match){filters[key]=match[1];text=text.replace(match[0],' ');}}
 text=text.normalize('NFKC');
 const temporal=archiveSearchIntent(text);const hasPeriod=/(?<!\d)(?:18|19|20)\d{2}(?!\d)/u.test(text);
 if(temporal.yearFrom!==undefined)filters.yearFrom=temporal.yearFrom;
 if(temporal.yearTo!==undefined)filters.yearTo=temporal.yearTo;
 const detectedTypes=new Set<string>();
 let residual=text;for(const [pattern,type] of typePatterns){pattern.lastIndex=0;if(pattern.test(text)){detectedTypes.add(type);if(!filters.type)filters.type=type;}pattern.lastIndex=0;residual=residual.replace(pattern,' ');}
 const negativeType=/(?<!\p{L})(?:не|кроме)\s+(?:фото|фотограф|карт|письм|отч[её]т)|(?<!\p{L})(?:not|except|exclude|excluding|without)\s+(?:photos?|photographs?|maps?|letters?|reports?)|(?:фотосурет\p{L}*|карта\p{L}*|хат\p{L}*|есеп\p{L}*)\s+емес/iu.test(text);
 const typeConflict=detectedTypes.size>1||negativeType;if(typeConflict)delete filters.type;
 placePattern.lastIndex=0;const place=placePattern.test(text);placePattern.lastIndex=0;residual=residual.replace(placePattern,' ');
 residual=stripPeriods(residual).toLowerCase();
 const labels:string[]=[];const translated:string[]=[];
 for(const topic of dictionary.topics){const pattern=new RegExp(`(?<!\\p{L})(?:${topic.pattern})(?!\\p{L})`,'giu');if(pattern.test(residual)){labels.push(topic.label);translated.push(topic.query[locale]);pattern.lastIndex=0;residual=residual.replace(pattern,' ');}}
 const extra=(residual.match(/[\p{L}\p{N}/_-]+/gu)??[]).filter(w=>w.length>1&&!fillers.has(w));
 const q=[...translated,...extra].slice(0,8).join(' ').slice(0,200);if(q)filters.q=q;
 let method:SemanticPlan['method']=labels.length?'dictionary':'rules';
 const modelTerm=extra.join(' ');
 // A finite trained vocabulary gates neural normalization; unknown places/topics remain literal constraints.
 if(useModel&&!labels.length&&dictionary.supportedModelTerms.includes(modelTerm)){
  const prediction=generateLocalQuery(modelTerm,candidate);const topic=dictionary.topics.find(t=>t.label===prediction.query);
  if(prediction.complete&&prediction.confidence>=0.8&&topic){labels.push(topic.label);filters.q=topic.query[locale];method='local-model';}
 }else if(useModel&&labels.length){const p=generateLocalQuery(question,candidate);if(p.complete&&p.confidence>=0.8&&labels.includes(p.query))method='local-model';}
 const numbers=filters.fundNumber||filters.inventoryNumber||filters.caseNumber;
 const handled=Boolean(detectedTypes.size||labels.length||reference||numbers||(place&&hasPeriod));
 const localityVariants=place?dictionary.places[0].filterVariants[locale]:[];
 if(localityVariants.length)filters.locality=localityVariants[0];
 return {handled,locale,filters,localityVariants,method,periodOnly:hasPeriod&&!detectedTypes.size&&!place&&!labels.length&&!reference&&!numbers&&!q,
  ...(temporal.periodAmbiguous?{clarification:'period' as const}:typeConflict?{clarification:'type' as const}:{})};
}
export function semanticConversationPlan(question:string,history:readonly {role:'user'|'assistant';content:string}[],locale:ContentLocale,useModel=false){
 const current=semanticCatalogPlan(question,locale,useModel);if(!current.periodOnly)return current;
 let focus:SemanticPlan|undefined;
 for(const turn of history.slice(-6)){
  if(turn.role!=='user')continue;
  const plan=semanticCatalogPlan(turn.content,locale,useModel);
  if(plan.clarification==='unsafe'){focus=undefined;continue;}
  if(plan.handled&&!plan.periodOnly)focus=plan;
  else if(!plan.periodOnly)focus=undefined;
 }
 if(!focus)return current;
 return {...focus,periodOnly:false,clarification:current.clarification,
  filters:{...focus.filters,yearFrom:current.filters.yearFrom,yearTo:current.filters.yearTo}};
}
// A bare subject may be an informational question. Keep reviewed CMS facts ahead of weak topic routing.
export function requiresCatalogEvidence(plan:SemanticPlan,question:string){
 const f=plan.filters;
 return Boolean(plan.clarification||f.type||f.locality||f.reference||f.yearFrom!==undefined||f.yearTo!==undefined||f.fundNumber||f.inventoryNumber||f.caseNumber||/(?<!\p{L})(?:документ\p{L}*|материал\p{L}*|құжат\p{L}*|documents?|records?|materials?)(?!\p{L})/iu.test(question));
}
