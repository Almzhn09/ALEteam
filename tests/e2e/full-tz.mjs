// Full-specification frontend path against the real API. Local test database only: it clears sign-in rate limits.
// Needs STAFF_ADMIN_EMAIL/STAFF_ADMIN_PASSWORD of a bootstrapped administrator (see docs/cms/API.md).
import { chromium } from 'playwright-core';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = '.local/e2e-shots/'; mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const run = Date.now().toString(36);
const admin = { email: process.env.STAFF_ADMIN_EMAIL, password: process.env.STAFF_ADMIN_PASSWORD };
if (!admin.email || !admin.password) throw new Error('STAFF_ADMIN_EMAIL and STAFF_ADMIN_PASSWORD are required');
const results = []; const pageErrors = [];
process.on('uncaughtException', e => { for (const r of results) console.log(r); console.log('ABORTED', e.message.slice(0, 300)); process.exit(1); });
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const seen = (p, sel, timeout = 10000) => p.waitForSelector(sel, { timeout }).then(() => true, () => false);

const databaseUrl=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!databaseUrl||!new URL(databaseUrl).pathname.endsWith('_test'))throw Error('Dedicated test database ending in _test required');
const database = new pg.Client({ connectionString: databaseUrl }); await database.connect();
const resetLimits = async () => { await database.query('delete from "RateLimit"'); await database.query('delete from "ApiRateLimit"'); };
await resetLimits();

const browser = await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']}:{ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
async function open(width = 1280, options = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...options });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  p.on('pageerror', e => pageErrors.push(`${p.url()} ${e.message}`));
  return p;
}
async function login(p, who, to = '/admin') {
  await resetLimits();
  await p.goto(`${BASE}/login?returnTo=${encodeURIComponent(to)}`);
  await p.locator('input[type=email]').fill(who.email); await p.locator('input[type=password]').fill(who.password);
  await p.locator('main form button[type=submit]').click();
  await p.waitForURL(u => u.pathname === to.split('?')[0], { timeout: 20000 });
}
// API helpers reuse the browser session, so server checks stay in force.
const api = (p, method, path, data) => p.request.fetch(`${BASE}/api${path}`, { method, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: data === undefined ? undefined : JSON.stringify(data) });
const json = async (p, method, path, data) => { const r = await api(p, method, path, data); if (!r.ok()) throw new Error(`${method} ${path} ${r.status()} ${await r.text()}`); return r.json(); };
const body = (title, extra = {}) => ({ title, body: `${title}: учебный текст.`, rights: 'ALEteam CC0-1.0', sourceNote: 'Собственный учебный материал', ...extra });

const adminPage = await open();
await login(adminPage, admin);
check('admin shell opens', await seen(adminPage, '.admin-nav'));
check('admin nav shows permitted sections', await adminPage.locator('.admin-nav a').count() >= 8);

// Staff accounts through the UI: a second person is required to review.
const reviewer = { email: `reviewer-${run}@example.test`, password: randomBytes(16).toString('hex'), name: `Проверяющий ${run}` };
await adminPage.goto(`${BASE}/admin/users`); await seen(adminPage, '.table');
const newUser = adminPage.locator('form', { hasText: 'Новый сотрудник' });
await newUser.getByLabel('Имя').fill(reviewer.name); await newUser.locator('input[type=email]').fill(reviewer.email); await newUser.locator('input[type=password]').fill(reviewer.password);
await newUser.getByRole('button', { name: 'Создать' }).click();
check('staff account created in UI', await seen(adminPage, 'text=Учётная запись создана.'));
const assign = adminPage.locator('section', { hasText: 'Назначение роли' });
await seen(adminPage, `option:has-text("${reviewer.email}")`, 2000);
await assign.getByLabel('Сотрудник').selectOption({ label: `${reviewer.name} — ${reviewer.email}` });
await assign.getByLabel('Роль', { exact: true }).selectOption({ label: 'Редактор' });
await assign.getByRole('button', { name: 'Назначить' }).click();
check('role assigned in UI', await seen(adminPage, 'text=Роль назначена.'));

