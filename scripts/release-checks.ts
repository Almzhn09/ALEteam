import { chromium, type Browser, type Page } from 'playwright-core';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required.');
process.env.DATABASE_URL = url;
const { db } = await import('../src/server/db');
const base = 'http://localhost:3095';
const authorPassword = randomBytes(32).toString('hex'); const moderatorPassword = randomBytes(32).toString('hex');
const env = { ...process.env, DATABASE_URL: url, BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  ALLOW_DEMO_SEED: '1', DEMO_AUTHOR_PASSWORD: authorPassword, DEMO_MODERATOR_PASSWORD: moderatorPassword,
  MODERATION_MODE: 'local', MODERATION_SERVICE_URL: '', ASSISTANT_MODE: 'retrieval', ASSISTANT_SERVICE_URL: '', NEXT_PUBLIC_API_MOCK: '0' };
const checks: { name: string; passed: boolean; errorType?: string }[] = [];
const audits: unknown[] = []; const pageErrors: string[] = [];
let app: ChildProcess | undefined; let browser: Browser | undefined;
await mkdir('.local/release/screenshots', { recursive: true });
async function step(name: string, work: () => Promise<void>) {
  try { await work(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, passed: false, errorType: (error as Error).name }); console.log(`FAIL ${name}`); throw error; }
}
async function login(page: Page, email: string, password: string, returnTo: string) {
  await page.goto(`${base}/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(u => u.pathname === returnTo);
}
try {
  execFileSync(process.execPath, ['--import','tsx','scripts/migrate.ts'], { env, stdio: 'pipe' });
  // Only this explicitly dedicated test DB is reset; application/demo DB is untouched.
  await db.moderationDecision.deleteMany(); await db.report.deleteMany(); await db.comment.deleteMany();
  await db.session.deleteMany(); await db.account.deleteMany(); await db.user.deleteMany();
  await db.rateLimit.deleteMany(); await db.apiRateLimit.deleteMany();
  execFileSync(process.execPath, ['--import','tsx','prisma/seed.ts'], { env, stdio: 'pipe' });
  app = spawn(process.execPath, ['--use-env-proxy','node_modules/next/dist/bin/next','start','--port','3095'], { env, stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error('Release app exited before readiness');
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch { /* startup */ }
    await delay(100);
  }
  assert.ok(ready);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const authorContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const author = await authorContext.newPage(); author.setDefaultTimeout(10000);
  author.on('pageerror', error => pageErrors.push(error.name));
  await step('home search reaches real catalog and combined filters', async () => {
    await author.goto(base); await author.getByLabel('Что вы ищете', { exact: true }).fill('библиотека');
    await author.locator('.hero-search button[type=submit]').click();
    await author.waitForURL(/\/catalog\?q=/); await author.getByText('Найдено:').waitFor();
    assert.match(await author.locator('main').innerText(), /Найдено:\s*4/);
    await author.getByLabel('Тип документа', { exact: true }).selectOption('LETTER');
    await author.waitForURL(/type=LETTER/); await author.locator('a[href="/documents/demo-doc-01"]').first().waitFor();
  });
  await step('document renders real PNG, zoom, download policy and persisted favorites', async () => {
    await author.goto(base + '/documents/demo-doc-01');
    await author.locator('.viewer-stage img').waitFor({ state: 'visible' });
    assert.ok(await author.locator('.viewer-stage img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0));
    await author.getByRole('button', { name: 'Увеличить', exact: true }).click(); await author.locator('.viewer-toolbar').getByText('150%', { exact: true }).waitFor();
    await author.getByRole('button', { name: /^Добавить в избранное:/ }).click();
    await author.goto(base + '/favorites'); await author.reload(); await author.locator('main a[href="/documents/demo-doc-01"]').waitFor();
    assert.equal((await author.request.get(base + '/api/files/demo-file-5?download=1')).status(), 404);
  });
  await step('author signs in through the UI and cannot access moderation', async () => {
    await login(author, 'author@example.test', authorPassword, '/assistant');
    assert.equal((await author.request.get(base + '/api/moderation/comments')).status(), 403);
    await author.goto(base + '/moderation'); await author.getByText('Нет доступа', { exact: true }).waitFor();
  });
  await step('guest favorites transfer explicitly and synchronize across two browser sessions', async () => {
    await author.goto(base + '/favorites');
    await author.getByRole('button', { name: 'Перенести избранное этого браузера в мою учётную запись', exact: true }).click();
    await author.locator('main a[href="/documents/demo-doc-01"]').waitFor();
    const second = await browser!.newContext(); const device = await second.newPage();
    await login(device, 'author@example.test', authorPassword, '/favorites');
    await device.locator('main a[href="/documents/demo-doc-01"]').waitFor();
    assert.deepEqual(await device.evaluate(() => JSON.parse(localStorage.getItem('aleteam-favorites-v1') ?? '[]')), []);
    await second.close();
  });
  await step('document exposes actual OCR text and similar document links', async () => {
    await author.goto(base + '/documents/demo-doc-01');
    await author.locator('summary', { hasText: 'Распознанный текст (OCR)' }).click();
    await author.locator('details').filter({ has: author.locator('summary', { hasText: 'Распознанный текст (OCR)' }) }).locator('p.pre-wrap').waitFor();
    await author.locator('summary', { hasText: 'Похожие документы' }).click();
    await author.locator('details a[href="/documents/demo-doc-06"]').waitFor();
  });
  await step('assistant shows actual mode, document and guide links, and unknown-answer state', async () => {
    await author.goto(base + '/assistant');
    const ask = async (q: string, count: number) => {
      await author.getByLabel('Ваш вопрос', { exact: true }).fill(q); await author.getByLabel('Ваш вопрос', { exact: true }).press('Enter');
      await author.waitForFunction(n => document.querySelectorAll('[data-assistant-mode]').length === n, count);
    };
    await ask('Найди документы о библиотеке', 1);
    assert.equal(await author.locator('[data-assistant-mode]').last().getAttribute('data-assistant-mode'), 'retrieval');
    const docSource = author.locator('.sources a[href="/documents/demo-doc-01"]').first();
    await docSource.click(); await author.waitForURL(/\/documents\/demo-doc-01$/);
    await author.goto(base + '/assistant'); await author.locator('[data-assistant-mode]').first().waitFor();
    const previous = await author.locator('[data-assistant-mode]').count();
    await ask('Что такое архивный фонд?', previous + 1);
    await author.locator('.sources a[href="/about#guide-fund"]').click(); await author.waitForURL(/\/about#guide-fund$/); await author.locator('#guide-fund').waitFor();
    await author.goto(base + '/assistant'); await author.locator('[data-assistant-mode]').first().waitFor(); const stored = await author.locator('[data-assistant-mode]').count();
    await ask('Свидетельство Иванова', stored + 1); await author.getByText('В материалах архива ответа не найдено').waitFor();
  });
  const clean = 'Проверка полного пути: спасибо за документ.'; const quoted = 'Цитата «сука» для проверки очереди.';
  await step('comment UI publishes clean text, rejects a contextual Unicode bypass, and queues a quote', async () => {
    await author.goto(base + '/documents/demo-doc-03');
    const send = async (body: string, heading: string) => {
      await author.getByLabel('Ваш комментарий', { exact: true }).fill(body);
      await author.getByRole('button', { name: 'Отправить', exact: true }).click(); await author.getByText(heading, { exact: true }).waitFor();
    };
    await send(clean, 'Комментарий опубликован');
    await send('ты х🐱у🐱й да', 'Комментарий отклонён');
    await send(quoted, 'Комментарий отправлен на проверку');
    const data = await (await author.request.get(base + '/api/documents/demo-doc-03/comments')).json();
    assert.deepEqual(data.items.map((c: {body:string}) => c.body), [clean]);
  });
  const modContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const moderator = await modContext.newPage(); moderator.setDefaultTimeout(10000);
  moderator.on('pageerror', error => pageErrors.push(error.name));
  await step('moderator reviews the real pending comment through the UI', async () => {
    await login(moderator, 'moderator@example.test', moderatorPassword, '/moderation');
    const item = moderator.locator('.queue-item', { hasText: quoted }); await item.waitFor();
    await item.getByLabel('Опубликовать', { exact: true }).check(); await item.getByLabel('Причина решения', { exact: true }).fill('Контекст проверен в тестовом сценарии.');
    await item.getByRole('button', { name: 'Сохранить решение', exact: true }).click(); await moderator.getByText(/Решение сохранено/).first().waitFor();
    const published = await (await moderator.request.get(base + '/api/documents/demo-doc-03/comments')).json(); assert.equal(published.total, 2);
  });
  await step('report, hide and restore persist an auditable decision history', async () => {
    await author.goto(base + '/documents/demo-doc-03');
    const comment = author.locator('.comment', { hasText: quoted }).last(); await comment.getByRole('button', { name: 'Пожаловаться', exact: true }).click();
    await author.locator('dialog[open]').getByLabel('Причина жалобы', { exact: true }).fill('Контроль обработки жалобы.'); await author.locator('dialog[open]').getByRole('button', { name: 'Отправить жалобу', exact: true }).click();
    await author.getByText('Жалоба отправлена модератору.').waitFor();
    await moderator.goto(base + '/moderation'); const item = moderator.locator('.queue-item', { hasText: quoted });
    await item.getByLabel('Скрыть', { exact: true }).check(); await item.getByLabel('Причина решения', { exact: true }).fill('Проверка жалобы.');
    await item.getByRole('button', { name: 'Сохранить решение', exact: true }).click(); await moderator.getByText(/Решение сохранено/).first().waitFor();
    await moderator.goto(base + '/moderation?status=HIDDEN'); const hidden = moderator.locator('.queue-item', { hasText: quoted });
    await hidden.getByLabel('Восстановить', { exact: true }).check(); await hidden.getByLabel('Причина решения', { exact: true }).fill('Проверка завершена.');
    await hidden.getByRole('button', { name: 'Сохранить решение', exact: true }).click(); await moderator.getByText(/Решение сохранено/).first().waitFor();
    const record = await db.comment.findFirstOrThrow({ where: { body: quoted } }); assert.equal(await db.moderationDecision.count({ where: { commentId: record.id } }), 3);
  });
  await step('reply form creates a private notification, preferences persist and another account cannot read it', async () => {
    await moderator.goto(base + '/documents/demo-doc-03');
    const parent = moderator.locator('li.comment', { hasText: clean });
    await parent.getByRole('button', { name: 'Ответить', exact: true }).click();
    await parent.getByLabel('Ваш ответ', { exact: true }).fill('Спасибо! Ответ для проверки уведомлений.');
    await parent.getByRole('button', { name: 'Отправить', exact: true }).click();
    await parent.getByText('Комментарий опубликован', { exact: true }).waitFor();
    await author.goto(base + '/me');
    const messages = author.locator('section[aria-labelledby="notifications-title"]');
    await messages.getByText('На ваш комментарий ответили.', { exact: true }).waitFor();
    const notifications = await (await author.request.get(base + '/api/me/notifications')).json();
    const reply = notifications.items.find((n: { kind: string }) => n.kind === 'COMMENT_REPLY'); assert.ok(reply);
    const denied = await moderator.request.patch(base + '/api/me/notifications/' + reply.id, { headers: { Origin: base }, data: { read: true } }); assert.equal(denied.status(), 404);
    await messages.getByLabel('Ответы на мои комментарии', { exact: true }).uncheck();
    await author.waitForFunction(async () => (await (await fetch('/api/me/notification-settings')).json()).item.notifyReplies === false);
    await author.reload();
    await messages.getByLabel('Ответы на мои комментарии', { exact: true }).waitFor();
    assert.equal(await messages.getByLabel('Ответы на мои комментарии', { exact: true }).isChecked(), false);
    await messages.getByRole('button', { name: 'Отметить все прочитанными', exact: true }).click();
    await author.waitForFunction(async () => (await (await fetch('/api/me/notifications')).json()).unread === 0);
  });
  await step('signing out in another tab immediately hides account favorites', async () => {
    await author.goto(base + '/favorites');
    await author.locator('main a[href="/documents/demo-doc-01"]').waitFor();
    const tab = await authorContext.newPage();
    await tab.goto(base + '/me');
    await tab.getByRole('button', { name: 'Выйти', exact: true }).click();
    await author.getByText('Здесь пока пусто', { exact: true }).waitFor();
    assert.equal(await author.locator('main a[href="/documents/demo-doc-01"]').count(), 0);
    await tab.close();
  });
  const axe = await readFile('node_modules/axe-core/axe.min.js', 'utf8');
  await step('WCAG automated checks and responsive layout across RU/KK, light/dark and three widths', async () => {
    const routes = ['/', '/catalog?q=библиотека', '/documents/demo-doc-01', '/favorites', '/assistant', '/about', '/timeline', '/moderation', '/me'];
    const variants = [
      { width: 360, lang: 'ru', scheme: 'light' }, { width: 768, lang: 'ru', scheme: 'light' }, { width: 1440, lang: 'ru', scheme: 'light' },
      { width: 1440, lang: 'ru', scheme: 'dark' }, { width: 360, lang: 'kk', scheme: 'light' }, { width: 768, lang: 'kk', scheme: 'dark' },
    ] as const;
    for (const variant of variants) {
      await modContext.addCookies([{ name: 'lang', value: variant.lang, url: base }]);
      await moderator.setViewportSize({ width: variant.width, height: 960 }); await moderator.emulateMedia({ colorScheme: variant.scheme });
      for (const route of routes) {
        await moderator.goto(base + route, { waitUntil: 'networkidle' }); await moderator.locator('h1').waitFor();
        await moderator.addScriptTag({ content: axe });
        const result = await moderator.evaluate(async () => {
          const scope = window as unknown as { axe: { run: (document: Document, options: unknown) => Promise<{ violations: {id:string;impact:string;nodes:{target:string[]}[]}[]; incomplete: unknown[] }> } };
          return scope.axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] });
        });
        const overflow = await moderator.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        const htmlLang = await moderator.locator('html').getAttribute('lang');
        const timing = await moderator.evaluate(() => {
          const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return { responseMs: Math.round(n.responseEnd - n.startTime), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd - n.startTime) };
        });
        audits.push({ route, ...variant, htmlLang, overflow, timing, violations: result.violations.map(v => ({ id:v.id, impact:v.impact, targets:v.nodes.map(n => n.target) })), manualReviewItems: result.incomplete.length });
        if (route === '/' || route === '/documents/demo-doc-01') await moderator.screenshot({ path: `.local/release/screenshots/${variant.lang}-${variant.scheme}-${variant.width}-${route === '/' ? 'home' : 'document'}.png`, fullPage: true });
        assert.equal(overflow, false, `Layout overflow: ${route}`); assert.equal(htmlLang, variant.lang); assert.equal(result.violations.length, 0, `Accessibility: ${route}`);
      }
      console.log(`PASS accessibility/layout batch ${variant.lang}/${variant.scheme}/${variant.width}`);
    }
  });
  await step('keyboard skip link and logout revoke the actual browser session', async () => {
    await login(author, 'author@example.test', authorPassword, '/');
    await author.goto(base); await author.keyboard.press('Tab'); assert.equal(await author.evaluate(() => document.activeElement?.tagName), 'A');
    await author.getByRole('button', { name: 'Выйти', exact: true }).click();
    await author.waitForFunction(async () => (await fetch('/api/me')).status === 401);
    assert.equal((await author.request.get(base + '/api/me')).status(), 401);
  });
  assert.deepEqual(pageErrors, []);
} catch (error) {
  process.exitCode = 1; console.log(`Release check stopped: ${(error as Error).name}. See the last named step and report.`);
  if ((error as Error).message.startsWith('locator.')) console.log((error as Error).message.replaceAll(authorPassword, '[REDACTED]').replaceAll(moderatorPassword, '[REDACTED]').slice(0, 1800));
} finally {
  await browser?.close();
  if (app && app.exitCode === null) { app.kill('SIGTERM'); await once(app, 'exit'); }
  await db.$disconnect();
  await writeFile('.local/release/report.json', JSON.stringify({ recordedAt: new Date().toISOString(), target: 'local production build, real PostgreSQL and built-in modules; no stubs', checks, audits, pageErrors,
    limitations: ['Not a native-speaker or screen-reader review.', 'No public HTTPS or real LLM provider tested.'] }, null, 2) + '\n');
  console.log(`Checks passed: ${checks.filter(c => c.passed).length}/${checks.length}; audited screens: ${audits.length}`);
}
