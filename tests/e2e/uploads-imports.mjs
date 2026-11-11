// N-F06 through the real API and UI: file upload → server inspection → independent review → publication,
// and spreadsheet → server preview → import batch → closed drafts → rollback. Local _test database only.
import { chromium } from 'playwright-core';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.local/nf06/'; mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const run = Date.now().toString(36);
const admin = { email: process.env.STAFF_ADMIN_EMAIL, password: process.env.STAFF_ADMIN_PASSWORD };
if (!admin.email || !admin.password) throw new Error('STAFF_ADMIN_EMAIL and STAFF_ADMIN_PASSWORD are required');
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw Error('Dedicated test database ending in _test required');
const database = new pg.Client({ connectionString: databaseUrl }); await database.connect();
const resetLimits = async () => { await database.query('delete from "RateLimit"'); await database.query('delete from "ApiRateLimit"'); };

const results = []; const pageErrors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
const seen = (p, sel, timeout = 10000) => p.waitForSelector(sel, { timeout }).then(() => true, () => false);
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
async function open(width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
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
const api = (p, method, path, data) => p.request.fetch(`${BASE}/api${path}`, { method, headers: { Origin: BASE, 'Content-Type': 'application/json' }, data: data === undefined ? undefined : JSON.stringify(data) });
async function axe(p, label) {
  await p.addScriptTag({ content: axeSource });
  const v = (await p.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }))).violations;
  check(`axe ${label}`, v.length === 0, v.map(x => `${x.id}:${x.nodes.length}`).join(' '));
}
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

