import { db } from '@/server/db';
import { ApiError, handle, json, readJson, requireUser, sameOrigin } from '@/server/http';
import { getAuth } from '@/server/auth';
import { documentList, fileResponse, publicDocument } from '@/server/catalog';
import { createComment, decideComment, decisionHistory, listComments, moderationQueue, ownComments, reportComment } from '@/server/discussions';
import { assistant } from '@/server/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function dispatch(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return handle(async () => {
    const { path = [] } = await context.params;
    const method = request.method;
    const route = path.join('/');
    // Restrict auth surface to login/logout/session. No public sign-up or user mutation.
    if (path[0] === 'auth') {
      if (!['auth/sign-in/email', 'auth/sign-out', 'auth/get-session'].includes(route)) throw new ApiError(404, 'NOT_FOUND', 'Маршрут не найден.');
      if (method !== (route === 'auth/get-session' ? 'GET' : 'POST')) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается.');
      if (method === 'POST') {
        sameOrigin(request);
        const body = await readJson(request, 4096);
        request = new Request(request.url, { method, headers: request.headers, body: JSON.stringify(body) });
      }
      const response = await getAuth().handler(request);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    if (method !== 'GET') sameOrigin(request);
    if (route === 'health' && method === 'GET') {
      try { await db.$queryRaw`SELECT 1`; return json({ status: 'ok', database: 'ok' }); }
      catch { return json({ status: 'unavailable', database: 'unavailable' }, 503); }
    }
    if (route === 'funds' && method === 'GET') return json({ items: await db.fund.findMany({ where: { documents: { some: { isPublic: true } } }, orderBy: { id: 'asc' } }) });
    if (route === 'documents' && method === 'GET') return documentList(request);
    if (path[0] === 'documents' && path.length === 2 && method === 'GET') return json({ item: await publicDocument(path[1]) });
    if (path[0] === 'documents' && path.length === 3 && path[2] === 'comments') {
      if (method === 'GET') return listComments(request, path[1]);
      if (method === 'POST') return createComment(request, path[1]);
    }
    if (path[0] === 'files' && path.length === 2 && method === 'GET') return fileResponse(request, path[1]);
    if (route === 'me' && method === 'GET') {
      const user = await requireUser(request);
      return json({ item: { id: user.id, name: user.name, email: user.email, role: user.role } });
    }
    if (route === 'me/comments' && method === 'GET') return ownComments(request);
    if (path[0] === 'comments' && path.length === 3 && path[2] === 'reports' && method === 'POST') return reportComment(request, path[1]);
    if (route === 'moderation/comments' && method === 'GET') return moderationQueue(request);
    if (path[0] === 'moderation' && path[1] === 'comments') {
      if (path.length === 3 && method === 'PATCH') return decideComment(request, path[2]);
      if (path.length === 4 && path[3] === 'history' && method === 'GET') return decisionHistory(request, path[2]);
    }
    if (route === 'assistant' && method === 'POST') return assistant(request);
    throw new ApiError(404, 'NOT_FOUND', 'Маршрут не найден или метод не поддерживается.');
  });
}
export { dispatch as GET, dispatch as POST, dispatch as PATCH, dispatch as DELETE, dispatch as PUT };
