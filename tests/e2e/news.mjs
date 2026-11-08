// E02 + verified archive facts against the real API. Run from the repo root after seed (see docs/FRONTEND.md).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(process.env.ENV_FILE ?? '.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const results = []; const errors = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
const seen = (page, sel, timeout = 8000) => page.waitForSelector(sel, { timeout }).then(() => true, () => false);
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const headerFits = page => page.evaluate(() => { const h = document.querySelector('.header-inner'); return [...h.querySelectorAll('a,button')].every(e => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.right <= innerWidth && r.left >= 0); }) && h.scrollWidth <= h.clientWidth + 1; });
async function runAxe(page, name) {
  await page.addScriptTag({ content: axe });
  const v = (await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }))).violations;
  check(`axe ${name}`, v.length === 0, v.map(x => `${x.id}:${x.nodes[0].target}`).join(','));
}
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
const context = async (width, lang) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  return page;
};
async function login(page, email, password, to) {
  await page.goto(`${BASE}/login?returnTo=${encodeURIComponent(to)}`);
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(u => u.pathname === to, { timeout: 20000 }).catch(() => {});
}

// Public news and collections
const guest = await context(360);
await guest.goto(`${BASE}/news`);
check('news list from API', await seen(guest, '.result-list li'));
check('news is link-only', await guest.locator('.result-list img').count() === 0);
const link = guest.locator('.result-list a[target=_blank]').first();
check('official source link', (await link.getAttribute('href')).startsWith('http://e-arhiv.vko.gov.kz/') && /noopener/.test(await link.getAttribute('rel')));
await guest.getByRole('link', { name: 'Подборки', exact: true }).click();
await guest.waitForURL(/kind=collections/);
check('collections link to documents', await seen(guest, '.result-list a[href^="/documents/"]'));
check('collections marked demo', await seen(guest, '.badge-demo'));
await guest.goto(`${BASE}/moderation/content`);
check('guest asked to log in', await seen(guest, 'text=Требуется вход'));

// Verified facts
await guest.goto(`${BASE}/about`);
for (const fact of ['Головкова, 26/1', '25-59-76', 'arhiv-ukg@yandex.kz', '9:00–18:00', '10:00–17:00']) check(`about shows ${fact}`, await guest.getByText(fact).first().isVisible());
check('no staff names on about', !(await guest.locator('body').innerText()).includes('Жапаров'));
await guest.context().close();

// Layout: header gained an item, so test around the breakpoint, in both languages, as moderator (longest nav).
const widths = [360, 768, 959, 960, 1199, 1200, 1280, 1440];
for (const lang of ['ru', 'kk']) {
  const page = await context(1024, lang);
  await login(page, 'moderator@example.test', env.DEMO_MODERATOR_PASSWORD, '/moderation/content');
  check(`moderator opens manager ${lang}`, await seen(page, '.result-list li'));
  await page.goto(`${BASE}/news`); await seen(page, '.result-list time');
  check(`readable date ${lang}`, !/M[0-9][0-9]/.test(await page.locator('.result-list time').first().innerText()));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/news', '/about', '/moderation/content']) {
      await page.goto(BASE + path); await page.waitForTimeout(700);
      check(`no overflow ${path} ${lang}@${width}`, await fits(page));
      check(`header fits ${path} ${lang}@${width}`, await headerFits(page));
      const height = await page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().height);
      check(`header height ${path} ${lang}@${width}`, height <= (width >= 1200 ? 125 : 80), `${Math.round(height)}px`);
    }
  }
  await page.setViewportSize({ width: 360, height: 900 });
  for (const path of ['/news', '/news?kind=collections', '/about', '/moderation/content']) { await page.goto(BASE + path); await page.waitForTimeout(900); await runAxe(page, `${path} ${lang}`); }
  await page.context().close();
  await new Promise(r => setTimeout(r, 13000)); // shared sign-in limit: 5 per minute
}

// Hide and restore through the UI; the public page reacts.
const editor = await context(1280);
await login(editor, 'moderator@example.test', env.DEMO_MODERATOR_PASSWORD, '/moderation/content');
await seen(editor, '.result-list li');
const row = editor.locator('.result-list li', { hasText: 'День архивиста' });
await row.getByRole('button').click();
check('hide confirmed', await seen(editor, 'text=Материал скрыт.'));
const anon = await context(1280);
await anon.goto(`${BASE}/news`); await seen(anon, '.result-list li');
check('hidden item not public', await anon.getByText('День архивиста').count() === 0);
await row.getByRole('button').click();
check('restore confirmed', await seen(editor, 'text=Материал показан.'));
await anon.reload(); await seen(anon, '.result-list li');
check('restored item public', await anon.getByText('День архивиста').count() === 1);
await editor.context().close(); await anon.context().close();

const author = await context(1280);
await login(author, 'author@example.test', env.DEMO_AUTHOR_PASSWORD, '/moderation/content');
check('author has no access', await seen(author, 'text=Нет доступа'));
await browser.close();
console.log(results.join('\n'));
console.log(`passed ${results.filter(r => r.startsWith('PASS')).length}/${results.length}; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
if (results.some(r => r.startsWith('FAIL')) || errors.length) process.exitCode = 1;
