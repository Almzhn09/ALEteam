import type {ContentLocale} from '../contracts/cms';
import { generateLocalQuery } from './local-model';
import { getGuide } from './guides';
import { retrievePassages, searchIntent, unsafeInstructions } from './knowledge';
import { answerFromSources, isKazakh, noAnswer, type GroundedAnswer } from './grounded-assistant';

type Turn = { role: 'user' | 'assistant'; content: string };
const topicGuides: Record<string,string> = {
 'архивный фонд':'guide-fund','архивный шифр':'guide-reference','поиск документов':'guide-search',
 'правила комментариев':'guide-comments','избранное':'guide-favorites','уведомления':'guide-notifications',
 'распознавание текста':'guide-ocr','проверка источников':'guide-sources','вход на сайт':'guide-login',
 'скачивание файлов':'guide-download','помощь по сайту':'guide-site',
};
const followups = new Set(['уточнение способа','уточнение места','уточнение причины','повтор объяснения','уточнение периода','подтверждение']);
const documentTopics = new Set(['библиотека','площадь','школа','музей','станция']);
const social = new Set(['приветствие','благодарность']);
const replies: Record<string,{ru:string;kk:string;where:string;whereKk:string}> = {
 'избранное': {ru:'Откройте карточку документа и нажмите «☆ В избранное». Без входа список хранится в браузере. После входа он сохраняется в аккаунте; перенести гостевой список можно отдельной кнопкой в разделе /favorites.',kk:'Құжат карточкасын ашып, «☆ Таңдаулыға» батырмасын басыңыз. Кірмей тізім браузерде сақталады; кіргеннен кейін тіркелгіде сақталады. Браузер тізімін /favorites бетіндегі жеке батырмамен көшіріңіз.',where:'Избранное находится в меню сайта: /favorites. Там можно открыть сохранённые документы и удалить их из списка.',whereKk:'Таңдаулылар сайт мәзіріндегі /favorites бетінде. Сақталған құжаттарды ашуға және тізімнен өшіруге болады.'},
 'уведомления': {ru:'Откройте «Мои комментарии» (/me). В блоке «Уведомления» можно отдельно отключить ответы и решения модератора. Настройка действует на новые события; старые уведомления сохраняются.',kk:'«Менің пікірлерім» (/me) бетін ашыңыз. Хабарландыру баптауларында жауаптар мен модератор шешімдерін бөлек өшіруге болады. Бұл жаңа оқиғаларға әсер етеді.',where:'Уведомления находятся в «Мои комментарии»: /me. Перейдите по своему имени в шапке сайта.',whereKk:'Хабарландырулар «Менің пікірлерім» /me бетінде. Сайттың жоғарғы жағындағы атыңызды басыңыз.'},
 'правила комментариев': {ru:'Откройте документ из каталога /catalog и раздел «Обсуждение». После входа введите текст и нажмите «Отправить». Каждый комментарий проходит проверку; спорные сообщения ждут модератора.',kk:'/catalog каталогынан құжатты және талқылауды ашыңыз. Кіргеннен кейін мәтінді енгізіп, «Жіберу» батырмасын басыңыз. Әр пікір тексеріледі; күмәнді пікірлер модераторды күтеді.',where:'Форма обсуждения находится внизу карточки документа. Свои статусы можно посмотреть в /me.',whereKk:'Талқылау нысаны құжат карточкасының төменгі жағында. Өз пікірлеріңіздің мәртебесі /me бетінде.'},
 'поиск документов': {ru:'Перейдите в каталог /catalog. Введите тему или архивный шифр, затем уточните период, фонд и тип документа. Какую тему вы хотите найти?',kk:'/catalog каталогын ашыңыз. Тақырыпты немесе мұрағаттық шифрды енгізіп, кезеңді, қорды және құжат түрін таңдаңыз. Қандай тақырып керек?',where:'Поиск находится на главной странице и в каталоге: /catalog.',whereKk:'Іздеу басты бетте және /catalog каталогында.'},
 'вход на сайт': {ru:'Откройте /login и введите email и пароль своей учётной записи. Открытой регистрации пока нет. Демоучётную запись запросите у владельца стенда; пароль в диалог не присылайте.',kk:'/login бетін ашып, тіркелгіңіздің email мекенжайы мен құпиясөзін енгізіңіз. Ашық тіркелу әзірге жоқ. Демо тіркелгіні стенд иесінен сұраңыз; құпиясөзді чатқа жібермеңіз.',where:'Страница входа — /login, кнопка «Войти» находится в шапке сайта.',whereKk:'Кіру беті — /login. «Кіру» батырмасы сайттың жоғарғы жағында.'},
 'скачивание файлов': {ru:'В карточке документа найдите раздел «Файлы» и нажмите «Скачать» у разрешённого файла. Если указано «Скачивание не разрешено», я не могу обойти это ограничение.',kk:'Құжат карточкасындағы «Файлдар» бөлімінен рұқсат етілген файлдың «Жүктеп алу» батырмасын басыңыз. Жүктеу шектелсе, көмекші бұл шектеуді айналып өтпейді.',where:'Файлы находятся в карточке документа под просмотрщиком сканов; начните с /catalog.',whereKk:'Файлдар құжат карточкасында, сканерленген кескіннің астында. /catalog каталогынан бастаңыз.'},
};
function say(answer:string, guideId='guide-site'): GroundedAnswer {
 if(!getGuide(guideId))throw new Error('DIALOG_GUIDE_MISSING');
 return {answer,sourceIds:[guideId],noAnswer:false,mode:'local-model'};
}
function context(history: Turn[]) {
 let focus: {topic:string;question:string} | undefined;
 for(const turn of history.slice(-6)) {
  if(turn.role!=='user')continue; // Never trust client-supplied assistant statements or source IDs.
  if(unsafeInstructions(turn.content)){focus=undefined;continue;}
  const p=generateLocalQuery(turn.content);
  if(!p.complete||p.confidence<0.6){focus=undefined;continue;}
  if(followups.has(p.query)) {
   if(p.query==='уточнение периода'&&focus&&documentTopics.has(focus.topic))focus={...focus,question:`${focus.topic} ${turn.content}`};
   continue;
  }
  if(social.has(p.query))continue;
  if(topicGuides[p.query]||documentTopics.has(p.query))focus={topic:p.query,question:turn.content};
  else focus=undefined;
 }
 return focus;
}
export async function answerSiteDialog(question:string, history:Turn[]=[],locale:ContentLocale='ru'): Promise<GroundedAnswer> {
 if(unsafeInstructions(question))return noAnswer(question,'local-model');
 if(searchIntent(question).reference)return answerFromSources(question,await retrievePassages(question,'local',undefined,locale),{mode:'local-model'});
 const prediction=generateLocalQuery(question);
 const act=prediction.complete&&prediction.confidence>=0.6?prediction.query:'';
 const prior=context(history);
 // A short year refinement may inherit the language of the previous user question.
 const kk=isKazakh(question)||(act==='уточнение периода'&&prior?isKazakh(prior.question):false);
 if(act==='приветствие')return say(kk?'Сәлем! Құжаттарды іздеуге және сайтты пайдалануға көмектесемін. Іздеу, таңдаулылар, пікірлер немесе хабарландырулар туралы сұраңыз.':'Привет! Помогу найти документы и разобраться с сайтом. Можно спросить про каталог, избранное, комментарии или уведомления. С чего начнём?');
 if(act==='благодарность')return say(kk?'Оқасы жоқ! Тағы не туралы білгіңіз келеді?':'Пожалуйста! Если появится ещё вопрос по сайту, спрашивайте.');
 let topic=act; let effectiveQuestion=question; let carriedTopic: string | undefined;
 if(followups.has(act)) {
  if(!prior)return say(kk?'Нені нақтылаймыз: іздеу, таңдаулылар, пікірлер немесе хабарландырулар?':'Уточните, пожалуйста, о чём речь: о поиске, избранном, комментариях или уведомлениях?');
  topic=prior.topic;
  if(documentTopics.has(topic)) {
   carriedTopic=topic;
   effectiveQuestion=act==='уточнение периода'?`${topic} ${question}`:prior.question;
  }
 }
 if(topic==='помощь по сайту')return say(kk?'Мен ALEteam көмекшісімін. Сайтта /catalog каталогынан іздеуге, /favorites таңдаулыларын сақтауға және кіргеннен кейін пікір жазуға болады. Хабарландырулар /me бетінде. Қай мүмкіндікті түсіндірейін?':'Я — помощник ALEteam. На сайте есть каталог /catalog, избранное /favorites, обсуждения документов и уведомления /me. Я могу объяснить, куда перейти и что нажать. Какая функция интересует?');
 const reply=replies[topic];
 if(reply) {
  if(act==='уточнение места')return say(kk?reply.whereKk:reply.where,topicGuides[topic]);
  if(act==='уточнение причины'&&topic==='правила комментариев')return say(kk?'Пікірлер балағат пен қорлауды болдырмау үшін тексеріледі. Күмәнді пікірлерді модератор қарайды; мәртебесін /me бетінен көріңіз.':'Комментарии проходят проверку, чтобы не публиковать мат и оскорбления. Спорные сообщения проверяет модератор; статус можно посмотреть в /me.',topicGuides[topic]);
  return say(kk?reply.kk:reply.ru,topicGuides[topic]);
 }
 const guide=topicGuides[topic];
 if(guide) {
  const g=getGuide(guide)!;
  const text=kk?(g.text.split('\nҚазақша: ')[1]??g.text.split('\n')[1]??g.text).split('\nEnglish: ')[0]:g.text.split('\n')[0];
  return say(text,guide);
 }
 return answerFromSources(effectiveQuestion,await retrievePassages(effectiveQuestion,'local',carriedTopic,locale),{mode:'local-model'});
}
