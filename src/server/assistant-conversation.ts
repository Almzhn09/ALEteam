// Conversational layer of the ALEteam assistant: small talk, questions about the assistant itself and
// polite redirects. It runs before archive retrieval so that "как дела" or "кто ты" never turn into a
// keyword search ("дела" is also an archival term). Replies only describe the assistant and the site;
// they never state archive facts, so they cite the site guide like the other site-dialog answers.
import type {ContentLocale} from '../contracts/cms';
import {unsafeInstructions} from './assistant-safety';
import type {GroundedAnswer} from './grounded-assistant';

type Turn={role:'user'|'assistant';content:string};
type Locale=ContentLocale;
type Kind='greeting'|'howAreYou'|'who'|'creator'|'capabilities'|'thanks'|'bye'|'praise'|'complaint'|'offTopic';
export interface ConversationReply extends GroundedAnswer {suggestions:string[];talk:true}
export interface Conversation {reply?:ConversationReply;rest?:string;greeting?:string}

/** Lowercase, ё→е, without punctuation, emoji or repeated spaces. */
export function normalizeTalk(text:string){
 return text.toLowerCase().normalize('NFKC').replace(/ё/gu,'е').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/gu,' ').trim();
}

const greetingWords='привет(?:ик|ствую)?|здравствуй(?:те)?|здрасте|добрый (?:день|вечер)|доброе утро|доброй ночи|хай|хэй|салам|салем|сәлем(?:еттесіз бе|етсіз бе)?|сәлеметсіз бе|сәлеметсіздер ме|ассалаумағалейкум|армысыз|hello|hi|hey|good (?:morning|afternoon|evening)';
const address='(?: (?:всем|бот|помощник|друг|ассистент|ии|көмекші|there|bot|assistant))?';
const patterns:[Kind,RegExp][]=[
 ['greeting',new RegExp(`^(?:${greetingWords})${address}(?: (?:${greetingWords}))?$`,'u')],
 ['howAreYou',/^(?:(?:ну |а )?как (?:у тебя )?(?:дела|ты|жизнь|поживаешь|настроение|сам|оно)(?: у тебя)?|что нового|как ваши дела|как вы|қалайсыз|қалайсың|қал(?:ың|ыңыз) қалай|жағдай(?:ың|ыңыз)? қалай|қалай жағдай|how are you(?: doing)?|how is it going|hows it going|whats up|what s up|sup)$/u],
 ['creator',/^(?:кто (?:тебя|вас) (?:создал|сделал|разработал|обучил|написал|придумал)|кто твой (?:создатель|автор|разработчик)|сені кім (?:жасады|жасаған|құрды)|who (?:made|created|built|trained) you)$/u],
 ['who',/^(?:(?:а )?(?:кто ты|ты кто|кто вы|вы кто)(?: такой| такая| такое)?|что ты (?:такое|за бот)|как тебя (?:зовут|звать)|как вас зовут|представься|расскажи (?:о|про) себя|расскажи о себе|ты (?:бот|робот|ии|нейросеть|человек|живой|chatgpt|gpt)|ты настоящий|сен кімсің|сіз кімсіз|атың кім|атыңыз кім|who are you|what are you|what is your name|whats your name|are you (?:a bot|a human|human|an ai|ai|real))$/u],
 ['capabilities',/^(?:(?:а )?что ты (?:умеешь|можешь)(?: делать)?|что вы (?:умеете|можете)|чем (?:ты |вы )?(?:можешь |можете )?(?:мне )?помочь|(?:помоги|помогите)(?: мне| пожалуйста)*|помощь|нужна помощь|мне нужна помощь|что (?:тут|здесь) можно (?:делать|спросить)|что можно (?:спросить|узнать)|с чего начать|не знаю (?:что спросить|с чего начать)|как (?:тобой|с тобой) пользоваться|что ты знаешь|не (?:могу|получается) найти|көмектес(?:іңіз|ші)?|көмек керек|не істей аласың|не білесің|қалай көмектесе аласыз|what can you do|help|help me|i need help|how can you help(?: me)?|what do you know)$/u],
 ['thanks',/^(?:(?:большое |огромное )?спасибо(?: большое| огромное| тебе| вам)*|благодарю|спс|пасиб[ао]?|сенкс|мерси|рахмет|рақмет(?: сізге)?|көп рақмет|thanks?(?: a lot| you(?: very much)?)?|thx|ty)$/u],
 ['bye',/^(?:пока(?: пока)?|до свидания|до встречи|до связи|всего доброго|всего хорошего|удачи|спокойной ночи|сау бол(?:ыңыз)?|көріскенше|bye|goodbye|see you|good night)$/u],
 ['praise',/^(?:молодец|умница|круто|класс(?:но)?|супер|отлично|здорово|понятно|ясно|хорошо|ок|окей|ладно|норм|хорош|ты лучший|керемет|жақсы|тамаша|түсінікті|good|great|cool|nice|awesome|ok|okay|got it)$/u],
 ['complaint',/^(?:ты (?:тупой|глупый|бесполезный|не понимаешь)|(?:ты )?ничего не понимаешь|не (?:понял|поняла|понятно|то|работает|помогло|помог)|это не то|плохо|ерунда|фигня|чушь|бред|отстой|түсінбедім|дұрыс емес|wrong|useless|that s wrong|thats wrong|you are useless|i don t understand|i dont understand)$/u],
 ['offTopic',/(?:^|\s)(?:погод\p{L}*|анекдот\p{L}*|шутк\p{L}*|пошути|который час|сколько (?:сейчас )?времени|домашн\p{L}* задани\p{L}*|домашк\p{L}*|реши (?:задачу|пример)|напиши (?:код|сочинение|стих\p{L}*)|курс (?:доллара|валют)|футбол\p{L}*|рецепт\p{L}*|ауа райы|әзіл|weather|joke|homework|recipe)(?:\s|$)/u],
];

