// In-browser imitation of docs/API.md for frontend work without PostgreSQL.
// Enabled only with NEXT_PUBLIC_API_MOCK=1; it is not an integration and never ships as one.
import type { CommentStatus, CurrentUser, DocumentDetail, DocumentType, Fund, ModerationQueueItem } from '@/contracts/api';

const funds: Fund[] = [
  { id: 'demo-fund-1', name: 'Демо: городская история', description: 'Вымышленный фонд для тестирования интерфейса.' },
  { id: 'demo-fund-2', name: 'Демо: культура и образование', description: 'Вымышленный фонд для тестирования интерфейса.' },
];
const topics = ['библиотеки', 'городской площади', 'школы', 'музея', 'железной дороги'];
const types: DocumentType[] = ['LETTER', 'PHOTO', 'MAP', 'REPORT'];
const documents: DocumentDetail[] = Array.from({ length: 20 }, (_, n) => {
  const i = n + 1; const id = `demo-doc-${String(i).padStart(2, '0')}`; const fund = funds[i % 2];
  return {
    id, title: `Демо: история ${topics[(i - 1) % topics.length]} №${i}`,
    description: 'Полностью вымышленная запись для разработки и проверки интерфейса. Не является историческим свидетельством.',
    reference: `DEMO-Ф${i % 2 + 1}-О1-Д${i}`, year: 1900 + i * 5, type: types[(i - 1) % 4], fundId: fund.id, isDemo: true,
    sourceUrl: null, rights: 'Оригинальные синтетические данные ALEteam. Только для демонстрации.', isPublic: true,
    createdAt: '2026-11-07T00:00:00.000Z', fund,
    files: i <= 5 ? Array.from({ length: i === 1 ? 3 : 1 }, (_, p) => ({
      id: `demo-file-${i}${p ? `-${p + 1}` : ''}`, name: `Демонстрационный скан ${i}${p ? `, лист ${p + 1}` : ''}.png`,
      mimeType: 'image/png', size: 48_000, downloadable: i !== 5,
    })) : [],
  };
});

const users: Record<string, CurrentUser> = {
  'author@example.test': { id: 'demo-author', name: 'Автор демо', email: 'author@example.test', role: 'AUTHOR' },
  'moderator@example.test': { id: 'demo-moderator', name: 'Модератор демо', email: 'moderator@example.test', role: 'MODERATOR' },
};
export const MOCK_PASSWORD = 'demo-password-123';

interface StoredComment {
  id: string; documentId: string; authorId: string; body: string; status: CommentStatus; reason: string;
  moderationVersion: string; idempotencyKey: string; createdAt: string; updatedAt: string;
  reports: { id: string; reporterId: string; reason: string; createdAt: string; resolvedAt: string | null }[];
}
const comments: StoredComment[] = [{
  id: 'mock-c1', documentId: 'demo-doc-01', authorId: 'demo-moderator', body: 'Интересный демонстрационный материал, спасибо.',
  status: 'PUBLISHED', reason: 'CLEAN', moderationVersion: 'mock', idempotencyKey: 'seed', createdAt: '2026-11-07T08:00:00.000Z',
  updatedAt: '2026-11-07T08:00:00.000Z', reports: [],
}];
const decisions: { id: string; commentId: string; moderatorId: string; fromStatus: string; toStatus: string; reason: string; createdAt: string }[] = [];
// Persist mock discussions per tab so full page loads behave like a server.
const stateKey = 'aleteam-mock-state';
let restored = false;
function restore() {
  if (restored) return; restored = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem(stateKey) ?? 'null');
    if (saved?.comments) { comments.splice(0, comments.length, ...saved.comments); decisions.splice(0, decisions.length, ...saved.decisions); }
  } catch { /* start fresh */ }
}
function persist() { try { sessionStorage.setItem(stateKey, JSON.stringify({ comments, decisions })); } catch { /* ignore */ } }

const sessionKey = 'aleteam-mock-session';
function currentUser(): CurrentUser | null {
  try { const email = sessionStorage.getItem(sessionKey); return email ? users[email] ?? null : null; } catch { return null; }
}

class MockError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const delay = () => new Promise(r => setTimeout(r, 250 + Math.random() * 350));
const nowIso = () => new Date().toISOString();
function needUser(moderator = false) {
  const user = currentUser();
  if (!user) throw new MockError(401, 'AUTH_REQUIRED', 'Войдите в систему.');
  if (moderator && user.role !== 'MODERATOR') throw new MockError(403, 'FORBIDDEN', 'Требуется роль модератора.');
  return user;
}
function findDoc(id: string) {
  const doc = documents.find(d => d.id === id);
  if (!doc) throw new MockError(404, 'NOT_FOUND', 'Документ не найден.');
  return doc;
}
function paging(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 1); const pageSize = Number(params.get('pageSize') ?? 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
  return { page, pageSize };
}
const slice = <T,>(items: T[], p: { page: number; pageSize: number }) => items.slice((p.page - 1) * p.pageSize, p.page * p.pageSize);
// Rough stand-in for Russian morphology: compare word stems.
const stem = (w: string) => w.toLowerCase().replace(/[^a-zа-яё0-9-]/gi, '').slice(0, Math.max(4, w.length - 2));

