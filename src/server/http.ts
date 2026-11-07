import { z } from 'zod';
import { db } from './db';
import { getAuth } from './auth';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function handle(work: () => Promise<Response>) {
  try { return await work(); } catch (error) {
    if (error instanceof ApiError) {
      const response = json({ error: { code: error.code, message: error.message } }, error.status);
      if (error.retryAfter) response.headers.set('Retry-After', String(error.retryAfter));
      return response;
    }
    if (error instanceof z.ZodError) return json({ error: { code: 'VALIDATION_ERROR', message: 'Проверьте параметры запроса.', fields: error.issues.map(i => ({ path: i.path.join('.'), code: i.code })) } }, 400);
    // Never log bodies, cookies, SQL parameters, user content or credentials.
    console.error('archive_api_request_failed');
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Не удалось выполнить запрос.' } }, 500);
  }
}
export async function readJson(request: Request, maxBytes = 16384): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED', 'Ожидается application/json.');
  const size = request.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > maxBytes)) throw new ApiError(413, 'BODY_TOO_LARGE', 'Слишком большой запрос.');
  if (!request.body) throw new ApiError(400, 'INVALID_JSON', 'Пустой запрос.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maxBytes) { await reader.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE', 'Слишком большой запрос.'); }
    chunks.push(chunk.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'Неверный JSON.'); }
}
export function sameOrigin(request: Request) {
  const expected = process.env.BETTER_AUTH_URL;
  if (!expected) throw new ApiError(503, 'CONFIGURATION_MISSING', 'Сервер не настроен.');
  if (request.headers.get('origin') !== new URL(expected).origin) throw new ApiError(403, 'ORIGIN_REJECTED', 'Недопустимый источник запроса.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'ORIGIN_REJECTED', 'Недопустимый источник запроса.');
}
export async function requireUser(request: Request, moderator = false) {
  const session = await getAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!session) throw new ApiError(401, 'AUTH_REQUIRED', 'Войдите в систему.');
  // Read the current role from DB; revocation takes effect immediately.
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Войдите в систему.');
  if (moderator && user.role !== 'MODERATOR') throw new ApiError(403, 'FORBIDDEN', 'Требуется роль модератора.');
  return user;
}
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export function queryParams(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new ApiError(400, 'DUPLICATE_PARAMETER', 'Параметр передан несколько раз.');
  return Object.fromEntries(params);
}
// Atomic fixed windows shared by all instances. No client-provided IP is trusted.
export async function rateLimit(key: string, max: number, seconds: number) {
  const now = Date.now();
  const window = Math.floor(now / (seconds * 1000));
  const expiresAt = new Date((window + 1) * seconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "ApiRateLimit" ("key", "count", "expiresAt") VALUES (${`${key}:${window}`}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = LEAST("ApiRateLimit"."count" + 1, ${max + 1}) RETURNING "count"`;
  if (rows[0].count > max) throw new ApiError(429, 'RATE_LIMITED', 'Слишком много запросов. Повторите позже.', Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)));
}
