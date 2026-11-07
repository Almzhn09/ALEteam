import { z } from 'zod';
import { db } from './db';
import { ApiError, idSchema, json, rateLimit, readJson, requireUser } from './http';
import { serviceRequest, unavailableAssistant } from './services';

export const assistantInput = z.object({
  question: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) }).strict()).max(6).default([]),
}).strict();
const assistantOutput = z.object({ answer: z.string().trim().min(1).max(8000), sourceIds: z.array(idSchema).max(5), noAnswer: z.boolean() }).strict();
export async function assistant(request: Request) {
  const user = await requireUser(request);
  const input = assistantInput.parse(await readJson(request));
  if (!process.env.ASSISTANT_SERVICE_URL) unavailableAssistant();
  await rateLimit(`assistant:${user.id}`, 10, 3600);
  await rateLimit('assistant:global-daily', 100, 86400);
  let result: z.infer<typeof assistantOutput>;
  try {
    result = assistantOutput.parse(await serviceRequest(process.env.ASSISTANT_SERVICE_URL!, process.env.ASSISTANT_SERVICE_TOKEN, { ...input, maxOutputTokens: 500 }, 15000));
  } catch { unavailableAssistant(); }
  if ((!result.noAnswer && !result.sourceIds.length) || (result.noAnswer && result.sourceIds.length)) throw new ApiError(502, 'INVALID_ASSISTANT_RESPONSE', 'Ответ помощника не прошёл проверку источников.');
  const ids = [...new Set(result.sourceIds)];
  const sources = await db.document.findMany({ where: { id: { in: ids }, isPublic: true }, select: { id: true, title: true, isDemo: true } });
  if (sources.length !== ids.length) throw new ApiError(502, 'INVALID_ASSISTANT_RESPONSE', 'Ответ помощника содержит недоступный источник.');
  return json({ answer: result.answer, noAnswer: result.noAnswer, sources: sources.map(s => ({ ...s, href: `/documents/${s.id}` })) });
}