function catalog(params: URLSearchParams) {
  const allowed = ['q', 'fundId', 'type', 'yearFrom', 'yearTo', 'sort', 'page', 'pageSize'];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length > 1) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
  const p = paging(params);
  const q = (params.get('q') ?? '').trim(); const type = params.get('type'); const fundId = params.get('fundId');
  const yearFrom = params.get('yearFrom') ? Number(params.get('yearFrom')) : undefined;
  const yearTo = params.get('yearTo') ? Number(params.get('yearTo')) : undefined;
  if (type && !types.includes(type as DocumentType)) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
  if ((yearFrom !== undefined && !Number.isInteger(yearFrom)) || (yearTo !== undefined && !Number.isInteger(yearTo))
    || (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo)) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
  const words = q.split(/\s+/).filter(Boolean).map(stem);
  const sorted = documents.filter(d => (!words.length || d.reference.toLowerCase().includes(q.toLowerCase())
      || words.every(w => `${d.title} ${d.description}`.toLowerCase().includes(w)))
    && (!type || d.type === type) && (!fundId || d.fundId === fundId)
    && (yearFrom === undefined || d.year >= yearFrom) && (yearTo === undefined || d.year <= yearTo))
    .sort((a, b) => ({ year_asc: a.year - b.year, title: a.title.localeCompare(b.title, 'ru') }[params.get('sort') ?? ''] ?? b.year - a.year));
  return json({ items: slice(sorted, p).map(({ id, title, description, reference, year, type, fundId, isDemo }) => ({ id, title, description, reference, year, type, fundId, isDemo })), total: sorted.length, ...p });
}

