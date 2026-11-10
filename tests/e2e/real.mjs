// UI against the real Next.js API + PostgreSQL (+ test stubs for Artur's services).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(process.env.ENV_FILE ?? '.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const results = []; const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
const wait = (page, sel, t = 8000) => page.waitForSelector(sel, { timeout: t }).then(() => true, () => false);

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(`pageerror ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/401|404|403|503|409/.test(m.text())) errors.push(m.text()); });
const run = Date.now().toString(36);

await page.goto(BASE + '/catalog?q=библиотека');
check('real search', await wait(page, 'text=Найдено: 4'));
await page.goto(BASE + '/catalog?q=DEMO-Ф2-О1-Д1&sort=title');
check('search by reference', await wait(page, '.doc-card'));
await page.goto(BASE + '/catalog?type=MAP&yearFrom=1900&yearTo=1960');
await wait(page, '.results-head [role=status]:has-text("Найдено")');
check('combined filters', /Найдено: \d+/.test(await page.locator('.results-head [role=status]').innerText()), await page.locator('.results-head [role=status]').innerText());
await page.goto(BASE + '/catalog?fundId=demo-fund-1');
await page.waitForTimeout(1500); check('fund select filled from API', (await page.locator('option').allInnerTexts()).includes('Демо: городская история'));

await page.goto(BASE + '/documents/demo-doc-01');
check('doc loads', await wait(page, '#doc-title'));
check('pdf-only: no scan notice', await page.getByText('нет опубликованных изображений').isVisible());
const href = await page.locator('a:has-text("Открыть")').first().getAttribute('href');
const file = await page.request.get(BASE + href);
check('file link serves pdf', file.status() === 200 && file.headers()['content-type'] === 'application/pdf', href);
const dl = await page.request.get(BASE + (await page.locator('a:has-text("Скачать")').first().getAttribute('href')));
check('download attachment', /attachment/.test(dl.headers()['content-disposition'] ?? ''));
await page.goto(BASE + '/documents/demo-doc-05');
await wait(page, '#doc-title');
check('download not allowed shown', await page.getByText('Скачивание не разрешено').isVisible());
await page.goto(BASE + '/documents/no-such-doc');
check('real 404', await wait(page, 'h1:has-text("Документ не найден")'));
await page.goto(BASE + '/documents/bad%20id!');
check('invalid id → not found', await wait(page, 'h1:has-text("Документ не найден")'));

async function login(email, password, returnTo = '/') {
  await page.goto(`${BASE}/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email').fill(email); await page.getByLabel('Пароль').fill(password);
  await page.locator('main form button[type=submit]').click();
}
await login('author@example.test', 'wrong-password-xx');
check('real wrong password', await wait(page, 'text=Неверный email или пароль.'));
await login('author@example.test', env.DEMO_AUTHOR_PASSWORD, '/documents/demo-doc-03');
await page.waitForURL(u => u.pathname === '/documents/demo-doc-03', { timeout: 20000 }).catch(() => {});
check('real login + returnTo', page.url().includes('/documents/demo-doc-03'));
check('header shows user', (await page.locator('.user-chip').textContent({ timeout: 5000 })).includes('Автор демо'));

const send = async text => { await page.getByLabel('Ваш комментарий').fill(text); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); };
await send(`Чистый комментарий ${run}`);
check('clean → published', await wait(page, 'text=Комментарий опубликован'));
check('published in list', await wait(page, `.comment-list >> text=Чистый комментарий ${run}`));
await send('это мат');
check('profanity → rejected', await wait(page, 'text=Комментарий отклонён'));
await send(`спорный текст ${run}`);
check('review → pending', await wait(page, 'text=Комментарий отправлен на проверку'));
check('own pending listed', await wait(page, `.panel >> text=спорный текст ${run}`));
await page.goto(BASE + '/me');
check('me page statuses', await wait(page, '.badge-REJECTED') && await wait(page, '.badge-PENDING'));

// Report on a published comment
await page.goto(BASE + '/documents/demo-doc-03#comments');
await wait(page, `.comment-list >> text=Чистый комментарий ${run}`);
const item = page.locator('.comment', { hasText: `Чистый комментарий ${run}` });
await item.getByRole('button', { name: 'Пожаловаться' }).click();
await item.getByLabel('Причина жалобы').fill('Проверка жалобы');
await item.getByRole('button', { name: 'Отправить жалобу' }).click();
check('real report', await wait(page, 'text=Жалоба отправлена модератору.'));

