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
import {englishSiteDialog} from './english-dialog';

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
  const locale=input.locale??(isKazakh(input.question)?'kk':'ru');
  try {
    if(!process.env.ASSISTANT_SERVICE_URL)cmsPassages=await retrieveCmsPassages(cmsQuestionContext(input.question,input.history),locale);
    result = assistantOutput.parse(process.env.ASSISTANT_SERVICE_URL
      ? await serviceRequest(process.env.ASSISTANT_SERVICE_URL, process.env.ASSISTANT_SERVICE_TOKEN, { ...input, maxOutputTokens: 500 }, 15000)
      : cmsPassages.length ? cmsAnswer(cmsPassages,locale)
      : locale==='en' ? (local?englishSiteDialog(input.question,input.history):cmsAnswer([],locale))
      : local ? await answerSiteDialog(input.question, input.history)
      : await answerFromSources(input.question, await retrievePassages(input.question, 'expanded')));
  } catch { unavailableAssistant(); }
  if ((!result.noAnswer && !result.sourceIds.length) || (result.noAnswer && result.sourceIds.length)) throw new ApiError(502, 'INVALID_ASSISTANT_RESPONSE', 'Ответ помощника не прошёл проверку источников.');
  const ids = [...new Set(result.sourceIds)];
  const selectedCms=cmsPassages.filter(p=>ids.includes(p.id));
  if(!await revalidateCmsPassages(selectedCms,locale))throw new ApiError(503,'ASSISTANT_SOURCE_CHANGED','Публикация изменилась. Повторите вопрос.');
  const documents = await db.document.findMany({ where: { id: { in: ids }, isPublic: true, allowDigitalCopy: true }, select: { id: true, title: true, isDemo: true } });
  const sources = ids.map(id => {
    const cms=selectedCms.find(p=>p.id===id);
    if(cms)return {id:cms.id,title:cms.title,isDemo:cms.isDemo,kind:'cms',locale,href:cms.href};
    const guide = getGuide(id);
    if (guide) return { id, title: input.locale==='en'?guide.titleEn:guide.title, locale:input.locale==='en'?'en':undefined, isDemo: false, kind: 'guide', href: `/api/guides/${id}` };
    const document = documents.find(d => d.id === id);
    return document ? { ...document, kind: 'document', href: `/api/documents/${id}` } : undefined;
  });
  if (sources.some(s => !s)) throw new ApiError(502, 'INVALID_ASSISTANT_RESPONSE', 'Ответ помощника содержит недоступный источник.');
  return json({ answer: result.answer, noAnswer: result.noAnswer, mode: result.mode ?? 'external', sources });
}