// Editorial path through the UI: six states with two accounts.
const slug = `news-${run}`; const title = `Учебная новость ${run}`;
await adminPage.goto(`${BASE}/admin/content/new`);
await adminPage.getByLabel('Адрес (латиница, цифры, дефис)').fill(slug);
await adminPage.getByLabel('Заголовок', { exact: true }).fill(title);
await adminPage.getByLabel('Текст', { exact: true }).fill('Учебный текст новости. <b>Без HTML</b>');
await adminPage.getByLabel('Права использования').fill('ALEteam CC0-1.0');
await adminPage.getByLabel('Категория').fill('Демо');
await adminPage.getByLabel('Дата', { exact: true }).fill('2026-11-01');
await adminPage.getByRole('button', { name: 'Создать черновик' }).click();
await adminPage.waitForURL(/admin\/content\/[^/n]/);
check('draft created, DRAFT shown', await seen(adminPage, '.badge-DRAFT'));
const itemId = adminPage.url().split('/').pop();
await adminPage.getByLabel('Причина или комментарий').fill('Готово к проверке');
await adminPage.getByRole('button', { name: 'Отправить на проверку' }).click();
check('moves to IN_REVIEW', await seen(adminPage, '.card .badge-IN_REVIEW'));
check('public cannot see a draft', (await api(adminPage, 'GET', `/content/${slug}?locale=ru`)).status() === 404);
// The author cannot approve their own revision.
await adminPage.getByLabel('Причина или комментарий').fill('Сам себе');
await adminPage.getByRole('button', { name: 'Одобрить' }).click();
check('self-approval refused with a message', await seen(adminPage, '.notice-error'));

const reviewPage = await open();
await login(reviewPage, reviewer, `/admin/content/${itemId}`);
await seen(reviewPage, '.badge-IN_REVIEW');
await reviewPage.getByLabel('Причина или комментарий').fill('Нужна правка');
await reviewPage.getByRole('button', { name: 'Вернуть на доработку' }).click();
check('reviewer returns: CHANGES_REQUESTED', await seen(reviewPage, '.card .badge-CHANGES_REQUESTED'));
await adminPage.reload(); await seen(adminPage, '.card .badge-CHANGES_REQUESTED');
await adminPage.getByLabel('Текст', { exact: true }).fill('Исправленный учебный текст. <b>Без HTML</b>');
// A stale screen must report a conflict and not overwrite.
const stale = await json(adminPage, 'GET', `/admin/content/${itemId}`);
const rev = stale.items[0].revisions[0];
await json(adminPage, 'PATCH', `/admin/revisions/${rev.id}`, { expectedUpdatedAt: rev.updatedAt, payload: { ...rev.payload, body: 'Параллельная правка' } });
await adminPage.getByRole('button', { name: 'Сохранить', exact: true }).click();
check('stale edit shows conflict', await seen(adminPage, 'text=Конфликт изменений'));
check('typed text survives the conflict', await seen(adminPage, 'text=Ваш текст остался в форме') && (await adminPage.getByLabel('Текст', { exact: true }).inputValue()).startsWith('Исправленный'));
await adminPage.getByRole('button', { name: 'Сохранить', exact: true }).click();
const savedAfterConflict = await seen(adminPage, 'text=Сохранено.');
if (!savedAfterConflict) { await adminPage.screenshot({ path: OUT + 'fail-edit-after-conflict.png', fullPage: true }); console.log('DEBUG', (await adminPage.locator('main').innerText()).slice(0, 900)); }
check('edit after refresh saves', savedAfterConflict);
await adminPage.getByLabel('Причина или комментарий').fill('Исправлено');
await adminPage.getByRole('button', { name: 'Отправить на проверку' }).click();
await seen(adminPage, '.card .badge-IN_REVIEW');
await reviewPage.reload(); await seen(reviewPage, '.card .badge-IN_REVIEW');
await reviewPage.getByLabel('Причина или комментарий').fill('Проверено');
await reviewPage.getByRole('button', { name: 'Одобрить' }).click();
check('reviewer approves', await seen(reviewPage, '.card .badge-APPROVED'));
await reviewPage.getByLabel('Причина или комментарий').fill('Публикуем');
await reviewPage.getByRole('button', { name: 'Опубликовать' }).click();
check('reviewer publishes', await seen(reviewPage, '.card .badge-PUBLISHED'));

