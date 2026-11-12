import { z } from 'zod';
import { db } from './db';
import { ApiError, idSchema, json, rateLimit, readJson, requireUser } from './http';
import { serviceRequest, unavailableAssistant } from './services';
import { retrievePassages } from './knowledge';
import { answerFromSources } from './grounded-assistant';
import { getGuide } from './guides';
import { answerSiteDialog } from './site-dialog';
import {retrieveCmsPassages,revalidateCmsPassages,type CmsPassage} from './cms-knowledge';
import {isKazakh} from './grounded-assistant';
import {cmsAnswer,cmsQuestionContext} from './cms-grounding';
import {semanticConversationPlan,requiresCatalogEvidence} from './semantic-catalog-plan';
import {retrieveSemanticCatalog,revalidateCatalogSources,semanticCatalogAnswer,type CatalogPassage} from './semantic-catalog';
import {englishSiteDialog} from './english-dialog';
import {conversation,followUps,talkLocale,type Conversation} from './assistant-conversation';
import {guideTitle} from './guides';
import {publicDocumentWhere} from './public-visibility';
import {planResearch} from './artur-discovery/research';
import {retrievePublicSearchPassages,revalidatePublicSearchPassages,publicSearchAnswer,type PublicSearchPassage} from './public-search-knowledge';
import {directoryIntent,retrieveDirectoryPassages,revalidateDirectoryPassages,directoryAnswer,type DirectoryPassage} from './directory-knowledge';
import {retrieveCmsFilePassages,revalidateCmsFilePassages,cmsFileAnswer,type CmsFilePassage} from './cms-file-knowledge';
import type {NameExpansion as TransportNameExpansion,ResearchStep,ResearchAction} from '../contracts/discovery';

