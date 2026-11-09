import {unsafeInstructions} from './assistant-safety';
import type {ContentLocale} from '../contracts/cms';
import type {CmsPassage} from './cms-knowledge';
import type {GroundedAnswer} from './grounded-assistant';
export function cmsAnswer(passages:readonly CmsPassage[],locale:ContentLocale):GroundedAnswer{
 if(!passages.length)return {answer:locale==='en'?'No answer was found in the published sources for this language.':locale==='kk'?'Осы тілдегі жарияланған дереккөздерден жауап табылмады.':'В опубликованных источниках на этом языке ответа нет.',sourceIds:[],noAnswer:true,mode:'retrieval'};
 const selected=passages.slice(0,3);
 const title=locale==='en'?'Excerpts from published sources:':locale==='kk'?'Жарияланған дереккөздерден үзінділер:':'Фрагменты опубликованных источников:';
 const demo=selected.some(p=>p.isDemo)?'\n'+(locale==='en'?'DEMO: fictional learning materials, not historical records.':locale==='kk'?'ДЕМО: ойдан шығарылған оқу материалдары, тарихи деректер емес.':'ДЕМО: вымышленные учебные материалы, не исторические сведения.'):'';
 return {answer:(title+demo+'\n\n'+selected.map(p=>`${p.title}\n«${p.text.slice(0,1500)}»`).join('\n\n')).slice(0,8000),sourceIds:selected.map(p=>p.id),noAnswer:false,mode:'retrieval'};
}

// Only explicit short follow-ups inherit a user topic; client-provided assistant prose is ignored.
export function cmsQuestionContext(question:string,history:readonly {role:'user'|'assistant';content:string}[]=[]){
 const followup=/^(?:а\s+)?(?:где это|где он|какой телефон|когда он работает|часы работы|повтори|ол қайда|жұмыс уақыты қандай|where is it|what are its opening hours|please repeat that)[?.!\s]*$/iu;
 if(unsafeInstructions(question)||!followup.test(question.trim()))return question;
 let focus:string|undefined;
 for(const turn of history.slice(-6)){
  if(turn.role!=='user')continue;
  if(unsafeInstructions(turn.content)){focus=undefined;continue;}
  if(!followup.test(turn.content.trim()))focus=turn.content;
 }
 return focus?focus+' '+question:question;
}