// Publication helper for the remaining fixtures: same API and two accounts.
async function publish(kind, itemSlug, payload, extra = {}, locale = 'ru') {
  const { item } = await json(adminPage, 'POST', '/admin/content', { slug: itemSlug, kind, isDemo: true, locale, payload, ...extra });
  await release(item.revisions[0]);
  return item;
}
async function release(revision) {
  const step = async (p, status, r) => (await json(p, 'POST', `/admin/revisions/${r.id}/transition`, { status, expectedUpdatedAt: r.updatedAt, reason: 'Проверка e2e' })).item;
  let r = await step(adminPage, 'IN_REVIEW', revision); r = await step(reviewPage, 'APPROVED', r); await step(reviewPage, 'PUBLISHED', r);
}
await resetLimits();
const { item: branch } = await json(adminPage, 'POST', '/admin/branches', { code: `D${run}`, name: `Демо-филиал ${run}`, isDemo: true });
const branchSlug = `branch-${run}`;
await publish('BRANCH_PROFILE', branchSlug, body(`Демо-филиал ${run}`, { address: 'Демо-адрес, Өскемен', phone: '+7 000 000 00 00', email: 'demo@example.test', hours: 'Демо-график', latitude: 49.95, longitude: 82.62, category: 'Филиал' }), { branchId: branch.id });
check('closed branch hidden from public', (await (await api(adminPage, 'GET', '/branches?locale=ru')).json()).items.every(b => b.slug !== branchSlug));
await json(adminPage, 'PATCH', `/admin/branches/${branch.id}`, { code: branch.code, name: branch.name, isDemo: true, isPublic: true, expectedUpdatedAt: branch.updatedAt });
await resetLimits();
const first = await publish('EXHIBIT', `exhibit-a-${run}`, body(`Первый экспонат ${run}`));
const second = await publish('EXHIBIT', `exhibit-b-${run}`, body(`Второй экспонат ${run}`));
await publish('EXHIBITION', `expo-${run}`, body(`Демо-выставка ${run}`, { exhibitIds: [second.id, first.id], yearFrom: 1950, yearTo: 1960, category: 'История' }));
await resetLimits();
await publish('FAQ', `faq-${run}`, body(`Что такое опись ${run}?`));
await publish('EVENT', `event-${run}`, body(`Демо-событие ${run}`, { yearFrom: 1941, yearTo: 1945, tags: ['Өскемен'] }));
await publish('PERSON', `person-${run}`, body(`Демо-личность ${run}`, { yearFrom: 1900 }));
await publish('PAGE', `legal-${run}`, body(`Демо-политика ${run}`, { category: 'legal' }));
await resetLimits();
await publish('SETTING', 'site-social-links', body('Соцсети', { links: [{ label: 'Демо-соцсеть', url: 'https://example.test/social' }] })).catch(() => {});

// Public pages
const guest = await open(1280);
await guest.goto(`${BASE}/news`);
check('published news listed', await seen(guest, `a:has-text("${title}")`));
await guest.goto(`${BASE}/news?q=${encodeURIComponent(run)}&category=${encodeURIComponent('Демо')}&year=2026`);
check('news filters combine', await seen(guest, `a:has-text("${title}")`));
await guest.goto(`${BASE}/news/${slug}`);
check('body rendered as text, not HTML', (await guest.locator('article .pre-wrap').innerText()).includes('<b>Без HTML</b>'));
await guest.goto(`${BASE}/news/${slug}?lang=en`);
// R-F02: a missing translation opens the source language with an explicit marker, never a substituted text.
check('missing translation is declared', await seen(guest, '.source-language:has-text("Material in its original language")') && (await guest.locator('h1').first().innerText()) === title);
await guest.goto(`${BASE}/news/${slug}?lang=ru`);
check('hreflang lists only published languages', await guest.locator('link[hreflang="ru"]').count() === 1 && await guest.locator('link[hreflang="en"]').count() === 0);

