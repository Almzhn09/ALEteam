import type {CatalogFilters} from '../../contracts/catalog';
import type {EngineLocale} from './types';
export interface ResearchStep {id:string;kind:'clarify'|'search'|'read'|'follow_sources';title:string;description:string}
export interface ResearchAction {type:'catalogSearch';label:string;query:CatalogFilters}
export interface ResearchGuidance {mode:'guided-research';automatic:true;steps:ResearchStep[];actions:ResearchAction[];limitations:string[]}
const goal=/(?<!\p{L})(?:исслед\p{L}*|хочу\s+(?:узнать|изучить|найти)|помоги\p{L}*\s+(?:изучить|исследовать|найти)|истори[яю]\s+(?:мо\p{L}*|сво\p{L}*)|research\p{L}*|i\s+(?:want|would like)\s+to\s+(?:learn|study|research)|зертте\p{L}*|тарихын\s+білгім)(?!\p{L})/iu;
export function researchQuestion(question:string){return question.length<=1000&&goal.test(question);}
export function stripResearchFraming(question:string){
 return question.replace(/(?<!\p{L})(?:хочу|узнать|изучить|изучаю|исследовать|исследую|исследование|помоги|помогите|историю|история|истории|моей|моего|мою|своей|своего|свою|i|want|would|like|to|learn|study|research|researching|studying|the|history|of|my|мен|білгім|келеді|зерттегім|зерттеу|тарихын|тарихы)(?!\p{L})/giu,' ').replace(/\s+/gu,' ').trim();
}
const copy={
 ru:{clarify:['Уточните объект и период','Назовите место, учреждение или человека и примерные годы. Если место неоднозначно, выберите нужное.'],search:['Начните с открытого каталога','Проверьте современные и старые названия, затем сузьте период и тип материала.'],read:['Сравните описание с источником','Откройте доступную карточку и разрешённую копию. Учитывайте качество OCR и точность дат.'],follow:['Проверьте связанные источники','Сопоставьте материалы и их происхождение. Шаг исследования — рекомендация, а не доказательство найденного факта.'],action:'Открыть поиск с этими фильтрами',limit:'Маршрут составлен автоматически. Наличие документов устанавливается только по фактической выдаче и источникам.'},
 kk:{clarify:['Нысан мен кезеңді нақтылаңыз','Орынды, мекемені немесе тұлғаны және шамамен жылдарды көрсетіңіз. Орын екіұшты болса, қажеттісін таңдаңыз.'],search:['Ашық каталогтан бастаңыз','Қазіргі және бұрынғы атауларды тексеріп, кезең мен материал түрін нақтылаңыз.'],read:['Сипаттаманы дереккөзбен салыстырыңыз','Қолжетімді карточка мен рұқсат етілген көшірмені ашыңыз. OCR сапасы мен даталардың дәлдігін ескеріңіз.'],follow:['Байланысты дереккөздерді тексеріңіз','Материалдар мен олардың шығу тегін салыстырыңыз. Зерттеу қадамы табылған фактінің дәлелі емес.'],action:'Осы сүзгілермен іздеуді ашу',limit:'Бағыт автоматты түрде жасалған. Құжаттардың бар болуы нақты іздеу нәтижелері мен дереккөздер арқылы анықталады.'},
 en:{clarify:['Specify the subject and period','Name a place, institution or person and approximate years. Clarify ambiguous place names.'],search:['Start with the public catalog','Check current and historical names, then narrow the period and material type.'],read:['Compare the description with its source','Open the available record and permitted copy. Consider OCR quality and date precision.'],follow:['Check related sources','Compare materials and provenance. A research step is a suggestion, not evidence that a fact or record has been found.'],action:'Open search with these filters',limit:'This route is generated automatically. The existence of records must be established by actual results and sources.'},
};
export function planResearch(question:string,locale:EngineLocale,plan:{filters:CatalogFilters;clarification?:string;handled:boolean}):ResearchGuidance|undefined{
 if(!researchQuestion(question)||plan.clarification==='unsafe')return undefined;
 const c=copy[locale];const steps:ResearchStep[]=[];
 if(plan.clarification||!plan.handled||!plan.filters.locality||plan.filters.yearFrom===undefined&&plan.filters.yearTo===undefined)steps.push({id:'clarify',kind:'clarify',title:c.clarify[0],description:c.clarify[1]});
 for(const id of ['search','read','follow'] as const)steps.push({id,kind:id==='follow'?'follow_sources':id,title:c[id][0],description:c[id][1]});
 const filters=plan.filters;const meaningful=Boolean(filters.q||filters.locality||filters.reference||filters.fundNumber||filters.inventoryNumber||filters.caseNumber||filters.type||filters.yearFrom!==undefined||filters.yearTo!==undefined);
 // The query is created by the trusted planner; do not reuse arbitrary client URLs/objects.
 const query:CatalogFilters={locale:filters.locale??locale,sort:'year_asc',pageSize:5};
 for(const key of ['q','locality','reference','fundId','branchId','inventoryId','caseId','fundNumber','inventoryNumber','caseNumber','author','organization','originalLanguage','category','tag','type','yearFrom','yearTo'] as const){const v=filters[key];if(v!==undefined)Object.assign(query,{[key]:v});}
 return {mode:'guided-research',automatic:true,steps,actions:meaningful&&plan.handled&&!plan.clarification?[{type:'catalogSearch',label:c.action,query}]:[],limitations:[c.limit]};
}