export const assistantInput = z.object({
  locale: z.enum(['ru','kk','en']).optional(),
  question: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) }).strict()).max(6).default([]),
}).strict();
const assistantOutput = z.object({ answer: z.string().trim().min(1).max(8000), sourceIds: z.array(idSchema).max(5), noAnswer: z.boolean(), mode: z.enum(['retrieval', 'llm', 'local-model']).optional() }).strict();
export async function assistant(request: Request) {
  const user = await requireUser(request);
  const input = assistantInput.parse(await readJson(request));
  // The team's own model is the documented default; retrieval-only or LLM modes must be chosen explicitly.
  const local = (process.env.ASSISTANT_MODE || 'local-model') === 'local-model' && !process.env.ASSISTANT_SERVICE_URL;
  await rateLimit(`assistant:${local ? 'local:' : ''}${user.id}`, local ? 30 : 10, local ? 60 : 3600);
  await rateLimit(`assistant:global-daily${local ? ':local' : ''}`, local ? 10000 : 100, 86400);
  // Small talk ("привет", "как дела", "кто ты") is answered before any archive search.
  const talk:Conversation=process.env.ASSISTANT_SERVICE_URL?{}:conversation(input.question,input.history,input.locale??'ru');
  if(talk.reply){
   const talkLang=talkLocale(input.question,input.locale??'ru');
   return json({answer:talk.reply.answer,noAnswer:false,mode:'local-model',talk:true,suggestions:talk.reply.suggestions,
    sources:[{id:'guide-site',title:guideTitle('guide-site',talkLang)||guideTitle('guide-site','ru'),isDemo:false,kind:'guide',...(talkLang==='en'?{locale:'en'}:{}),href:'/api/guides/guide-site'}]});
  }
  const originalQuestion=input.question;
  if(talk.rest)input.question=talk.rest;
  let result: z.infer<typeof assistantOutput>;
  let cmsPassages:CmsPassage[]=[];
  let catalogPassages:CatalogPassage[]=[];
  let directoryPassages:DirectoryPassage[]=[];
  let filePassages:CmsFilePassage[]=[];
  let searchPassages:PublicSearchPassage[]=[];
  const documentLocale=input.locale??'ru';
  const plan=semanticConversationPlan(input.question,input.history,documentLocale,local);
  const locale=input.locale??(isKazakh(input.question)?'kk':'ru');
  const directoryQuery=!plan.clarification&&!plan.filters.reference&&!plan.filters.inventoryNumber&&!plan.filters.caseNumber?directoryIntent(input.question):undefined;
  try {
    if(!process.env.ASSISTANT_SERVICE_URL&&plan.handled&&requiresCatalogEvidence(plan,input.question))catalogPassages=await retrieveSemanticCatalog(plan);
    if(!process.env.ASSISTANT_SERVICE_URL&&plan.handled&&requiresCatalogEvidence(plan,input.question)&&!plan.clarification&&!directoryQuery&&!catalogPassages.length)searchPassages=await retrievePublicSearchPassages(plan);
    if(!process.env.ASSISTANT_SERVICE_URL&&directoryQuery&&!catalogPassages.length)directoryPassages=await retrieveDirectoryPassages(directoryQuery);
    if(!process.env.ASSISTANT_SERVICE_URL&&!directoryQuery&&(!plan.handled||!requiresCatalogEvidence(plan,input.question)))cmsPassages=await retrieveCmsPassages(cmsQuestionContext(input.question,input.history),locale);
    if(!process.env.ASSISTANT_SERVICE_URL&&plan.handled&&!requiresCatalogEvidence(plan,input.question)&&!cmsPassages.length)catalogPassages=await retrieveSemanticCatalog(plan);
    const exactPublicationNumber=input.question.match(/(?:№|номер|number|no\.)\s*(\d{1,10})(?!\d)/iu)?.[1];
    // Handwritten requisites can have a high aggregate OCR score and still be
    // misread. Prefer the checked published record for its explicit identifier.
    const checkedRequisites=exactPublicationNumber&&cmsPassages.some(p=>new RegExp('(?<!\\d)'+exactPublicationNumber+'(?!\\d)','u').test(p.text));
    if(!process.env.ASSISTANT_SERVICE_URL&&!directoryQuery&&!checkedRequisites&&!catalogPassages.length&&(!cmsPassages.length||cmsPassages.some(p=>p.text.length<600)))filePassages=await retrieveCmsFilePassages(cmsQuestionContext(input.question,input.history),locale);
    result = assistantOutput.parse(process.env.ASSISTANT_SERVICE_URL
      ? await serviceRequest(process.env.ASSISTANT_SERVICE_URL, process.env.ASSISTANT_SERVICE_TOKEN, { ...input, maxOutputTokens: 500 }, 15000)
      : searchPassages.length ? publicSearchAnswer(searchPassages,locale)
      : directoryQuery&&!catalogPassages.length ? directoryAnswer(directoryPassages,locale)
      : filePassages.length ? cmsFileAnswer(filePassages,locale,cmsQuestionContext(input.question,input.history))
      : cmsPassages.length ? cmsAnswer(cmsPassages,locale,cmsQuestionContext(input.question,input.history))
      : plan.handled ? semanticCatalogAnswer(catalogPassages,plan,local)
      : locale==='en' ? (local?englishSiteDialog(input.question,input.history):cmsAnswer([],locale))
      : local ? await answerSiteDialog(input.question, input.history,documentLocale)
      : await answerFromSources(input.question, await retrievePassages(input.question, 'expanded',undefined,documentLocale)));
  } catch { unavailableAssistant(); }
  if ((!result.noAnswer && !result.sourceIds.length) || (result.noAnswer && result.sourceIds.length)) throw new ApiError(502, 'INVALID_ASSISTANT_RESPONSE', 'Ответ помощника не прошёл проверку источников.');
  const ids = [...new Set(result.sourceIds)];
  const selectedSearch=searchPassages.filter(p=>ids.includes(p.id));
  if(!await revalidatePublicSearchPassages(selectedSearch))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  const selectedDirectory=directoryPassages.filter(p=>ids.includes(p.id));
  const selectedFiles=filePassages.filter(p=>ids.includes(p.id));
  if(!await revalidateCmsFilePassages(selectedFiles))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  if(!await revalidateDirectoryPassages(selectedDirectory))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  const selectedCatalog=catalogPassages.filter(p=>ids.includes(p.id));
  if(!await revalidateCatalogSources(selectedCatalog))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  const selectedCms=cmsPassages.filter(p=>ids.includes(p.id));
  if(!await revalidateCmsPassages(selectedCms,locale))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  const documents = await db.document.findMany({ where: { id: { in: ids }, ...publicDocumentWhere, allowDigitalCopy: true }, select: { id: true, title: true, isDemo: true,translations:{where:{locale:documentLocale},select:{title:true}} } });
  const sources = ids.map(id => {
    const found=selectedSearch.find(p=>p.id===id);
    if(found)return {id,title:found.title,isDemo:false,kind:found.kind,locale:found.locale,href:found.href};
    const file=selectedFiles.find(p=>p.id===id);
    if(file)return {id,title:file.title,isDemo:file.isDemo,kind:'cms',locale,href:file.href};
    const directory=selectedDirectory.find(p=>p.id===id);
    if(directory)return {id,title:directory.title,isDemo:false,kind:directory.kind,href:directory.href};
    const catalog=selectedCatalog.find(p=>p.id===id);
    if(catalog)return {id:catalog.id,title:catalog.title,isDemo:catalog.isDemo,kind:'document',locale:catalog.locale,href:catalog.href,digitalCopyAllowed:catalog.digitalCopyAllowed};
    const cms=selectedCms.find(p=>p.id===id);
    if(cms)return {id:cms.id,title:cms.title,isDemo:cms.isDemo,kind:'cms',locale,href:cms.href};
    const guide = getGuide(id);
    if (guide) return { id, title: input.locale==='en'?guide.titleEn:guide.title, locale:input.locale==='en'?'en':undefined, isDemo: false, kind: 'guide', href: `/api/guides/${id}` };
    const document = documents.find(d => d.id === id);
    return document&&document.translations.length ? {id:document.id,title:document.translations[0].title,isDemo:document.isDemo,locale:documentLocale,kind:'document',href:`/api/documents/${id}?locale=${documentLocale}`} : undefined;
  });
  if (sources.some(s => !s)) throw new ApiError(502, 'INVALID_ASSISTANT_RESPONSE', 'Ответ помощника содержит недоступный источник.');
  const research=!process.env.ASSISTANT_SERVICE_URL?planResearch(input.question,locale,plan):undefined;
  const researchActions:ResearchAction[]=research?.actions.map(a=>({type:'catalogSearch',filters:a.query}))??[];
  const researchSteps:ResearchStep[]=research?.steps.map(s=>({id:s.id,text:s.title+'. '+s.description,status:'suggested',sources:[],...(s.kind==='search'&&researchActions[0]?{action:researchActions[0]}:{})}))??[];
  const expansion:TransportNameExpansion|undefined=plan.nameExpansion?{mode:'expanded',applied:plan.nameExpansion.status==='resolved',variants:plan.nameExpansion.variants,entityIds:[],clarificationRequired:plan.nameExpansion.status==='ambiguous',sources:[]}:undefined;
  return json({...(research?{researchSteps,actions:researchActions,researchLimitations:research.limitations}:{}),...(expansion?{nameExpansion:expansion,nameExpansionProvenance:{kind:'project_dictionary',sourceIds:[...new Set(plan.nameExpansion!.matches.flatMap(m=>m.sourceIds))]}}:{}), answer: (talk.greeting?talk.greeting+' ':'')+result.answer, noAnswer: result.noAnswer, mode: result.mode ?? 'external', sources,...(result.noAnswer&&!process.env.ASSISTANT_SERVICE_URL?{suggestions:followUps(originalQuestion,input.locale??'ru',true)}:{}),...(plan.handled&&!directoryQuery&&!plan.clarification&&!cmsPassages.length&&!filePassages.length&&!searchPassages.length&&!process.env.ASSISTANT_SERVICE_URL?{catalogQuery:plan.filters}:{}) });
}