const { items: [translated] } = await json(adminPage, 'GET', `/admin/content/${itemId}`);
await resetLimits();
const en = await json(adminPage, 'POST', `/admin/content/${translated.id}/revisions`, { locale: 'en', payload: body(`Training news ${run}`) });
await release(en.item);
await guest.goto(`${BASE}/news/${slug}?lang=en`);
check('translation opens on its language URL', await seen(guest, `h1:has-text("Training news ${run}")`));
check('document language follows the URL', await guest.evaluate(() => document.documentElement.lang) === 'en');
await guest.goto(`${BASE}/catalog`);
check('language persists after navigation', await guest.evaluate(() => document.documentElement.lang) === 'en' && await seen(guest, 'h1:has-text("Document catalogue")'));
await guest.getByLabel('Language', { exact: true }).selectOption('kk');
await guest.waitForFunction(() => document.documentElement.lang === 'kk');
await guest.locator('.display-preferences > summary').click(); await guest.locator('#display-theme').selectOption('dark');
check('manual theme applies without reload', await guest.evaluate(() => document.documentElement.dataset.theme) === 'dark');
await guest.reload();
check('theme persists after reload', await guest.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await guest.evaluate(() => getComputedStyle(document.body).backgroundColor) !== 'rgb(246, 243, 236)');
await guest.getByLabel('Тіл', { exact: true }).selectOption('ru');
await guest.waitForFunction(() => document.documentElement.lang === 'ru');
await guest.locator('.display-preferences > summary').click(); await guest.locator('#display-theme').selectOption('light');

await guest.goto(`${BASE}/exhibitions/expo-${run}`);
check('exhibits follow the curated order', (await guest.locator('.exhibit h2').innerText()) === `Второй экспонат ${run}`);
await guest.getByRole('button', { name: 'Следующий экспонат' }).click();
check('exhibit next by button', (await guest.locator('.exhibit h2').innerText()) === `Первый экспонат ${run}`);
await guest.getByRole('button', { name: 'Предыдущий экспонат' }).focus(); await guest.keyboard.press('ArrowLeft');
check('exhibit by keyboard', (await guest.locator('.exhibit h2').innerText()) === `Второй экспонат ${run}`);
await guest.goto(`${BASE}/exhibitions?from=1955&to=1958`);
check('exhibition period filter', await seen(guest, `a:has-text("Демо-выставка ${run}")`));
await guest.goto(`${BASE}/exhibitions?from=1800&to=1801`);
check('exhibition empty state', await seen(guest, 'text=Ничего не найдено'));
await guest.goto(`${BASE}/memory?q=${run}`);
check('event timeline shows real events', await seen(guest, `.timeline a:has-text("Демо-событие ${run}")`));
await guest.goto(`${BASE}/memory?section=events&q=${run}&place=${encodeURIComponent('Өскемен')}&from=1940&to=1950`);
check('memory filters by place and period', await seen(guest, `a:has-text("Демо-событие ${run}")`));
await guest.goto(`${BASE}/memory?section=people&q=${run}`);
check('people section', await seen(guest, `a:has-text("Демо-личность ${run}")`));
await guest.goto(`${BASE}/help`);
check('FAQ listed', await seen(guest, `summary:has-text("Что такое опись ${run}?")`));
check('footer legal link from CMS', await seen(guest, `.site-footer a:has-text("Демо-политика ${run}")`));

