// COL-F07 visual matrix: screenshots plus measured geometry for the spacing contract
// (задачи/ТЗ-2026-11-10/Отступы-и-проверка.md). Screenshots still have to be looked at by a person.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.local/visual/';
mkdirSync(OUT, { recursive: true });
const axeSource = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const doc = process.env.DOC_ID ?? 'demo-doc-01';
// CORPUS=real checks the published real corpus (R-F05); the default keeps the fixture routes of COL-F07.
const real = process.env.CORPUS === 'real';
const routes = real
  ? [['home', '/'], ['search', '/search?q=%D0%B0%D1%80%D1%85%D0%B8%D0%B2'], ['about', '/about'], ['history', '/materials/archive-history-1'], ['calendar', '/materials/archive-calendar-2026'],
    ['decree', '/materials/archive-branch-decree-142'], ['funds', '/directories/funds'], ['newspapers', '/directories/newspapers?q=%D0%B3%D0%B0%D0%B7%D0%B5%D1%82%D0%B0'], ['services', '/services'], ['branches', '/branches'], ['help', '/help'], ['places', '/places']]
  : [['home', '/'], ['catalog', '/catalog?q=%D0%B1%D0%B8%D0%B1%D0%BB%D0%B8%D0%BE%D1%82%D0%B5%D0%BA%D0%B0'], ['document', `/documents/${doc}`], ['guide', '/guide'], ['help', '/help'], ['branches', '/branches'], ['news', '/news'], ['places', '/places']];
const explainPath = real ? '/materials/archive-branch-decree-142' : `/documents/${doc}`;
// [width, theme, text size, language, zoom]: zoom 2 halves the CSS viewport at double pixel density.
const variants = [
  [360, 'light', '100', 'ru', 1], [390, 'light', '100', 'ru', 1], [360, 'dark', '100', 'kk', 1], [768, 'light', '100', 'en', 1], [768, 'dark', '100', 'ru', 1],
  [1440, 'light', '100', 'ru', 1], [1440, 'dark', '100', 'kk', 1], [360, 'light', '150', 'ru', 1], [1440, 'dark', '150', 'en', 1], [1440, 'light', '100', 'ru', 2],
];

// Geometry: overlapping or touching controls, content wider than the viewport, misaligned container edges.
function measure() {
  // Measured from the top: a sticky header over scrolled content is not an overlap of the layout itself.
  window.scrollTo(0, 0);
  const vw = document.documentElement.clientWidth;
  const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden], dialog:not([open]), .leaflet-container, .visually-hidden') && !(el.closest('.thumbs, .table-wrap') && el.parentElement.closest('.thumbs, .table-wrap').scrollWidth > el.parentElement.closest('.thumbs, .table-wrap').clientWidth && (el.getBoundingClientRect().right > el.closest('.thumbs, .table-wrap').getBoundingClientRect().right + 1)) && !el.closest('details:not([open]) > :not(summary)') && (!document.querySelector('dialog[open]') || el.closest('dialog[open]')) && (!document.querySelector('.nav-wrap[data-open="true"]') || el.closest('.site-header')); };
  const controls = [...document.querySelectorAll('a.btn, button, select, input:not([type=hidden]), summary, .nav a, .tabs a, .pagination a')].filter(visible);
  const problems = [];
  const box = el => el.getBoundingClientRect();
  const name = el => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName).trim().slice(0, 30);
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = box(a), rb = box(b);
    const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (overlapX > 1 && overlapY > 1) { problems.push(`overlap: ${name(a)} × ${name(b)}`); continue; }
    // Neighbours in one row: horizontal gap below 8px means buttons visually stick together.
    if (overlapY > Math.min(ra.height, rb.height) / 2) {
      const gap = Math.max(rb.left - ra.right, ra.left - rb.right);
      if (gap >= 0 && gap < 8 && (a.matches('.btn, button, select') && b.matches('.btn, button, select'))) problems.push(`gap ${Math.round(gap)}px: ${name(a)} | ${name(b)}`);
    }
  }
  for (const el of controls) { const r = box(el); if (r.right > vw + 1 || r.left < -1) problems.push(`outside viewport: ${name(el)}`); }
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  const edge = sel => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft)) : null; };
  const edges = { header: edge('.site-header .container'), main: edge('main .container'), footer: edge('.site-footer .container') };
  if (edges.main !== null && (edges.header !== edges.main || edges.footer !== edges.main)) problems.push(`container edges differ ${JSON.stringify(edges)}`);
  const header = document.querySelector('.site-header')?.getBoundingClientRect().height ?? -1;
  if (header < 0) problems.push('no site header rendered: ' + document.title);
  const small = controls.filter(el => el.matches('.btn, button:not(.leaflet-control-zoom-in):not(.leaflet-control-zoom-out), select, summary') && box(el).height < 36).map(name);
  const search = [...document.querySelectorAll('.header-search, .menu-search')].filter(el => el.getClientRects().length && getComputedStyle(el).display !== 'none');
  if (search.length > 1) problems.push('two search forms visible');
  if (small.length) problems.push(`controls under 36px: ${small.slice(0, 4).join(', ')}`);
  return { overflow, header: Math.round(header), problems };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']}:{ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
