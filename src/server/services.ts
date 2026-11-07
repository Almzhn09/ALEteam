import { z } from 'zod';
import { ApiError } from './http';
import { moderateText } from './moderation';

export function serviceUrl(value: string) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error('INVALID_SERVICE_URL');
  return url;
}
export async function serviceRequest(url: string, token: string | undefined, body: unknown, timeout: number) {
  const response = await fetch(serviceUrl(url), {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), redirect: 'error', cache: 'no-store',
  });
  if (!response.ok || !response.body) throw new Error('SERVICE_UNAVAILABLE');
  const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const item = await reader.read(); if (item.done) break;
    bytes += item.value.byteLength;
    if (bytes > 32768) { await reader.cancel(); throw new Error('SERVICE_RESPONSE_TOO_LARGE'); }
    chunks.push(item.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
export const moderationResult = z.object({
  status: z.enum(['PUBLISHED', 'PENDING', 'REJECTED']),
  reason: z.enum(['CLEAN', 'PROFANITY', 'REVIEW_REQUIRED']),
  version: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/),
}).strict().refine(r => (r.status === 'PUBLISHED' && r.reason === 'CLEAN') || (r.status === 'REJECTED' && r.reason === 'PROFANITY') || (r.status === 'PENDING' && r.reason === 'REVIEW_REQUIRED'));
export async function moderate(body: string) {
  const pending = { status: 'PENDING' as const, reason: 'REVIEW_REQUIRED', version: 'manual-review-v1' };
  if (process.env.MODERATION_MODE === 'manual') return pending;
  const local = moderateText(body);
  if (local.status !== 'PUBLISHED' || !process.env.MODERATION_SERVICE_URL) return local;
  try {
    const result = moderationResult.parse(await serviceRequest(process.env.MODERATION_SERVICE_URL, process.env.MODERATION_SERVICE_TOKEN, { text: body }, 3000));
    return { status: result.status, reason: result.reason, version: result.version };
  } catch { return pending; }
}
export function unavailableAssistant(): never {
  throw new ApiError(503, 'ASSISTANT_UNAVAILABLE', 'ИИ-помощник пока недоступен. Попробуйте поиск по каталогу.');
}