// Branch map: list alternative, marker, denied geolocation, external route.
const mapPage = await open(1280);
await mapPage.route('https://tile.openstreetmap.org/**', r => r.abort());
await mapPage.goto(`${BASE}/branches`);
check('branch in list', await seen(mapPage, `.result-list a:has-text("Демо-филиал ${run}")`));
check('marker on the map', await seen(mapPage, '.leaflet-marker-icon'));
check('tile failure is reported, map stays', await seen(mapPage, 'text=Подложка карты недоступна'));
await mapPage.locator('.result-list li', { hasText: `Демо-филиал ${run}` }).getByRole('button').click();
await mapPage.getByRole('button', { name: 'Определить моё местоположение' }).click();
check('denied geolocation keeps manual route', await seen(mapPage, 'text=Местоположение недоступно'));
await mapPage.getByLabel('Откуда').fill('Өскемен');
const routeHref = await mapPage.getByRole('link', { name: /Построить маршрут/ }).getAttribute('href');
check('external route link', routeHref.startsWith('https://www.openstreetmap.org/directions') && routeHref.includes('49.95'), routeHref.slice(0, 70));
const located = await open(1280, { geolocation: { latitude: 49.9, longitude: 82.5 }, permissions: ['geolocation'] });
await located.goto(`${BASE}/branches/${branchSlug}`);
await located.getByRole('button', { name: 'Определить моё местоположение' }).click();
check('straight-line distance labelled', await seen(located, 'text=Расстояние по прямой'));