const log = [];
for (const [width, theme, size, lang, zoom] of variants) {
  // Dark variants also emulate reduced motion, so both motion modes are covered.
  const ctx = await browser.newContext({ viewport: { width: width / zoom, height: 900 / zoom }, deviceScaleFactor: zoom, reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'lang', value: lang, url: BASE }, { name: 'display-theme', value: theme, url: BASE }, { name: 'display-text-size', value: size, url: BASE }]);
  const page = await ctx.newPage();
  const label = `${width}-${theme}-${size}-${lang}${zoom > 1 ? '-zoom200' : ''}`;
  for (const [id, path] of routes) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700);
    const m = await page.evaluate(measure);
    await page.addScriptTag({ content: axeSource });
    const axe = (await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] }))).violations.map(v => `${v.id}:${v.nodes.length}`);
    const file = `${id}-${label}.png`;
    await page.screenshot({ path: OUT + file, fullPage: true });
    log.push({ page: id, path, width, theme, textSize: size, lang, zoom, file, ...m, axe });
  }
  // States: open tour step, open display panel, open mobile menu.
  await page.goto(BASE + '/');
  await page.locator('.header-tools button:has(.help-mark)').click();
  await page.waitForSelector('dialog.tour[open]');
  await page.screenshot({ path: `${OUT}tour-open-${label}.png` });
  log.push({ page: 'tour-open', width, theme, textSize: size, lang, zoom, file: `tour-open-${label}.png`, ...(await page.evaluate(measure)), axe: [] });
  await page.keyboard.press('Escape');
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('aria-haspopup') === 'dialog');
  log.push({ page: 'tour-escape-returns-focus', width, lang, ok: focusBack });
  await page.locator('.display-preferences > summary').click();
  await page.screenshot({ path: `${OUT}display-open-${label}.png` });
  log.push({ page: 'display-open', width, theme, textSize: size, lang, zoom, file: `display-open-${label}.png`, ...(await page.evaluate(() => { const r = document.querySelector('.display-panel').getBoundingClientRect(); const vw = document.documentElement.clientWidth; return { overflow: r.right > vw + 1 || r.left < -1, problems: r.right > vw + 1 || r.left < -1 ? [`display panel outside viewport ${Math.round(r.left)}-${Math.round(r.right)} of ${vw}`] : [] }; })), axe: [] });
  await page.keyboard.press('Escape');
  // Discovery states: open recommendation settings on home, open document explanation.
  await page.goto(BASE + '/'); await page.waitForSelector('#recommendations-title');
  const rec = page.locator('section[aria-labelledby="recommendations-title"] details > summary');
  if (await rec.count()) { await rec.first().click(); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}recommend-open-${label}.png`, fullPage: true }); log.push({ page: 'recommend-open', width, theme, textSize: size, lang, zoom, file: `recommend-open-${label}.png`, ...(await page.evaluate(measure)), axe: [] }); }
  await page.goto(BASE + explainPath, { waitUntil: 'networkidle' });
  const explain = page.locator('[aria-controls="document-explanation"]');
  if (await explain.count()) { await explain.click(); await page.waitForSelector('#document-explanation [role=status], #document-explanation blockquote', { timeout: 10000 }).catch(() => {}); await page.screenshot({ path: `${OUT}explain-open-${label}.png`, fullPage: true }); log.push({ page: 'explain-open', width, theme, textSize: size, lang, zoom, file: `explain-open-${label}.png`, ...(await page.evaluate(measure)), axe: [] }); }
  if (width / zoom < 1200) {
    await page.locator('.menu-toggle').click();
    const menuVisible = await page.evaluate(() => { const links = [...document.querySelectorAll('.nav a')].filter(a => { const r = a.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight * 3; }); return links.length; });
    log.push({ page: 'menu-links-visible', width, lang, ok: menuVisible >= 5 });
    await page.screenshot({ path: `${OUT}menu-open-${label}.png` });
    log.push({ page: 'menu-open', width, theme, textSize: size, lang, zoom, file: `menu-open-${label}.png`, ...(await page.evaluate(measure)), axe: [] });
  }
  await ctx.close();
}
await browser.close();
writeFileSync(OUT + 'report.json', JSON.stringify({ recordedAt: new Date().toISOString(), base: BASE, browser: process.env.CHROMIUM_PATH?'Chromium (Playwright, headless)':'Microsoft Edge (Playwright, headless)', note: 'zoom 2 = CSS viewport halved at device scale 2; this approximates, not replaces, real browser zoom', results: log }, null, 1));
const bad = log.filter(r => r.overflow || r.problems?.length || r.axe?.length || r.ok === false);
for (const r of bad) console.log(`${r.page} ${r.width}/${r.theme}/${r.textSize}/${r.lang}${r.zoom > 1 ? '/zoom200' : ''}: ${[r.overflow && 'overflow', ...(r.problems ?? []), ...(r.axe ?? []).map(a => 'axe ' + a), r.ok === false && 'focus not returned'].filter(Boolean).join(' | ')}`);
console.log(`checked ${log.length}, with findings ${bad.length}`);
if(bad.length)process.exitCode=1;
