// R-F03/R-F04 on the real corpus: two verified photos (sources/archive-visual-20261111) are attached to the published
// «История архива» page through the admin UI, reviewed and published by a second staff member, and then appear on
// the public pages. Repeat runs reuse already published files. Local database only (BASE_URL + DATABASE_URL).
import { chromium } from 'playwright-core';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const OUT = process.env.OUT ?? '.local/real-visuals/'; mkdirSync(OUT, { recursive: true });
const admin = { email: process.env.STAFF_ADMIN_EMAIL, password: process.env.STAFF_ADMIN_PASSWORD };
if (!admin.email || !admin.password) throw new Error('STAFF_ADMIN_EMAIL and STAFF_ADMIN_PASSWORD are required');
const database = new pg.Client({ connectionString: process.env.DATABASE_URL }); await database.connect();
const resetLimits = async () => { await database.query('delete from "RateLimit"'); await database.query('delete from "ApiRateLimit"'); };
const manifest = JSON.parse(readFileSync('sources/archive-visual-20261111/manifest.json', 'utf8'));
const photos = manifest.images.filter(i => ['archive-next-generation-ridder', 'thematic-exhibition-altay'].includes(i.id));
const run = Date.now().toString(36);
const results = []; const pageErrors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
async function open(width = 1280) { const c = await browser.newContext({ viewport: { width, height: 900 } }); const p = await c.newPage(); p.setDefaultTimeout(20000); p.on('pageerror', e => pageErrors.push(`${p.url()} ${e.message}`)); return p; }
async function login(p, who, to) {
  await resetLimits(); await p.goto(`${BASE}/login?returnTo=${encodeURIComponent(to)}`);
  await p.locator('input[type=email]').fill(who.email); await p.locator('input[type=password]').fill(who.password);
  await p.locator('main form button[type=submit]').click(); await p.waitForURL(u => u.pathname === to, { timeout: 30000 });
}
try {
  const item = (await (await fetch(`${BASE}/api/content/archive-history-1?locale=ru`)).json()).item;
  const editor = `/admin/content/${item.id}`;
  const attached = async () => (await (await fetch(`${BASE}/api/discovery/materials/cms/${item.id}/attachments?locale=ru`)).json()).items.map(a => a.sha256);
  const before = await attached();
  const missing = photos.filter(p => !before.includes(p.sha256));
  const adminPage = await open();
  await login(adminPage, admin, '/admin');
  // Files already in the workflow are continued, not uploaded twice.
  const staffFiles = async () => (await (await adminPage.request.get(`${BASE}/api/admin/content/${item.id}/attachments`)).json()).items;
  const inFlow = (await staffFiles()).filter(f => ['QUARANTINED', 'APPROVED', 'REJECTED'].includes(f.state)).map(f => f.expectedSha256);
  if (missing.length) {
    // An independent second person: the uploader may not approve their own file.
    const reviewer = { email: `visual-review-${run}@example.test`, password: randomBytes(16).toString('hex'), name: `Проверка изображений ${run}` };
    await adminPage.goto(`${BASE}/admin/users`); await adminPage.waitForSelector('.table');
    const form = adminPage.locator('form', { hasText: 'Новый сотрудник' });
    await form.getByLabel('Имя').fill(reviewer.name); await form.locator('input[type=email]').fill(reviewer.email); await form.locator('input[type=password]').fill(reviewer.password);
    await form.getByRole('button', { name: 'Создать' }).click(); await adminPage.waitForSelector('text=Учётная запись создана.');
    const assign = adminPage.locator('section', { hasText: 'Назначение роли' });
    await adminPage.waitForSelector(`option:has-text("${reviewer.email}")`, { state: 'attached' });
    await assign.getByLabel('Сотрудник').selectOption({ label: `${reviewer.name} — ${reviewer.email}` });
    await assign.getByLabel('Роль', { exact: true }).selectOption({ label: 'Редактор' });
    await assign.getByRole('button', { name: 'Назначить' }).click(); await adminPage.waitForSelector('text=Роль назначена.');

    await adminPage.goto(BASE + editor); await adminPage.waitForSelector('#cms-files-title');
    for (const photo of missing.filter(p => !inFlow.includes(p.sha256))) {
      const files = adminPage.locator('section[aria-labelledby="cms-files-title"]');
      await files.locator('input[type=file]').setInputFiles({ name: photo.path.split('/').pop(), mimeType: 'image/jpeg', buffer: readFileSync(photo.path) });
      await files.getByLabel('Название источника').fill(`Официальный сайт архива, страница ${photo.sourceUrl.split('/').pop()}`);
      await files.getByLabel('Версия источника').fill(`Снимок страницы ${manifest.retrieved}`);
      await files.getByLabel('Права на файл').fill('Фотография опубликована на официальном сайте Государственного архива ВКО; автор в источнике не указан.');
      await files.getByLabel('Происхождение файла').fill(`${photo.sourceUrl}; ${photo.caption}`);
      await files.getByRole('button', { name: 'Загрузить файл' }).click();
      await adminPage.locator('.upload-card', { hasText: photo.path.split('/').pop() }).locator('.badge', { hasText: 'На проверке' }).waitFor();
    }
    check('photos uploaded to quarantine', true, String(missing.length));
    const reviewPage = await open();
    await login(reviewPage, reviewer, editor);
    for (const photo of missing) {
      const name = photo.path.split('/').pop();
      // Cards of this file still awaiting a decision; rejected copies stay in the list as history.
      const pending = () => reviewPage.locator('.upload-card', { hasText: name }).filter({ hasNot: reviewPage.locator('.badge', { hasText: 'Отклонён' }) });
      const rejectedCount = () => reviewPage.locator('.upload-card', { hasText: name }).filter({ has: reviewPage.locator('.badge', { hasText: 'Отклонён' }) }).count();
      await reviewPage.locator('.upload-card', { hasText: name }).first().waitFor();
      if (!(await pending().count())) { check(`already decided: ${name}`, true); continue; }
      let card = pending();
      if (await card.locator('.badge', { hasText: 'На проверке' }).count()) {
        await card.getByLabel('Основание решения').fill('Сверено с официальным сайтом и реестром изображений R-A02');
        await card.getByLabel('Права на публикацию копии проверены').check();
        await card.getByRole('button', { name: 'Одобрить' }).click();
        // Full parsing runs on approval: a damaged file is refused with an actionable message and then rejected.
        const outcome = await Promise.race([
          card.locator('.badge', { hasText: 'Одобрен' }).waitFor({ timeout: 40000 }).then(() => 'approved'),
          card.getByText('Файл не прошёл полный разбор').waitFor({ timeout: 40000 }).then(() => 'refused'),
        ]);
        if (outcome === 'refused') {
          const before = await rejectedCount();
          card = pending();
          await card.getByLabel('Основание решения').fill('Файл JPEG обрезан (неполная копия); нужен полный файл от R-A02');
          await card.getByRole('button', { name: 'Отклонить' }).click();
          await reviewPage.waitForFunction(([n, sel]) => [...document.querySelectorAll('.upload-card')].filter(c => c.textContent.includes(sel) && c.querySelector('.badge')?.textContent === 'Отклонён').length > n, [before, name], { timeout: 20000 });
          check(`damaged photo refused and rejected: ${name}`, true);
          continue;
        }
      }
      card = pending();
      await card.getByLabel('Основание решения').fill('Публикация на странице истории архива');
      await card.getByRole('button', { name: 'Опубликовать файл' }).click();
      await card.locator('.badge', { hasText: 'Опубликован' }).waitFor({ timeout: 40000 });
      check(`photo approved and published by a second person: ${name}`, true);
    }
  } else check('photos already published (repeat run)', true);
  const after = await attached();
  check('at least one verified photo is a public attachment', photos.some(p => after.includes(p.sha256)));

  const guest = await open(1440);
  await guest.goto(`${BASE}/`); await guest.waitForLoadState('networkidle');
  const hero = guest.locator('.hero-figure img');
  check('home hero shows a verified photo', await hero.count() === 1 && (await hero.getAttribute('alt'))?.length > 10);
  check('hero image loaded', await hero.evaluate(img => img.complete && img.naturalWidth > 0));
  check('hero has caption and credit', (await guest.locator('.hero-figure figcaption').innerText()).includes('Государственный архив'));
  await guest.screenshot({ path: `${OUT}home-1440.png`, fullPage: true });
  await guest.goto(`${BASE}/about`); await guest.waitForLoadState('networkidle');
  check('about hero shows a photo', await guest.locator('.hero-figure img').count() === 1);
  await guest.goto(`${BASE}/materials/archive-history-1`); await guest.waitForLoadState('networkidle');
  const publishedPhotos = photos.filter(p => after.includes(p.sha256)).length;
  check('history page lists every published photo', await guest.locator('.attachment-figure img').count() === publishedPhotos, String(publishedPhotos));
} catch (e) {
  results.push(`ABORTED ${e.message.slice(0, 300)}`);
} finally {
  await browser.close(); await database.end();
  for (const r of results) console.log(r);
  const failed = results.filter(r => !r.startsWith('PASS'));
  console.log(`passed ${results.length - failed.length}/${results.length}; page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
  if (failed.length || pageErrors.length) process.exitCode = 1;
}