// Catalog administration to a public card, including a closed digital copy.
await resetLimits();
const number = run.slice(-6);
await adminPage.goto(`${BASE}/admin/catalog`);
await adminPage.getByLabel('Филиал нового фонда').selectOption(branch.id);
const fundForm = adminPage.locator('details', { hasText: 'Новый фонд' }); await fundForm.locator('summary').click();
await fundForm.getByLabel('Номер').fill(number); await fundForm.getByLabel('Название').fill(`Демо-фонд ${run}`); await fundForm.getByLabel('Описание').fill('Учебный фонд');
await fundForm.getByRole('button', { name: 'Создать' }).click();
await adminPage.getByRole('button', { name: `№ ${number}. Демо-фонд ${run}` }).click();
const invForm = adminPage.locator('details', { hasText: 'Новая опись' }); await invForm.locator('summary').click();
await invForm.getByLabel('Номер').fill('0001'); await invForm.getByLabel('Название').fill('Демо-опись');
await invForm.getByRole('button', { name: 'Создать' }).click();
await adminPage.getByRole('button', { name: '№ 0001. Демо-опись' }).click();
const caseForm = adminPage.locator('details', { hasText: 'Новое дело' }); await caseForm.locator('summary').click();
await caseForm.getByLabel('Номер').fill('0003'); await caseForm.getByLabel('Название').fill('Демо-дело');
await caseForm.getByRole('button', { name: 'Создать' }).click();
check('hierarchy created in UI', await seen(adminPage, 'li:has-text("№ 0003. Демо-дело")'));
await adminPage.getByRole('link', { name: 'Новая карточка' }).click();
await adminPage.waitForURL(/catalog\/new/);
const docTitle = `Демо-карточка ${run}`;
await adminPage.getByLabel('Заголовок', { exact: true }).fill(docTitle);
await adminPage.getByLabel('Описание', { exact: true }).fill('Учебная закрытая карточка.');
await adminPage.getByLabel('Права использования').fill('ALEteam CC0-1.0');
await adminPage.getByLabel('Архивный шифр').fill(`DEMO-${number}-1-3`);
await adminPage.getByLabel('Дело').selectOption({ label: '№ 0003. Демо-дело' });
await adminPage.getByLabel('Год', { exact: true }).fill('1950');
await adminPage.getByLabel('Автор').fill('Демо-автор');
await adminPage.getByLabel('Населённый пункт').fill('Демо-посёлок');
await adminPage.getByLabel('Служебная заметка (не публикуется)').fill(`SECRET-${run}`);
await adminPage.getByRole('button', { name: 'Создать черновик' }).click();
await adminPage.waitForURL(/admin\/catalog\/[0-9a-f-]{20,}/);
const documentId = adminPage.url().split('/').pop();
check('document draft created', await seen(adminPage, '.card .badge-DRAFT'));
check('new card is closed publicly', (await api(guest, 'GET', `/documents/${documentId}`)).status() === 404);
await adminPage.getByLabel('Причина или комментарий').fill('Готово');
await adminPage.getByRole('button', { name: 'Отправить на проверку' }).click();
await seen(adminPage, '.card .badge-IN_REVIEW');
await resetLimits();
await reviewPage.goto(`${BASE}/admin/catalog/${documentId}`); await seen(reviewPage, '.card .badge-IN_REVIEW');
await reviewPage.getByLabel('Причина или комментарий').fill('Проверено');
await reviewPage.getByRole('button', { name: 'Одобрить' }).click(); await seen(reviewPage, '.card .badge-APPROVED');
await reviewPage.getByLabel('Причина или комментарий').fill('Публикуем');
await reviewPage.getByRole('button', { name: 'Опубликовать' }).click();
check('document published by reviewer', await seen(reviewPage, '.card .badge-PUBLISHED'));
await guest.goto(`${BASE}/documents/${documentId}`);
check('closed copy state on open card', await seen(guest, 'text=Цифровая копия закрыта'));
check('no download control for closed copy', await guest.getByRole('link', { name: /Скачать/ }).count() === 0);
check('hierarchy links on card', await seen(guest, 'a:has-text("Демо-опись")') && await seen(guest, 'a:has-text("Демо-дело")'));
check('internal note not exposed', !(await guest.content()).includes(`SECRET-${run}`));
await guest.goto(`${BASE}/catalog?fundNumber=${number}&inventoryNumber=0001&caseNumber=0003&author=${encodeURIComponent('Демо-автор')}&locality=${encodeURIComponent('Демо-посёлок')}`);
check('requisite filters combine from URL', await seen(guest, `.doc-card a:has-text("${docTitle}")`));
await guest.locator(`.doc-card a:has-text("${docTitle}")`).click(); await guest.waitForURL(/documents\//); await guest.goBack();
check('back keeps requisite filters', guest.url().includes('caseNumber=0003') && await seen(guest, `.doc-card a:has-text("${docTitle}")`));

// PDF in the page, share and copy controls.
await guest.goto(`${BASE}/documents/demo-doc-01`);
await guest.getByRole('button', { name: /Просмотреть PDF/ }).first().click();
check('PDF opens inside the page', await seen(guest, '.pdf-frame iframe'));
check('share controls present', await guest.getByRole('button', { name: 'Копировать шифр' }).count() === 1 && await guest.getByRole('link', { name: /Telegram/ }).count() === 1);

// Roles
await resetLimits();
const authorEnv = process.env.DEMO_AUTHOR_PASSWORD?{DEMO_AUTHOR_PASSWORD:process.env.DEMO_AUTHOR_PASSWORD}:Object.fromEntries(readFileSync(process.env.ENV_FILE??'.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const visitor = await open(1280);
await visitor.goto(`${BASE}/admin`);
check('guest asked to sign in to admin', await seen(visitor, 'text=Требуется вход'));
await login(visitor, { email: 'author@example.test', password: authorEnv.DEMO_AUTHOR_PASSWORD }, '/admin');
check('non-staff refused', await seen(visitor, 'text=Нет доступа'));
check('non-staff API refused', (await api(visitor, 'GET', '/admin/content')).status() === 403);
await visitor.goto(`${BASE}/`);
await visitor.locator('.assistant-open').click();
check('assistant opens as a panel', await seen(visitor, 'dialog[open] textarea'));
await visitor.keyboard.press('Escape');
check('assistant closes with Escape', await visitor.locator('dialog[open]').count() === 0);
// Reviewer loses access after disabling: the open session stops working.
const users = await json(adminPage, 'GET', '/admin/users?pageSize=50');
const reviewerId = users.items.find(u => u.email === reviewer.email).id;
await json(adminPage, 'PATCH', `/admin/users/${reviewerId}`, { isActive: false });
await reviewPage.goto(`${BASE}/admin`);
check('disabled staff is signed out', await seen(reviewPage, 'text=Требуется вход'));

// SEO, including rendering without client JavaScript.
const noJs = await open(1280, { javaScriptEnabled: false });
await noJs.goto(`${BASE}/documents/demo-doc-01`);
check('card renders without JS', await seen(noJs, 'h1#doc-title'));
check('card has its own title', (await noJs.title()).includes('библиотеки'));
await noJs.goto(`${BASE}/news/${slug}`);
check('news renders without JS', await seen(noJs, `h1:has-text("${title}")`));
const sitemap = await (await noJs.request.get(`${BASE}/sitemap.xml`)).text();
check('sitemap has published material', sitemap.includes(`/news/${slug}`) && sitemap.includes('/documents/demo-doc-01'));
check('sitemap excludes admin and closed', !sitemap.includes('/admin') && !sitemap.includes(`/branches/draft`));
const robots = await (await noJs.request.get(`${BASE}/robots.txt`)).text();
check('robots disallows admin', robots.includes('Disallow: /admin') && robots.includes('sitemap.xml'));

// Layout and automated accessibility across languages, themes and widths.
const publicRoutes = ['/', '/catalog', '/news', `/news/${slug}`, '/exhibitions', `/exhibitions/expo-${run}`, '/memory', `/memory/event-${run}`, '/branches', `/branches/${branchSlug}`, '/help', '/about', '/documents/demo-doc-01'];
const adminRoutes = ['/admin', '/admin/content', `/admin/content/${itemId}`, '/admin/content/new', '/admin/queue', '/admin/catalog', `/admin/catalog/${documentId}`, '/admin/branches', '/admin/users', '/admin/roles', '/admin/audit', '/admin/analytics'];
const variants = [['ru', 'light', 360], ['kk', 'dark', 768], ['en', 'light', 1280], ['en', 'dark', 360], ['kk', 'light', 1440]];
for (const [lang, theme, width] of variants) {
  await resetLimits();
  const ctx = adminPage.context();
  await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }, { name: 'display-theme', value: theme, url: BASE }]);
  await adminPage.setViewportSize({ width, height: 900 });
  let bad = [];
  for (const route of [...publicRoutes, ...adminRoutes]) {
    await adminPage.goto(BASE + route, { waitUntil: 'load' }); await adminPage.waitForTimeout(600);
    await adminPage.addScriptTag({ content: axeSource });
    const report = await adminPage.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] });
      const h = document.querySelector('.site-header').getBoundingClientRect().height;
      return { overflow: document.documentElement.scrollWidth > innerWidth, header: h, lang: document.documentElement.lang, violations: r.violations.map(v => `${v.id}:${v.nodes[0].target}`) };
    });
    if (report.overflow) bad.push(`${route} overflow`);
    if (width >= 768 && report.header > 150) bad.push(`${route} header ${Math.round(report.header)}`);
    if (report.lang !== lang) bad.push(`${route} lang ${report.lang}`);
    if (report.violations.length) bad.push(`${route} ${report.violations.join(',')}`);
  }
  check(`layout+axe ${lang}/${theme}/${width} (${publicRoutes.length + adminRoutes.length} routes)`, !bad.length, bad.slice(0, 6).join(' | '));
}
await adminPage.context().addCookies([{ name: 'lang', value: 'ru', url: BASE }, { name: 'display-theme', value: 'light', url: BASE }]);

await database.end(); await browser.close();
console.log(results.join('\n'));
console.log(`passed ${results.filter(r => r.startsWith('PASS')).length}/${results.length}; page errors: ${pageErrors.length ? [...new Set(pageErrors)].slice(0, 5).join(' | ') : 'none'}`);
if (results.some(r => r.startsWith('FAIL')) || pageErrors.length) process.exitCode = 1;