async function route(url: URL, method: string, init: RequestInit) {
  const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const r = path.join('/');
  const body = () => { try { return JSON.parse(String(init.body ?? '')) as Record<string, unknown>; } catch { throw new MockError(400, 'INVALID_JSON', 'Неверный JSON.'); } };
  if (r === 'auth/sign-in/email' && method === 'POST') {
    const { email, password } = body() as { email?: string; password?: string };
    if (!email || !users[email] || password !== MOCK_PASSWORD) return json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401);
    sessionStorage.setItem(sessionKey, email); return json({ ok: true });
  }
  if (r === 'auth/sign-out' && method === 'POST') { sessionStorage.removeItem(sessionKey); return json({ success: true }); }
  if (r === 'funds') return json({ items: funds });
  if (r === 'documents') return catalog(url.searchParams);
  if (path[0] === 'documents' && path.length === 2) return json({ item: findDoc(path[1]) });
  if (path[0] === 'documents' && path[2] === 'comments') {
    findDoc(path[1]);
    if (method === 'GET') {
      const list = comments.filter(c => c.documentId === path[1] && c.status === 'PUBLISHED');
      const p = paging(url.searchParams);
      return json({ items: slice(list, p).map(c => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: { name: Object.values(users).find(u => u.id === c.authorId)?.name ?? 'Автор' } })), total: list.length, ...p });
    }
    const user = needUser();
    const text = String(body().body ?? '').trim();
    if (!text || text.length > 2000) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
    const key = new Headers(init.headers).get('Idempotency-Key') ?? '';
    const existing = comments.find(c => c.authorId === user.id && c.idempotencyKey === key);
    if (existing) {
      if (existing.body !== text || existing.documentId !== path[1]) throw new MockError(409, 'IDEMPOTENCY_CONFLICT', 'Ключ уже использован для другого запроса.');
      return json({ item: existing });
    }
    // Mock filter: the marker word «мат» imitates REJECTED; everything else waits like the backend without M02.
    const rejected = /(^|\s)мат(\s|$)/i.test(text);
    const item: StoredComment = { id: `mock-c${comments.length + 1}`, documentId: path[1], authorId: user.id, body: text,
      status: rejected ? 'REJECTED' : 'PENDING', reason: rejected ? 'PROFANITY' : 'REVIEW_REQUIRED', moderationVersion: 'mock',
      idempotencyKey: key, createdAt: nowIso(), updatedAt: nowIso(), reports: [] };
    comments.push(item);
    return json({ item }, 201);
  }
  if (r === 'me') return json({ item: needUser() });
  if (r === 'me/comments') {
    const user = needUser(); const p = paging(url.searchParams);
    const list = comments.filter(c => c.authorId === user.id).reverse();
    return json({ items: slice(list, p).map(({ id, documentId, body, status, reason, createdAt }) => ({ id, documentId, body, status, reason, createdAt })), total: list.length, ...p });
  }
  if (path[0] === 'comments' && path[2] === 'reports' && method === 'POST') {
    const user = needUser(); const reason = String(body().reason ?? '').trim();
    if (reason.length < 3 || reason.length > 500) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
    const comment = comments.find(c => c.id === path[1] && c.status === 'PUBLISHED');
    if (!comment) throw new MockError(404, 'NOT_FOUND', 'Комментарий не найден.');
    if (!comment.reports.some(x => x.reporterId === user.id)) comment.reports.push({ id: `mock-r${Date.now()}`, reporterId: user.id, reason, createdAt: nowIso(), resolvedAt: null });
    return json({ item: { id: 'mock-r', createdAt: nowIso() } }, 201);
  }
  if (r === 'moderation/comments' && method === 'GET') {
    needUser(true); const p = paging(url.searchParams); const status = url.searchParams.get('status');
    const list = comments.filter(c => status ? c.status === status : c.status === 'PENDING' || c.reports.some(x => !x.resolvedAt));
    const items: ModerationQueueItem[] = slice(list, p).map(({ reports, ...c }) => ({ ...c,
      author: { id: c.authorId, name: Object.values(users).find(u => u.id === c.authorId)?.name ?? 'Автор' },
      reports: reports.filter(x => !x.resolvedAt).map(({ id, reason, createdAt }) => ({ id, reason, createdAt })) }));
    return json({ items, total: list.length, ...p });
  }
  if (path[0] === 'moderation' && path[1] === 'comments' && path.length === 3 && method === 'PATCH') {
    const user = needUser(true); const input = body() as { status?: CommentStatus; reason?: string; expectedUpdatedAt?: string };
    if (!['PUBLISHED', 'REJECTED', 'HIDDEN'].includes(input.status ?? '') || (input.reason ?? '').trim().length < 3) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
    const comment = comments.find(c => c.id === path[2]);
    if (!comment) throw new MockError(404, 'NOT_FOUND', 'Комментарий не найден.');
    if (comment.updatedAt !== input.expectedUpdatedAt) throw new MockError(409, 'STALE_DECISION', 'Комментарий изменился. Обновите очередь.');
    decisions.push({ id: `mock-d${decisions.length + 1}`, commentId: comment.id, moderatorId: user.id, fromStatus: comment.status, toStatus: input.status!, reason: input.reason!.trim(), createdAt: nowIso() });
    Object.assign(comment, { status: input.status, reason: 'MANUAL_DECISION', updatedAt: new Date(Math.max(Date.now(), Date.parse(comment.updatedAt) + 1)).toISOString() });
    comment.reports.forEach(x => { x.resolvedAt ??= nowIso(); });
    const { reports: _, ...item } = comment;
    return json({ item });
  }
  if (path[0] === 'moderation' && path[3] === 'history') {
    needUser(true); const p = paging(url.searchParams);
    const list = decisions.filter(d => d.commentId === path[2]).reverse();
    return json({ items: slice(list, p), total: list.length, ...p });
  }
  if (r === 'assistant' && method === 'POST') {
    needUser(); const question = String(body().question ?? '').trim();
    if (!question || question.length > 1000) throw new MockError(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса.');
    if (/недоступ|ошибк/i.test(question)) throw new MockError(503, 'ASSISTANT_UNAVAILABLE', 'Помощник временно недоступен.');
    const words = question.split(/\s+/).filter(w => w.length > 3).map(stem);
    const found = documents.filter(d => words.some(w => d.title.toLowerCase().includes(w))).slice(0, 3);
    if (!found.length) return json({ answer: 'В корпусе нет ответа.', noAnswer: true, sources: [] });
    return json({ answer: `Мок-ответ интерфейса (не LLM). По запросу найдено материалов: ${found.length}. Откройте источники ниже, чтобы проверить сведения.`,
      noAnswer: false, sources: found.map(d => ({ id: d.id, title: d.title, isDemo: d.isDemo, href: `/documents/${d.id}` })) });
  }
  throw new MockError(404, 'NOT_FOUND', 'Маршрут не найден или метод не поддерживается.');
}

export async function mockFetch(input: string, init: RequestInit): Promise<Response> {
  await delay();
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  restore();
  try { const response = await route(new URL(input, location.origin), init.method ?? 'GET', init); persist(); return response; }
  catch (error) {
    if (error instanceof MockError) return json({ error: { code: error.code, message: error.message } }, error.status);
    throw error;
  }
}

// Synthetic «scan» drawn as SVG so the viewer can be exercised without real files.
export function mockFileUrl(id: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
<rect width="1200" height="1600" fill="#efe6d2"/><rect x="60" y="60" width="1080" height="1480" fill="none" stroke="#8a7350" stroke-width="4"/>
<text x="600" y="220" font-family="Georgia,serif" font-size="64" text-anchor="middle" fill="#3b3326">ДЕМОНСТРАЦИОННЫЙ СКАН</text>
<text x="600" y="300" font-family="Georgia,serif" font-size="40" text-anchor="middle" fill="#5c4f3a">${id.replace(/[^a-z0-9-]/gi, '')}</text>
${Array.from({ length: 22 }, (_, i) => `<rect x="140" y="${420 + i * 46}" width="${700 + ((i * 137) % 220)}" height="14" rx="7" fill="#b8a888"/>`).join('')}
<text x="600" y="1480" font-family="Georgia,serif" font-size="32" text-anchor="middle" fill="#7a2e1f">Вымышленный материал. Не архивный источник.</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
