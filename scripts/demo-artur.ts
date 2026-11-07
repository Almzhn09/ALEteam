import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.DEMO_BASE_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const origin = new URL(base).origin;
// Refuse to submit fixture comments to an arbitrary public archive server.
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Demo script accepts only a local ALEteam instance.');
const password = process.env.DEMO_AUTHOR_PASSWORD;
if (!password) throw new Error('DEMO_AUTHOR_PASSWORD is required.');
let cookie = '';
async function call(path: string, body?: unknown, extra: Record<string,string> = {}) {
  return fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
}
const login = await call('/api/auth/sign-in/email', { email: 'author@example.test', password });
if (!login.ok) throw new Error('Demo sign-in failed; check local seed and login limit.');
cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const events: unknown[] = [];
try {
  const catalog = await (await call('/api/documents?q=библиотека')).json();
  events.push({ step: 'search', total: catalog.total, firstDocument: catalog.items[0]?.id });
  for (const question of ['Найди документы о библиотеке', 'Что такое архивный фонд?', 'Свидетельство Иванова']) {
    const response = await call('/api/assistant', { question }); const data = await response.json();
    if (!response.ok) throw new Error('Assistant demonstration failed.');
    events.push({ step: 'assistant', mode: data.mode, noAnswer: data.noAnswer, sourceIds: data.sources.map((s: {id:string}) => s.id) });
  }
  for (const [label, text, expected] of [['clean', 'Спасибо за демонстрационный материал.', 'PUBLISHED'], ['blocked', 'нахуй', 'REJECTED'], ['quote', 'Цитата «сука».', 'PENDING']]) {
    const response = await call('/api/documents/demo-doc-01/comments', { body: text }, { 'Idempotency-Key': randomUUID() });
    const data = await response.json();
    if (!response.ok || data.item?.status !== expected) throw new Error('Comment demonstration failed; check limits and mode.');
    events.push({ step: 'comment', sample: label, status: data.item.status, id: data.item.id });
  }
  await mkdir('.local/reports', { recursive: true });
  const report = { recordedAt: new Date().toISOString(), recorded: true, label: 'Recorded server demo, not a live frontend presentation', events };
  await writeFile('.local/reports/demo-run.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await call('/api/auth/sign-out', {}); }
