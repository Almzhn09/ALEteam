// Kazakh UI: switching, persistence, lang attributes, no leftover Russian UI strings, layout and axe.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const OUT = '.local/e2e-shots/'; mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const results = []; const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`);
const b = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
const p = await (await b.newContext({ viewport: { width: 360, height: 900 } })).newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type() === 'error' && /hydrat|Warning/i.test(m.text())) errors.push(m.text()); });

await p.goto(BASE + '/');
await p.getByRole('button', { name: 'Қазақ тіліне ауысу' }).click();
await p.waitForFunction(() => document.documentElement.lang === 'kk');
check('switch to kk', await p.getByRole('heading', { level: 1, name: 'Электрондық мұрағат' }).waitFor({ timeout: 8000 }).then(() => true, () => false));
await p.reload();
check('kk persists after reload (SSR)', (await p.evaluate(() => document.documentElement.lang)) === 'kk' && (await p.title()).includes('Электрондық мұрағат'));

// Visible text outside lang="ru" content must contain no Russian-only letters (ы, э, ъ, ё) typical of untranslated UI.
const leftovers = () => p.evaluate(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const found = [];
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement; if (!el || el.closest('body [lang="ru"], script, style, .mono, code')) continue;
    const text = n.textContent.trim();
    if (text && /(^|[\s«(])(для|или|чтобы|только|может|нет|все|поиск|найти|документы|войти|страница|материалы|это|как)([\s.,:»)?]|$)/i.test(text) && el.offsetParent !== null) found.push(text.slice(0, 60));
  }
  return found;
});
for (const [name, path] of [['home', '/'], ['catalog', '/catalog?q=библиотека'], ['doc', '/documents/demo-doc-01'], ['timeline', '/timeline'], ['fav', '/favorites'], ['about', '/about'], ['login', '/login'], ['assistant', '/assistant'], ['404', '/nope']]) {
  await p.goto(BASE + path); await p.waitForTimeout(1500);
  const left = await leftovers();
  check(`no russian UI leftovers ${name}`, left.length === 0, left.slice(0, 5).join(' | '));
  check(`no h-scroll ${name}`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.addScriptTag({ content: axe });
  const v = (await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }))).violations;
  check(`axe kk ${name}`, v.length === 0, v.map(x => x.id).join(','));
  await p.screenshot({ path: `${OUT}kk-${name}-360.png`, fullPage: true });
}
await p.goto(BASE + '/documents/demo-doc-01'); await p.waitForTimeout(1500);
check('content marked lang=ru', await p.locator('#doc-title[lang="ru"]').count() === 1);
check('original-language note', await p.getByText('Материалдың сипаттамасы түпнұсқа тілінде берілген.').isVisible());
await p.getByRole('button', { name: 'Переключить на русский язык' }).click();
await p.waitForFunction(() => document.documentElement.lang === 'ru');
check('switch back to ru', await p.getByText('Реквизиты').isVisible());
await p.goto(BASE + '/about'); await p.waitForTimeout(1000);
check('control: detector finds Russian UI', (await leftovers()).length > 0);

console.log(results.join('\n')); console.log('errors:', errors.length ? errors : 'none');
await b.close();
