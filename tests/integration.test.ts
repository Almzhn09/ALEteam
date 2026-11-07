import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must point to a dedicated database ending in _test.');
process.env.DATABASE_URL = databaseUrl;
const { db } = await import('../src/server/db');
const base = 'http://localhost:3081';
const authorPassword = randomBytes(32).toString('hex');
const moderatorPassword = randomBytes(32).toString('hex');
let app: ChildProcess; let services: Server;
let authorCookie: string; let moderatorCookie: string;
let serviceMode = 'pending';
const endpointEnv = { ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: base,
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ALLOW_DEMO_SEED: '1',
  DEMO_AUTHOR_PASSWORD: authorPassword, DEMO_MODERATOR_PASSWORD: moderatorPassword };
async function call(url: string, method = 'GET', body?: unknown, cookie?: string, extra: Record<string,string> = {}) {
  return fetch(base + url, { method, headers: { origin: base, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
}
async function login(email: string, password: string) {
  const response = await call('/api/auth/sign-in/email', 'POST', { email, password });
  assert.equal(response.status, 200, 'credential sign-in must succeed');
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some(c => c.includes('HttpOnly')));
  return cookies.map(c => c.split(';')[0]).join('; ');
}
before(async () => {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { env: endpointEnv, stdio: 'pipe' });
  // Dedicated test database only: remove previous test-owned users/comments, preserving fixture documents.
  await db.moderationDecision.deleteMany(); await db.report.deleteMany(); await db.comment.deleteMany();
  await db.session.deleteMany(); await db.account.deleteMany(); await db.user.deleteMany();
  await db.rateLimit.deleteMany(); await db.apiRateLimit.deleteMany();
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], { env: endpointEnv, stdio: 'pipe' });
  services = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain bounded test request */ }
    if (request.url === '/moderate') {
      if (serviceMode === 'failure') { response.writeHead(503).end(); return; }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(serviceMode === 'clean' ? { status: 'PUBLISHED', reason: 'CLEAN', version: 'test-v1' }
        : serviceMode === 'reject' ? { status: 'REJECTED', reason: 'PROFANITY', version: 'test-v1' }
        : { status: 'PENDING', reason: 'REVIEW_REQUIRED', version: 'test-v1' }));
    } else {
      if (serviceMode === 'assistant-failure') { response.writeHead(503).end(); return; }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(serviceMode === 'fake-source'
        ? { answer: 'test', sourceIds: ['missing-document'], noAnswer: false }
        : { answer: 'Ответ тестового адаптера.', sourceIds: ['demo-doc-01'], noAnswer: false }));
    }
  });
  services.listen(0, '127.0.0.1'); await once(services, 'listening');
  const address = services.address(); assert.ok(address && typeof address !== 'string');
  const internal = `http://127.0.0.1:${address.port}`;
  app = spawn(process.execPath, ['--use-env-proxy', 'node_modules/next/dist/bin/next', 'start', '--port', '3081'], {
    env: { ...endpointEnv, MODERATION_SERVICE_URL: internal + '/moderate', ASSISTANT_SERVICE_URL: internal + '/assistant', NODE_ENV: 'production' }, stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error('Test application exited before readiness.');
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch { /* wait for startup */ }
    await delay(200);
  }
  assert.ok(ready, 'application and PostgreSQL become healthy');
  authorCookie = await login('author@example.test', authorPassword);
  moderatorCookie = await login('moderator@example.test', moderatorPassword);
}, { timeout: 60000 });
after(async () => {
  if (app && app.exitCode === null) { app.kill('SIGTERM'); await once(app, 'exit'); }
  if (services) await new Promise<void>(resolve => services.close(() => resolve()));
  await db.$disconnect();
});
test('catalog supports Russian stemming, combined filters, paging and stable sorting', async () => {
  const response = await call('/api/documents?q=библиотека&fundId=demo-fund-2&type=LETTER&yearFrom=1900&yearTo=2000&pageSize=1&sort=year_asc');
  assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.total, 1); assert.equal(data.items[0].id, 'demo-doc-01');
  const reference = await (await call('/api/documents?q=DEMO-Ф2-О1-Д1')).json(); assert.ok(reference.total >= 1);
  const empty = await (await call('/api/documents?q=несуществующийзапрос')).json(); assert.equal(empty.total, 0);
});
test('catalog rejects injection-shaped sort, duplicate params, invalid ranges and page size', async () => {
  for (const query of ['sort=year;DROP%20TABLE', 'pageSize=51', 'page=1&page=2', 'yearFrom=2000&yearTo=1900', 'isPublic=false']) assert.equal((await call('/api/documents?' + query)).status, 400);
  assert.equal((await call('/api/documents?q=%27%3BDROP%20TABLE%20%22Document%22%3B--')).status, 200);
  assert.equal(await db.document.count(), 20);
});
test('private documents and files are not exposed through listing, detail or URLs', async () => {
  await db.document.update({ where: { id: 'demo-doc-02' }, data: { isPublic: false } });
  try {
    assert.equal((await call('/api/documents/demo-doc-02')).status, 404);
    assert.equal((await call('/api/files/demo-file-2')).status, 404);
    assert.equal((await (await call('/api/documents?yearFrom=1910&yearTo=1910')).json()).total, 0);
  } finally { await db.document.update({ where: { id: 'demo-doc-02' }, data: { isPublic: true } }); }
});
test('file API serves PDF and enforces download permission and storage boundaries', async () => {
  const pdf = await call('/api/files/demo-file-1'); assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok((await pdf.text()).startsWith('%PDF-')); assert.equal(pdf.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await call('/api/files/demo-file-5?download=1')).status, 404);
  const file = await db.archiveFile.findUniqueOrThrow({ where: { id: 'demo-file-1' } });
  await db.archiveFile.update({ where: { id: file.id }, data: { storageKey: '../../package.json' } });
  try { assert.equal((await call('/api/files/demo-file-1')).status, 404); }
  finally { await db.archiveFile.update({ where: { id: file.id }, data: { storageKey: file.storageKey } }); }
});
test('anonymous users cannot post; author cannot access moderator queue or assign roles', async () => {
  assert.equal((await call('/api/documents/demo-doc-01/comments', 'POST', { body: 'text' })).status, 401);
  assert.equal((await call('/api/moderation/comments', 'GET', undefined, authorCookie)).status, 403);
  assert.equal((await call('/api/auth/sign-up/email', 'POST', { email: 'new@example.test', password: 'no', role: 'MODERATOR' })).status, 404);
  assert.equal((await call('/api/auth/update-user', 'POST', { role: 'MODERATOR' }, authorCookie)).status, 404);
});
test('CSRF, large JSON, malformed JSON and status injection are rejected', async () => {
  assert.equal((await call('/api/documents/demo-doc-01/comments', 'POST', { body: 'x' }, authorCookie, { origin: 'https://attacker.example' })).status, 403);
  const bad = await fetch(base + '/api/documents/demo-doc-01/comments', { method: 'POST', headers: { origin: base, cookie: authorCookie, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
  assert.equal((await call('/api/documents/demo-doc-01/comments', 'POST', { body: 'x'.repeat(17000) }, authorCookie)).status, 413);
  assert.equal((await call('/api/documents/demo-doc-01/comments', 'POST', { body: 'x', status: 'PUBLISHED' }, authorCookie)).status, 400);
});
let commentId: string;
test('comment idempotency, pending visibility and manual approval work over HTTP', async () => {
  const id = randomUUID(); const body = '<script>alert(1)</script> Тестовый комментарий';
  const response = await call('/api/documents/demo-doc-01/comments', 'POST', { body }, authorCookie, { 'idempotency-key': id });
  assert.equal(response.status, 201); const { item } = await response.json(); commentId = item.id; assert.equal(item.status, 'PENDING');
  const replay = await call('/api/documents/demo-doc-01/comments', 'POST', { body }, authorCookie, { 'idempotency-key': id });
  assert.equal(replay.status, 200); assert.equal((await replay.json()).item.id, item.id);
  assert.equal((await call('/api/documents/demo-doc-01/comments', 'POST', { body: 'different' }, authorCookie, { 'idempotency-key': id })).status, 409);
  assert.equal((await (await call('/api/documents/demo-doc-01/comments')).json()).total, 0);
  const queue = await (await call('/api/moderation/comments', 'GET', undefined, moderatorCookie)).json(); assert.ok(queue.items.some((c: {id:string}) => c.id === item.id));
  const approved = await call('/api/moderation/comments/' + item.id, 'PATCH', { status: 'PUBLISHED', reason: 'Проверено модератором', expectedUpdatedAt: item.updatedAt }, moderatorCookie);
  assert.equal(approved.status, 200);
  const published = await (await call('/api/documents/demo-doc-01/comments')).json(); assert.equal(published.items[0].body, body); assert.equal(published.items[0].author.email, undefined);
  const stale = await call('/api/moderation/comments/' + item.id, 'PATCH', { status: 'HIDDEN', reason: 'Устаревшее решение', expectedUpdatedAt: item.updatedAt }, moderatorCookie); assert.equal(stale.status, 409);
});
test('report, hide, audit and restore preserve moderation history', async () => {
  assert.equal((await call(`/api/comments/${commentId}/reports`, 'POST', { reason: 'Нужна проверка' }, authorCookie)).status, 201);
  assert.equal((await call(`/api/comments/${commentId}/reports`, 'POST', { reason: 'Повтор жалобы' }, authorCookie)).status, 201);
  assert.equal(await db.report.count({ where: { commentId } }), 1);
  const current = await db.comment.findUniqueOrThrow({ where: { id: commentId } });
  const hidden = await call(`/api/moderation/comments/${commentId}`, 'PATCH', { status: 'HIDDEN', reason: 'Скрыто для проверки', expectedUpdatedAt: current.updatedAt.toISOString() }, moderatorCookie);
  assert.equal(hidden.status, 200); const h = (await hidden.json()).item;
  assert.equal((await (await call('/api/documents/demo-doc-01/comments')).json()).total, 0);
  assert.equal(await db.report.count({ where: { commentId, resolvedAt: null } }), 0);
  assert.equal((await call(`/api/moderation/comments/${commentId}`, 'PATCH', { status: 'PUBLISHED', reason: 'Проверка завершена', expectedUpdatedAt: h.updatedAt }, moderatorCookie)).status, 200);
  const history = await (await call(`/api/moderation/comments/${commentId}/history`, 'GET', undefined, moderatorCookie)).json(); assert.equal(history.total, 3);
  assert.equal((await call(`/api/comments/${commentId}`, 'DELETE', {}, authorCookie)).status, 404);
});
test('moderation failure queues instead of publishing and rejects forbidden content via adapter', async () => {
  for (const [mode, expected] of [['failure', 'PENDING'], ['reject', 'REJECTED'], ['clean', 'PUBLISHED']]) {
    serviceMode = mode;
    const response = await call('/api/documents/demo-doc-01/comments', 'POST', { body: 'Тест адаптера ' + mode }, authorCookie, { 'idempotency-key': randomUUID() });
    assert.equal(response.status, 201); assert.equal((await response.json()).item.status, expected);
  }
  serviceMode = 'pending';
});
test('comment rate limit applies to a direct API call', async () => {
  let limited = false;
  for (let i = 0; i < 6; i++) {
    const response = await call('/api/documents/demo-doc-01/comments', 'POST', { body: 'Лимит ' + i }, authorCookie, { 'idempotency-key': randomUUID() });
    if (response.status === 429) { assert.ok(response.headers.get('retry-after')); limited = true; break; }
  }
  assert.ok(limited);
});
test('assistant adapter enforces public sources and authenticated access', async () => {
  assert.equal((await call('/api/assistant', 'POST', { question: 'Где библиотека?' })).status, 401);
  serviceMode = 'pending';
  const answer = await call('/api/assistant', 'POST', { question: 'Где библиотека?' }, authorCookie); assert.equal(answer.status, 200); assert.equal((await answer.json()).sources[0].id, 'demo-doc-01');
  serviceMode = 'fake-source';
  assert.equal((await call('/api/assistant', 'POST', { question: 'Источник?' }, authorCookie)).status, 502);
  serviceMode = 'pending';
  await db.document.update({ where: { id: 'demo-doc-01' }, data: { isPublic: false } });
  try { assert.equal((await call('/api/assistant', 'POST', { question: 'Закрытый источник?' }, authorCookie)).status, 502); }
  finally { await db.document.update({ where: { id: 'demo-doc-01' }, data: { isPublic: true } }); }
  serviceMode = 'assistant-failure';
  assert.equal((await call('/api/assistant', 'POST', { question: 'Сбой сервиса?' }, authorCookie)).status, 503);
  serviceMode = 'pending';
});
test('simultaneous writes cannot exceed the shared per-user comment limit', async () => {
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => call('/api/documents/demo-doc-01/comments', 'POST', { body: 'Параллельный запрос ' + i }, moderatorCookie, { 'idempotency-key': randomUUID() })));
  assert.equal(responses.filter(r => r.status === 201).length, 5);
  assert.equal(responses.filter(r => r.status === 429).length, 1);
});
test('revoking the moderator role takes effect with the existing session cookie', async () => {
  await db.user.update({ where: { id: 'demo-moderator' }, data: { role: 'AUTHOR' } });
  try { assert.equal((await call('/api/moderation/comments', 'GET', undefined, moderatorCookie)).status, 403); }
  finally { await db.user.update({ where: { id: 'demo-moderator' }, data: { role: 'MODERATOR' } }); }
});
test('logout invalidates server session', async () => {
  assert.equal((await call('/api/auth/sign-out', 'POST', {}, authorCookie)).status, 200);
  assert.equal((await call('/api/me', 'GET', undefined, authorCookie)).status, 401);
});
test('login brute-force limit cannot be bypassed by spoofing forwarded IP headers', async () => {
  let limited = false;
  for (let i = 0; i < 8; i++) {
    const response = await call('/api/auth/sign-in/email', 'POST', { email: 'author@example.test', password: 'wrong-password-123' }, undefined, { 'x-forwarded-for': `192.0.2.${i + 1}` });
    if (response.status === 429) { limited = true; break; }
    assert.equal(response.status, 401);
  }
  assert.ok(limited);
});