try {
  const adminPage = await open();
  await login(adminPage, admin);
  await seen(adminPage, '.admin-nav a[href="/admin/imports"]');
  check('admin nav lists uploads and imports', await adminPage.locator('.admin-nav a[href="/admin/uploads"]').count() === 1 && await adminPage.locator('.admin-nav a[href="/admin/imports"]').count() === 1);

  // Second staff member: the uploader may not approve their own file.
  const reviewer = { email: `files-${run}@example.test`, password: randomBytes(16).toString('hex'), name: `Проверяющий файлов ${run}` };
  await adminPage.goto(`${BASE}/admin/users`); await seen(adminPage, '.table');
  const newUser = adminPage.locator('form', { hasText: 'Новый сотрудник' });
  await newUser.getByLabel('Имя').fill(reviewer.name); await newUser.locator('input[type=email]').fill(reviewer.email); await newUser.locator('input[type=password]').fill(reviewer.password);
  await newUser.getByRole('button', { name: 'Создать' }).click(); await seen(adminPage, 'text=Учётная запись создана.');
  const assign = adminPage.locator('section', { hasText: 'Назначение роли' });
  await seen(adminPage, `option:has-text("${reviewer.email}")`, 2000);
  await assign.getByLabel('Сотрудник').selectOption({ label: `${reviewer.name} — ${reviewer.email}` });
  await assign.getByLabel('Роль', { exact: true }).selectOption({ label: 'Редактор' });
  await assign.getByRole('button', { name: 'Назначить' }).click();
  check('reviewer role assigned', await seen(adminPage, 'text=Роль назначена.'));

  // Upload: a real PNG generated here, hashed in the browser, verified by the server.
  const doc = process.env.DOC_ID ?? 'demo-doc-01';
  const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 90, b: 60 } } }).png().toBuffer();
  await adminPage.goto(`${BASE}/admin/catalog/${doc}`);
  await seen(adminPage, '#uploads-title');
  await adminPage.locator('input[type=file]').first().setInputFiles({ name: `scan-${run}.png`, mimeType: 'image/png', buffer: png });
  await adminPage.getByLabel('Права на файл').fill('ALEteam CC0-1.0');
  await adminPage.getByLabel('Происхождение файла').fill(`Учебный файл ${run}`);
  await adminPage.getByRole('button', { name: 'Загрузить файл' }).click();
  const card = adminPage.locator('.upload-card', { hasText: `scan-${run}.png` });
  check('upload reaches quarantine', await card.locator('.badge', { hasText: 'На проверке' }).waitFor({ timeout: 15000 }).then(() => true, () => false));
  check('uploader sees independent-review note', await card.getByText('Проверяет и одобряет файл другой сотрудник.').count() === 1);
  check('uploader has no approve button', await card.getByRole('button', { name: 'Одобрить' }).count() === 0);
  check('antivirus limitation is stated', await card.getByText('Антивирус не подключён').count() === 1);
  const uploadId = (await (await api(adminPage, 'GET', `/admin/uploads?documentId=${doc}&state=QUARANTINED`)).json()).items.find(u => u.originalName === `scan-${run}.png`)?.id;
  check('upload exists in API', !!uploadId);

  // The bounded worker parses the file, as `npm run uploads:inspect` does in operation.
  const worker = execSync('npm run --silent uploads:inspect', { encoding: 'utf8' });
  check('inspection worker ran', /"passed":\s*[1-9]/.test(worker), worker.trim().slice(-120));

  const reviewPage = await open(390);
  await login(reviewPage, reviewer, '/admin/uploads');
  const rcard = reviewPage.locator('.upload-card', { hasText: `scan-${run}.png` });
  await rcard.waitFor();
  check('reviewer sees parsed file', await rcard.getByText('Разбор файла пройден').waitFor().then(() => true, () => false));
  await reviewPage.screenshot({ path: `${OUT}uploads-queue-390.png`, fullPage: true });
  check('uploads queue 390 no overflow', !(await overflow(reviewPage)));
  await axe(reviewPage, '/admin/uploads 390');
  await rcard.getByRole('button', { name: 'Одобрить' }).click();
  check('approve requires reason', await rcard.getByText('Укажите основание решения.').count() === 1);
  await rcard.getByLabel('Основание решения').fill('Права проверены по описи');
  await rcard.getByLabel('Права на публикацию копии проверены').check();
  await rcard.getByRole('button', { name: 'Одобрить' }).click();
  await rcard.waitFor({ state: 'detached' });
  await reviewPage.getByLabel('Состояние').selectOption('APPROVED');
  const approved = reviewPage.locator('.upload-card', { hasText: `scan-${run}.png` });
  check('file approved by second person', await approved.locator('.badge', { hasText: 'Одобрен' }).waitFor().then(() => true, () => false));
  await approved.getByRole('button', { name: 'Опубликовать файл' }).click();
  await approved.waitFor({ state: 'detached' });
  await reviewPage.getByLabel('Состояние').selectOption('PUBLISHED');
  check('file published', await reviewPage.locator('.upload-card', { hasText: `scan-${run}.png` }).locator('.badge', { hasText: 'Опубликован' }).waitFor().then(() => true, () => false));
  const guest = await open();
  const pub = await (await api(guest, 'GET', `/documents/${doc}`)).json();
  check('published file appears on public card', JSON.stringify(pub).includes(`upload-${uploadId}`));

  // Spreadsheet import: funds preview flags a possible rename; documents go through staging and commit as drafts.
  const branches = (await (await api(adminPage, 'GET', '/admin/branches?pageSize=50')).json()).items;
  const branch = branches[0];
  async function previewCsv(namespace, csv, mode, columns, extra = async () => {}) {
    await adminPage.goto(`${BASE}/admin/imports`);
    await adminPage.getByLabel('Филиал').selectOption(branch.id);
    await adminPage.getByLabel('Идентификатор набора').fill(namespace);
    await adminPage.locator('#sheet-file').setInputFiles({ name: `${namespace}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await adminPage.getByLabel(mode === 'funds' ? 'Список фондов — только предпросмотр и сверка' : 'Документы — можно передать в пакет импорта').check();
    for (const [field, col] of Object.entries(columns)) await adminPage.locator(`#col-${field}`).fill(String(col));
    await extra();
    await adminPage.getByRole('button', { name: 'Показать предпросмотр' }).click();
    await adminPage.waitForURL(/admin\/imports\/previews\//, { timeout: 30000 });
    await seen(adminPage, 'h1:has-text("Предпросмотр таблицы")');
  }
  await adminPage.setViewportSize({ width: 360, height: 900 });
  await adminPage.goto(`${BASE}/admin/imports`); await seen(adminPage, '#sheet-file');
  await adminPage.screenshot({ path: `${OUT}imports-form-360.png`, fullPage: true });
  check('imports form 360 no overflow', !(await overflow(adminPage)));
  await axe(adminPage, '/admin/imports 360');
  await adminPage.setViewportSize({ width: 1280, height: 900 });

  await previewCsv(`funds-${run}`, 'number,name\n0007,Фонд А\n0007,Фонд А (переименован)\n0012,Фонд Б\n', 'funds', { number: 1, name: 2 });
  check('funds preview counts rows', await adminPage.getByText('Непустых строк').count() === 1);
  check('rename shown as review candidate', await adminPage.getByText('это не подтверждённое переименование').count() >= 1);
  check('leading zeros preserved', await adminPage.locator('td', { hasText: /^0007$/ }).count() >= 1);
  check('funds preview cannot be staged', await adminPage.getByRole('button', { name: 'Передать в пакет импорта' }).count() === 0);
  await adminPage.screenshot({ path: `${OUT}funds-preview-1280.png`, fullPage: true });
  await axe(adminPage, 'funds preview');

  const base = { isDemo: true, funds: [{ key: 'f', number: `T${run}`, name: `ДЕМО фонд ${run}`, description: 'Учебная иерархия' }], inventories: [{ key: 'i', fundKey: 'f', number: '0001', title: 'ДЕМО опись' }], cases: [{ key: 'c', inventoryKey: 'i', number: '0001', title: 'ДЕМО дело' }] };
  const csv = 'id,fund,case,title,description,reference,year,type,rights,source\n'
    + `0001,f,c,ДЕМО документ 1,Учебная строка,DEMO-IMP-${run}-1,1961,REPORT,ALEteam CC0-1.0,Учебная таблица\n`
    + `0002,f,c,ДЕМО документ 2,Учебная строка,DEMO-IMP-${run}-2,1962,LETTER,ALEteam CC0-1.0,Учебная таблица\n`;
  await previewCsv(`docs-${run}`, csv, 'documents', { sourceId: 1, fundKey: 2, caseKey: 3, title: 4, description: 5, reference: 6, year: 7, type: 8, rights: 9, sourceNote: 10 },
    () => adminPage.getByLabel('Основа каталога: фонды, описи, дела (JSON)').fill(JSON.stringify(base)));
  check('documents preview has no errors', await adminPage.locator('.badge', { hasText: 'Ошибок: 0' }).count() === 1);
  await adminPage.getByRole('button', { name: 'Передать в пакет импорта' }).click();
  await adminPage.waitForURL(/admin\/imports\/[^/]+$/, { timeout: 20000 });
  check('batch ready', await seen(adminPage, 'dd:has-text("Готов к созданию черновиков")'));
  check('two rows planned', await adminPage.locator('td', { hasText: 'Будет создан' }).count() === 2);
  adminPage.once('dialog', d => d.accept());
  await adminPage.getByRole('button', { name: 'Создать черновики' }).click();
  check('drafts created', await seen(adminPage, 'dd:has-text("Черновики созданы")', 20000));
  const created = await adminPage.locator('td a', { hasText: 'Открыть' }).first().getAttribute('href');
  check('created card is closed publicly', created && (await api(guest, 'GET', `/documents/${created.split('/').pop()}`)).status() === 404);
  await adminPage.screenshot({ path: `${OUT}batch-committed-1280.png`, fullPage: true });
  await axe(adminPage, 'import batch');
  await adminPage.getByRole('button', { name: 'Откатить черновики' }).click();
  check('rollback works', await seen(adminPage, 'dd:has-text("Откачен")', 20000));
} catch (e) {
  results.push(`ABORTED ${e.message.slice(0, 300)}`);
} finally {
  await browser.close(); await database.end();
  for (const r of results) console.log(r);
  const failed = results.filter(r => !r.startsWith('PASS'));
  console.log(`passed ${results.length - failed.length}/${results.length}; page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
  if (failed.length || pageErrors.length) process.exitCode = 1;
}