export function talkKind(question:string):Kind|undefined{
 const text=normalizeTalk(question);
 if(!text||text.length>120)return;
 return patterns.find(([,pattern])=>pattern.test(text))?.[0];
}

const suggestions:Record<Locale,string[]>={
 ru:['Когда был образован архив?','Какие часы работы читального зала?','Что такое архивный фонд?','Как найти документ по шифру?','Где находится архив?'],
 kk:['Мұрағат қашан құрылды?','Оқу залының жұмыс уақыты қандай?','Мұрағат қоры дегеніміз не?','Құжатты шифр бойынша қалай табамын?','Мұрағат қайда орналасқан?'],
 en:['When was the archive founded?','What are the reading room opening hours?','What is an archival fond?','How do I find a document by its reference code?','Where is the archive located?'],
};

const replies:Record<Kind,Record<Locale,string[]>>={
 greeting:{
  ru:['Здравствуйте! Я помощник электронного архива Восточно-Казахстанской области. Могу подсказать, где найти документ, объяснить архивные термины или как пользоваться сайтом. О чём хотите узнать?','Привет! Рад помочь. Спросите про историю архива, его фонды, филиалы и часы работы — или опишите, какой документ ищете.','Добрый день! Чем помочь? Например, могу найти материалы по теме или подсказать, как устроен каталог архива.'],
  kk:['Сәлеметсіз бе! Мен Шығыс Қазақстан облысы электрондық мұрағатының көмекшісімін. Құжатты табуға, мұрағат терминдерін түсіндіруге және сайтты пайдалануға көмектесемін. Не білгіңіз келеді?','Сәлем! Мұрағат тарихы, қорлары, филиалдары немесе жұмыс уақыты туралы сұраңыз — не қандай құжат іздейтініңізді жазыңыз.'],
  en:['Hello! I am the assistant of the East Kazakhstan Region electronic archive. I can help you find documents, explain archival terms or show how the site works. What would you like to know?','Hi! Ask me about the archive history, its fonds, branches or opening hours — or describe the document you are looking for.'],
 },
 howAreYou:{
  ru:['Всё хорошо, спасибо! Готов искать по архиву. А у вас какой вопрос?','Отлично, работаю без выходных 🙂 Чем могу помочь — найти документ или рассказать о сайте?','Спасибо, что спросили! У меня всё в порядке. Что будем искать сегодня?'],
  kk:['Бәрі жақсы, рақмет! Мұрағаттан іздеуге дайынмын. Сізде қандай сұрақ бар?','Рақмет, жақсы! Бүгін не іздейміз?'],
  en:['All good, thank you! Ready to search the archive. What is your question?','Doing well, thanks for asking! What shall we look for today?'],
 },
 who:{
  ru:['Я — ИИ-помощник сайта Государственного архива Восточно-Казахстанской области. Работаю на собственной модели команды ALEteam, без внешних сервисов. Ищу ответы только в опубликованных материалах архива и всегда показываю источник, поэтому не выдумываю факты. Если ответа нет, так и скажу.','Я помощник электронного архива ВКО. Моя задача — помочь найти документы и сведения об архиве и объяснить, как пользоваться сайтом. Отвечаю по опубликованным материалам и даю ссылку на источник.'],
  kk:['Мен — Шығыс Қазақстан облысы мемлекеттік мұрағаты сайтының ЖИ-көмекшісімін. ALEteam командасының жеке моделінде, сыртқы қызметтерсіз жұмыс істеймін. Жауапты тек жарияланған мұрағат материалдарынан іздеймін және әрқашан дереккөзін көрсетемін.'],
  en:['I am the AI assistant of the State Archive of East Kazakhstan Region website. I run on the ALEteam team’s own model, without external services. I look for answers only in published archive materials and always show the source, so I do not make facts up.'],
 },
 creator:{
  ru:['Меня сделала команда ALEteam — Алимжан, Алинур и Артур — для нового сайта архива Восточно-Казахстанской области. Модель обучена командой с нуля и работает без внешних сервисов.'],
  kk:['Мені ALEteam командасы — Әлімжан, Әлинұр және Артур — Шығыс Қазақстан облысы мұрағатының жаңа сайты үшін жасады. Модель команда тарапынан нөлден оқытылған.'],
  en:['I was built by the ALEteam team — Alimzhan, Alinur and Artur — for the new East Kazakhstan Region archive website. The model was trained by the team from scratch and runs without external services.'],
 },
 capabilities:{
  ru:['Конечно, помогу! Вот что я умею:\n• искать в опубликованных материалах архива — документы, статьи, фотографии, справочники фондов;\n• рассказывать об архиве: история, филиалы, контакты, часы работы;\n• объяснять архивные термины — фонд, опись, шифр;\n• подсказывать, как пользоваться сайтом: каталог, избранное, комментарии, уведомления.\nНапишите вопрос своими словами или выберите пример ниже.'],
  kk:['Әрине, көмектесемін! Мен:\n• жарияланған мұрағат материалдарынан іздеймін — құжаттар, мақалалар, фотосуреттер, қор анықтамалықтары;\n• мұрағат туралы айтамын: тарихы, филиалдары, байланыс, жұмыс уақыты;\n• мұрағат терминдерін түсіндіремін — қор, тізімдеме, шифр;\n• сайтты пайдалануды көрсетемін.\nСұрағыңызды өз сөзіңізбен жазыңыз немесе төмендегі мысалды таңдаңыз.'],
  en:['Of course! Here is what I can do:\n• search published archive materials — documents, articles, photos, fond guides;\n• tell you about the archive: history, branches, contacts, opening hours;\n• explain archival terms such as fond, inventory and reference code;\n• show how to use the site: catalogue, favourites, comments, notifications.\nAsk in your own words or pick an example below.'],
 },
 thanks:{
  ru:['Пожалуйста! Обращайтесь, если понадобится что-то ещё.','Рад был помочь! Если появятся вопросы об архиве — пишите.','Не за что! Могу поискать что-нибудь ещё.'],
  kk:['Оқасы жоқ! Тағы сұрағыңыз болса, жазыңыз.','Көмектескеніме қуаныштымын!'],
  en:['You are welcome! Let me know if you need anything else.','Glad to help! Ask any time.'],
 },
 bye:{
  ru:['До свидания! Будет нужно что-то найти в архиве — возвращайтесь.','Всего доброго! Рад был помочь.'],
  kk:['Сау болыңыз! Мұрағаттан бір нәрсе іздеу керек болса, қайта келіңіз.'],
  en:['Goodbye! Come back whenever you need something from the archive.'],
 },
 praise:{
  ru:['Спасибо! Что ещё поискать?','Рад, что получилось. Есть ещё вопрос?','Отлично! Если нужно — продолжим.'],
  kk:['Рақмет! Тағы не іздейміз?','Жақсы! Тағы сұрақ бар ма?'],
  en:['Thanks! What else shall we look for?','Great! Anything else?'],
 },
 complaint:{
  ru:['Извините, что не помог. Попробуйте сформулировать иначе: назовите тему, место или период — например, «история архива» или «фото Риддера». Ещё можно спросить, как устроен сайт.','Похоже, я вас неправильно понял — простите. Я ищу только в опубликованных материалах архива, поэтому лучше всего работают конкретные вопросы: о чём документ, где и когда.'],
  kk:['Кешіріңіз, көмектесе алмадым. Басқаша жазып көріңіз: тақырыпты, орынды немесе кезеңді атаңыз — мысалы, «мұрағат тарихы».'],
  en:['Sorry that did not help. Try rephrasing with a topic, place or period — for example “archive history” or “photos of Ridder”.'],
 },
 offTopic:{
  ru:['С этим я, к сожалению, не помогу — я отвечаю только по материалам архива и работе сайта. Зато могу рассказать об истории архива, его фондах и филиалах или помочь найти документ.'],
  kk:['Өкінішке қарай, бұған көмектесе алмаймын — мен тек мұрағат материалдары мен сайт жұмысы бойынша жауап беремін. Мұрағат тарихы, қорлары немесе филиалдары туралы айта аламын.'],
  en:['I am afraid I cannot help with that — I only answer about archive materials and the website. I can tell you about the archive history, its fonds and branches, or help you find a document.'],
 },
};

