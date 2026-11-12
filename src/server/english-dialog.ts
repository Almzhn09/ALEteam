// Restricted English rollout of the new local artifact; no provider or free-form generated facts.
import candidate from '../../training/full-tz/models/query-model.json';
import {generateLocalQuery} from './local-model';
import {englishGuides} from './english-guides';
import {unsafeInstructions} from './assistant-safety';
import type {GroundedAnswer} from './grounded-assistant';
type Turn={role:'user'|'assistant';content:string};
const guideIds:Record<string,string>={'архивный фонд':'guide-fund','архивный шифр':'guide-reference','поиск документов':'guide-search','правила комментариев':'guide-comments','избранное':'guide-favorites','уведомления':'guide-notifications','распознавание текста':'guide-ocr','проверка источников':'guide-sources','вход на сайт':'guide-login','скачивание файлов':'guide-download','помощь по сайту':'guide-site'};
const followups=new Set(['уточнение способа','уточнение места','уточнение причины','повтор объяснения','подтверждение']);
function classify(text:string){
 if(unsafeInstructions(text)||!/[a-z]/iu.test(text)||/[а-яәғқңөұүһі]/iu.test(text))return '';
 const result=generateLocalQuery(text,candidate);return result.complete&&result.confidence>=0.8?result.query:'';
}
export function englishSiteDialog(question:string,history:Turn[]=[]):GroundedAnswer{
 const unavailable=():GroundedAnswer=>({answer:'No answer was found in the published sources for this language. Ask about a site feature or refine the topic.',sourceIds:[],noAnswer:true,mode:'local-model'});
 if(unsafeInstructions(question))return unavailable();
 const act=classify(question);
 let guide:string|undefined=guideIds[act];
 if(act==='приветствие'||act==='благодарность')guide='guide-site';
 if(followups.has(act)){
  let focus:string|undefined;
  for(const turn of history.slice(-6)){
   if(turn.role!=='user')continue;
   const intent=classify(turn.content);
   if(guideIds[intent])focus=guideIds[intent];
   else if(!followups.has(intent)&&!['приветствие','благодарность'].includes(intent))focus=undefined;
  }
  guide=focus;
  if(!guide)return {answer:'Which site feature do you mean: search, favorites, comments, sign-in or notifications?',sourceIds:['guide-site'],noAnswer:false,mode:'local-model'};
 }
 if(!guide||!englishGuides[guide])return unavailable();
 return {answer:(act==='благодарность'?"You are welcome. ":'')+englishGuides[guide],sourceIds:[guide],noAnswer:false,mode:'local-model'};
}
