// TZ-A07 hybrid planner: learned known subject routing + explicit, bounded metadata rules.
import type {CatalogFilters} from '../contracts/catalog';
import type {ContentLocale} from '../contracts/cms';
import dictionary from '../../data/artur/semantic-dictionary.json';
import candidate from '../../training/full-tz/models/query-model.json';
import {generateLocalQuery} from './local-model';
import {archiveSearchIntent} from './archive-search-intent';
import {unsafeInstructions} from './assistant-safety';
import {expandNames,type NameExpansion} from './artur-discovery/names';
import {normalizePlaceSpelling} from './search-names';
import {researchQuestion,stripResearchFraming} from './artur-discovery/research';
export interface SemanticPlan {
 handled:boolean;locale:ContentLocale;filters:CatalogFilters;localityVariants:string[];
 method:'rules'|'dictionary'|'local-model';clarification?:'period'|'unsafe'|'type'|'place'|'subject';periodOnly:boolean;nameExpansion?:NameExpansion;
}
const typePatterns:[RegExp,'PHOTO'|'MAP'|'LETTER'|'REPORT'][]=[
 [/(?<!\p{L})(?:фотограф\p{L}*|фото(?:лар\p{L}*)?|photos?|photographs?|фотосурет\p{L}*)(?!\p{L})/giu,'PHOTO'],
 [/(?<!\p{L})(?:карт[аыуе]|maps?)(?!\p{L})/giu,'MAP'],
 [/(?<!\p{L})(?:письм\p{L}*|хат(?:тар\p{L}*)?|letters?)(?!\p{L})/giu,'LETTER'],
 [/(?<!\p{L})(?:отч[её]т\p{L}*|есеп(?:тер\p{L}*)?|reports?)(?!\p{L})/giu,'REPORT'],
];
const fillers=new Set('найди найти найдите покажи покажите документы документ документов материал материалы что такое где когда какой какие как расскажи о об для мне за в на по до после с про пожалуйста есть ли год году года годов годы город города архивный архивтік archive from in the of a an to between before after through please show find need want what where when which how about are is can you do documents document materials records record photos year years city town маған туралы керек бар ма құжат құжаттар құжаттарды құжаттары мәлімет ақпарат қала қаласының жылы жылғы жылға жылдан жыл жылдар жылдардағы жылдары дейін кейін ізде іздеп көрсет табу ал а and'.split(' '));
const explicitCatalog=/(?<!\p{L})(?:документ\p{L}*|материал\p{L}*|құжат\p{L}*|documents?|records?|materials?)(?!\p{L})/iu;
function stripPeriods(value:string){return value.replace(/(?<![\p{L}\p{N}])(?<!\p{L}[-/])([12]\d{2})0\s*(?:[-–]?\s*(?:х|е)(?:\s+год\p{L}*)?|s|жылдар\p{L}*)(?!\d)/giu,' ').replace(/(?<![\p{L}\p{N}])(?<!\p{L}[-/])[12]\d{3}(?!\d)/gu,' ');}
export function semanticCatalogPlan(question:string,locale:ContentLocale,useModel=false):SemanticPlan{
 if(question.length>4000)throw Error('Invalid question');
 const empty:SemanticPlan={handled:false,locale,filters:{locale,sort:'year_asc',pageSize:5},localityVariants:[],method:'rules',periodOnly:false};
 if(unsafeInstructions(question))return {...empty,handled:true,clarification:'unsafe'};
 let text=question;const filters:CatalogFilters={...empty.filters};
 const quotedReference=text.match(/(?<!\p{L})(?:шифр|reference|ref)\s*[:№]?\s*(?:«([^»\r\n]{1,120})»|"([^"\r\n]{1,120})")/iu);
 const quotedReferenceValue=quotedReference?.[1]??quotedReference?.[2];
 const labelled=text.match(/(?<!\p{L})(?:шифр|reference|ref)(?:\s*[:№]\s*|\s+)([\p{L}\p{N}][\p{L}\p{N}./_-]{0,119})(?![\p{L}\p{N}./_-])/iu);
 const reference=quotedReferenceValue&&/\p{N}/u.test(quotedReferenceValue)?quotedReferenceValue:labelled&&/\p{N}/u.test(labelled[1])?labelled[1]:text.match(/(?<![\p{L}\p{N}])DEMO-[\p{L}\p{N}_/-]{1,100}(?![\p{L}\p{N}_/-])/iu)?.[0];
 if(reference){filters.reference=reference;text=text.replace(quotedReferenceValue===reference?quotedReference![0]:labelled?.[1]===reference?labelled[0]:reference,' ');}
 for(const [key,pattern] of [
  ['fundNumber',/(?<!\p{L})(?:фонд\p{L}*|fonds?|funds?|қор\p{L}*)\s+(?:№\s*)?([\p{L}\p{N}][\p{L}\p{N}./_-]{0,79})(?![\p{L}\p{N}./_-])/iu],
  ['inventoryNumber',/(?<!\p{L})(?:опись|описи|inventory|тізімдеме\p{L}*)\s+(?:№\s*)?([\p{L}\p{N}][\p{L}\p{N}./_-]{0,79})(?![\p{L}\p{N}./_-])/iu],
  ['caseNumber',/(?<!\p{L})(?:дело|дела|case|іс)\s+(?:№\s*)?([\p{L}\p{N}][\p{L}\p{N}./_-]{0,79})(?![\p{L}\p{N}./_-])/iu],
 ] as const){
  const label=key==='fundNumber'?'фонд\\p{L}*|fonds?|funds?|қор\\p{L}*':key==='inventoryNumber'?'опись|описи|inventory|тізімдеме\\p{L}*':'дело|дела|case|іс';
  const quoted=text.match(new RegExp(`(?<!\\p{L})(?:${label})\\s+(?:№\\s*)?(?:«([^»\\r\\n]{1,80})»|"([^"\\r\\n]{1,80})")`,'iu'));
  const literal=quoted?.[1]??quoted?.[2];
  const match=text.match(pattern);if(literal&&/\p{N}/u.test(literal)){filters[key]=literal;text=text.replace(quoted![0],' ');}
  else if(match&&/\p{N}/u.test(match[1])){const suffix=text.slice(match.index!+match[0].length).match(/^\s+ч\.\s*с\./iu);filters[key]=match[1]+(suffix?suffix[0]:'');text=text.replace(match[0]+(suffix?suffix[0]:''),' ');}
 }
 if(researchQuestion(question))text=stripResearchFraming(text);
 text=text.replace(/(?<!\p{L})(?:public|open|published)\s+(?=documents?|records?|materials?)/giu,'').replace(/(?<!\p{L})(?:открыт\p{L}*|публичн\p{L}*|опубликованн\p{L}*)\s+(?=документ\p{L}*|материал\p{L}*)/giu,'').replace(/(?<!\p{L})ашық\s+(?=құжат\p{L}*|материал\p{L}*)/giu,'');
 text=text.normalize('NFKC');
 const temporal=archiveSearchIntent(text);const hasPeriod=/(?<![\p{L}\p{N}])(?<!\p{L}[-/])[12]\d{3}(?!\d)/u.test(text);
 if(temporal.yearFrom!==undefined)filters.yearFrom=temporal.yearFrom;
 if(temporal.yearTo!==undefined)filters.yearTo=temporal.yearTo;
 const detectedTypes=new Set<string>();
 let residual=text;for(const [pattern,type] of typePatterns){pattern.lastIndex=0;if(pattern.test(text)){detectedTypes.add(type);if(!filters.type)filters.type=type;}pattern.lastIndex=0;residual=residual.replace(pattern,' ');}
 const negativeType=/(?<!\p{L})(?:не|кроме)\s+(?:фото|фотограф|карт|письм|отч[её]т)|(?<!\p{L})(?:not|except|exclude|excluding|without)\s+(?:photos?|photographs?|maps?|letters?|reports?)|(?:фотосурет\p{L}*|карта\p{L}*|хат\p{L}*|есеп\p{L}*)\s+емес/iu.test(text);
 const typeConflict=detectedTypes.size>1||negativeType;if(typeConflict)delete filters.type;
 const expansion=expandNames(normalizePlaceSpelling(residual),locale);const place=expansion.status==='resolved'||expansion.status==='ambiguous';residual=expansion.normalizedQuestion;
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
 const generic=explicitCatalog.test(question);
 const handled=Boolean(expansion.status==='ambiguous'||researchQuestion(question)||detectedTypes.size||labels.length||reference||numbers||(place&&hasPeriod)||(generic&&(place||hasPeriod)));
 const localityVariants=expansion.status==='resolved'?expansion.variants:[];
 if(localityVariants.length)filters.locality=localityVariants[0];
 return {handled,locale,filters,localityVariants,method,...(place?{nameExpansion:expansion}:{}),periodOnly:hasPeriod&&!generic&&!detectedTypes.size&&!place&&!labels.length&&!reference&&!numbers&&!q,
  ...(researchQuestion(question)&&!q&&!place&&!reference&&!numbers&&!filters.type&&!hasPeriod?{clarification:'subject' as const}:expansion.status==='ambiguous'?{clarification:'place' as const}:temporal.periodAmbiguous?{clarification:'period' as const}:typeConflict?{clarification:'type' as const}:{})};
}
export function semanticConversationPlan(question:string,history:readonly {role:'user'|'assistant';content:string}[],locale:ContentLocale,useModel=false){
 const current=semanticCatalogPlan(question,locale,useModel);if(!current.periodOnly)return current;
 let focus:SemanticPlan|undefined;let refined=false;
 function refine(previous:SemanticPlan,next:SemanticPlan,combine:boolean):SemanticPlan{
  const lower=next.filters.yearFrom,upper=next.filters.yearTo;
  const both=lower!==undefined&&upper!==undefined;
  let yearFrom=combine&&!both&&lower===undefined?previous.filters.yearFrom:lower;
  let yearTo=combine&&!both&&upper===undefined?previous.filters.yearTo:upper;
  const unresolved=previous.clarification==='type'||previous.clarification==='place'||previous.clarification==='subject'?previous.clarification:undefined;
  let clarification=unresolved??next.clarification;
  // Retain contradictory constraints internally so the next correction can replace one bound.
  // Retrieval refuses clarification plans; these filters are not exposed as an executable query.
  if(yearFrom!==undefined&&yearTo!==undefined&&yearFrom>yearTo)clarification=unresolved??'period';
  return {...previous,periodOnly:false,clarification,filters:{...previous.filters,yearFrom,yearTo}};
 }
 for(const turn of history.slice(-6)){
  if(turn.role!=='user')continue;
  const plan=semanticCatalogPlan(turn.content,locale,useModel);
  if(plan.clarification==='unsafe'){focus=undefined;refined=false;continue;}
  if(plan.periodOnly&&focus){focus=refine(focus,plan,refined);refined=true;}
  else if(plan.handled&&!plan.periodOnly&&requiresCatalogEvidence(plan,turn.content)){focus=plan;refined=false;}
  else if(!plan.periodOnly){focus=undefined;refined=false;}
 }
 if(!focus)return current;
 return refine(focus,current,refined);
}
// A bare subject may be an informational question. Keep reviewed CMS facts ahead of weak topic routing.
export function requiresCatalogEvidence(plan:SemanticPlan,question:string){
 const f=plan.filters;
 return Boolean(plan.clarification||f.type||f.locality||f.reference||f.yearFrom!==undefined||f.yearTo!==undefined||f.fundNumber||f.inventoryNumber||f.caseNumber||explicitCatalog.test(question));
}