function pick<T>(items:readonly T[],seed:string){
 let hash=2166136261;
 for(const c of seed)hash=Math.imul(hash^c.codePointAt(0)!,16777619)>>>0;
 return items[hash%items.length];
}
export function talkLocale(question:string,locale:Locale):Locale{
 if(/[әғқңөұүһі]/iu.test(question)||/рахмет|рақмет|сәлем|салем/iu.test(question))return 'kk';
 if(/^[\x00-\x7F]+$/u.test(question)&&/[a-z]/iu.test(question))return 'en';
 if(/[а-яё]/iu.test(question))return 'ru';
 return locale;
}

/** A short reply for small talk, or a greeting prefix stripped from a real question ("Привет, найди…"). */
export function conversation(question:string,history:readonly Turn[]=[],locale:Locale='ru'):Conversation{
 if(unsafeInstructions(question))return {};
 const lang=talkLocale(question,locale);
 const kind=talkKind(question);
 if(kind){
  const seed=normalizeTalk(question)+':'+history.length;
  const asked=new Set(history.filter(t=>t.role==='user').map(t=>t.content.trim()));
  const offered=pick([0,1,2],seed);
  const examples=[...suggestions[lang].slice(offered),...suggestions[lang].slice(0,offered)].filter(s=>!asked.has(s)).slice(0,3);
  return {reply:{answer:pick(replies[kind][lang],seed),sourceIds:['guide-site'],noAnswer:false,mode:'local-model',suggestions:kind==='bye'?[]:examples,talk:true}};
 }
 const greeting=new RegExp(`^\\s*(?:${greetingWords})${address}[\\s,.!:;—-]+`,'iu').exec(question.replace(/ё/gu,'е'));
 const rest=greeting?question.slice(greeting[0].length).trim():'';
 if(greeting&&rest.length>=3&&/\p{L}/u.test(rest))return {rest,greeting:lang==='kk'?'Сәлеметсіз бе!':lang==='en'?'Hello!':'Здравствуйте!'};
 return {};
}

/** Follow-up questions offered after an archive answer, so the dialogue can continue. */
export function followUps(question:string,locale:Locale,noAnswer:boolean){
 const lang=talkLocale(question,locale);
 const base=suggestions[lang].filter(s=>s.trim()!==question.trim());
 if(!noAnswer)return [];
 return base.slice(0,3);
}