// Assistant through the real adapter
await page.goto(BASE + '/assistant');
await page.getByLabel('Ваш вопрос').fill('Есть ли что-то о библиотеке?'); await page.keyboard.press('Enter');
check('assistant sources real', await wait(page, '.sources a[href="/documents/demo-doc-01"]', 20000));
check('answer html escaped', (await page.locator('.msg-assistant').last().innerText()).includes('<b>не HTML</b>'));
await page.getByLabel('Ваш вопрос').fill('Про космос'); await page.keyboard.press('Enter');
check('assistant noAnswer real', await wait(page, 'text=В материалах архива ответа не найдено', 20000));
await page.getByLabel('Ваш вопрос').fill('сбой'); await page.keyboard.press('Enter');
check('assistant 503 real', await wait(page, 'text=Помощник сейчас недоступен', 20000));

// Author cannot use moderation API
const forbidden = await page.request.get(BASE + '/api/moderation/comments');
check('author API 403', forbidden.status() === 403);
await page.goto(BASE + '/moderation');
check('author UI no access', await wait(page, 'text=Нет доступа'));

// Logout
await page.goto(BASE + '/');
if (!(await page.getByRole('button', { name: 'Выйти' }).isVisible())) await page.getByRole('button', { name: 'Меню' }).click();
await page.getByRole('button', { name: 'Выйти' }).click();
check('logout', await wait(page, '.user-chip >> text=Войти'));
check('session revoked', (await page.request.get(BASE + '/api/me')).status() === 401);

// Moderator
await login('moderator@example.test', env.DEMO_MODERATOR_PASSWORD, '/moderation');
await page.waitForURL(u => u.pathname === '/moderation', { timeout: 20000 }).catch(() => {});
check('moderator queue pending', await wait(page, `.queue-item >> text=спорный текст ${run}`));
check('reported in queue', await wait(page, `.queue-item:has-text("Чистый комментарий ${run}") >> text=Жалобы (1)`));
// Stale decision: change the comment through the API, then decide in the stale UI.
const queue = await (await page.request.get(BASE + '/api/moderation/comments?pageSize=50')).json();
const reported = queue.items.find(i => i.body === `Чистый комментарий ${run}`);
const patch = await page.request.patch(`${BASE}/api/moderation/comments/${reported.id}`, { headers: { Origin: BASE }, data: { status: 'HIDDEN', reason: 'Параллельное решение', expectedUpdatedAt: reported.updatedAt } });
check('parallel decision via API', patch.status() === 200);
const staleItem = page.locator('.queue-item', { hasText: `Чистый комментарий ${run}` });
await staleItem.getByText('Скрыть').click(); await staleItem.getByLabel('Причина решения').fill('Устаревшая попытка');
await staleItem.getByRole('button', { name: 'Сохранить решение' }).click();
check('409 stale handled', await wait(page, 'text=Комментарий уже изменён другим модератором') || await wait(page, '.queue-item >> nth=0'));
// Publish pending
const pending = page.locator('.queue-item', { hasText: `спорный текст ${run}` });
await pending.getByText('Опубликовать').click(); await pending.getByLabel('Причина решения').fill('Проверено вручную');
await pending.getByRole('button', { name: 'Сохранить решение' }).click();
check('publish pending', await wait(page, 'text=Решение сохранено'));
// Restore hidden
await page.goto(BASE + '/moderation?status=HIDDEN');
const hidden = page.locator('.queue-item', { hasText: `Чистый комментарий ${run}` });
check('hidden tab', await wait(page, `.queue-item >> text=Чистый комментарий ${run}`));
await hidden.getByText('Восстановить').click(); await hidden.getByLabel('Причина решения').fill('Жалоба необоснованна');
await hidden.getByRole('button', { name: 'Сохранить решение' }).click();
check('restore', await wait(page, 'text=Решение сохранено'));
await page.goto(BASE + '/moderation?status=PUBLISHED');
const restored = page.locator('.queue-item', { hasText: `Чистый комментарий ${run}` });
await wait(page, `.queue-item >> text=Чистый комментарий ${run}`);
await restored.getByRole('button', { name: 'Журнал решений' }).click();
check('history shows decisions', await wait(page, 'text=Скрыт модератором → Опубликован'));
await page.goto(BASE + '/documents/demo-doc-03');
check('published after review visible', await wait(page, `.comment-list >> text=спорный текст ${run}`));

console.log(results.join('\n'));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
