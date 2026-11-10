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
import {publicDocumentWhere} from './public-visibility';
import {planResearch} from './artur-discovery/research';
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
  const local = process.env.ASSISTANT_MODE === 'local-model' && !process.env.ASSISTANT_SERVICE_URL;
  await rateLimit(`assistant:${local ? 'local:' : ''}${user.id}`, local ? 30 : 10, local ? 60 : 3600);
  await rateLimit(`assistant:global-daily${local ? ':local' : ''}`, local ? 10000 : 100, 86400);
  let result: z.infer<typeof assistantOutput>;
  let cmsPassages:CmsPassage[]=[];
  let catalogPassages:CatalogPassage[]=[];
  const documentLocale=input.locale??'ru';
  const plan=semanticConversationPlan(input.question,input.history,documentLocale,local);
  const locale=input.locale??(isKazakh(input.question)?'kk':'ru');
  try {
    if(!process.env.ASSISTANT_SERVICE_URL&&plan.handled&&requiresCatalogEvidence(plan,input.question))catalogPassages=await retrieveSemanticCatalog(plan);
    if(!process.env.ASSISTANT_SERVICE_URL&&(!plan.handled||!requiresCatalogEvidence(plan,input.question)))cmsPassages=await retrieveCmsPassages(cmsQuestionContext(input.question,input.history),locale);
    if(!process.env.ASSISTANT_SERVICE_URL&&plan.handled&&!requiresCatalogEvidence(plan,input.question)&&!cmsPassages.length)catalogPassages=await retrieveSemanticCatalog(plan);
    result = assistantOutput.parse(process.env.ASSISTANT_SERVICE_URL
      ? await serviceRequest(process.env.ASSISTANT_SERVICE_URL, process.env.ASSISTANT_SERVICE_TOKEN, { ...input, maxOutputTokens: 500 }, 15000)
      : cmsPassages.length ? cmsAnswer(cmsPassages,locale)
      : plan.handled ? semanticCatalogAnswer(catalogPassages,plan,local)
      : locale==='en' ? (local?englishSiteDialog(input.question,input.history):cmsAnswer([],locale))
      : local ? await answerSiteDialog(input.question, input.history,documentLocale)
      : await answerFromSources(input.question, await retrievePassages(input.question, 'expanded',undefined,documentLocale)));
  } catch { unavailableAssistant(); }
  if ((!result.noAnswer && !result.sourceIds.length) || (result.noAnswer && result.sourceIds.length)) throw new ApiError(502, 'INVALID_ASSISTANT_RESPONSE', 'Ответ помощника не прошёл проверку источников.');
  const ids = [...new Set(result.sourceIds)];
  const selectedCatalog=catalogPassages.filter(p=>ids.includes(p.id));
  if(!await revalidateCatalogSources(selectedCatalog))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  const selectedCms=cmsPassages.filter(p=>ids.includes(p.id));
  if(!await revalidateCmsPassages(selectedCms,locale))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  const documents = await db.document.findMany({ where: { id: { in: ids }, ...publicDocumentWhere, allowDigitalCopy: true }, select: { id: true, title: true, isDemo: true,translations:{where:{locale:documentLocale},select:{title:true}} } });
  const sources = ids.map(id => {
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
  return json({...(research?{researchSteps,actions:researchActions,researchLimitations:research.limitations}:{}),...(expansion?{nameExpansion:expansion,nameExpansionProvenance:{kind:'project_dictionary',sourceIds:[...new Set(plan.nameExpansion!.matches.flatMap(m=>m.sourceIds))]}}:{}), answer: result.answer, noAnswer: result.noAnswer, mode: result.mode ?? 'external', sources,...(plan.handled&&!plan.clarification&&!cmsPassages.length&&!process.env.ASSISTANT_SERVICE_URL?{catalogQuery:plan.filters}:{}) });
}
