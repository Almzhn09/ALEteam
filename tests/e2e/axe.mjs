import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(process.env.ENV_FILE ?? '.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const b = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge' });
const scheme = process.argv[2] ?? 'light';
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, colorScheme: scheme });
const p = await ctx.newPage();
async function audit(name) {
  await p.waitForTimeout(1500); await p.addScriptTag({ content: axe });
  const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  for (const v of r.violations) console.log(`[${scheme}] ${name}: ${v.impact} ${v.id} — ${v.help} :: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  if (!r.violations.length) console.log(`[${scheme}] ${name}: OK`);
}
for (const [n, path] of [['home', '/'], ['catalog', '/catalog?q=библиотека'], ['empty', '/catalog?q=zzzz'], ['doc', '/documents/demo-doc-03'], ['404doc', '/documents/nope'], ['fav', '/favorites'], ['about', '/about'], ['login', '/login'], ['404', '/nope'], ['assistant-guest', '/assistant']]) { await p.goto(BASE + path); await audit(n); }
await p.goto(BASE + '/login?returnTo=%2Fassistant'); await p.getByLabel('Email').fill('moderator@example.test'); await p.getByLabel('Пароль').fill(env.DEMO_MODERATOR_PASSWORD); await p.locator('main form button[type=submit]').click();
await p.waitForURL(u => u.pathname === '/assistant');
await audit('assistant');
await p.goto(BASE + '/documents/demo-doc-03'); await audit('doc-user');
await p.goto(BASE + '/moderation?status=PUBLISHED'); await audit('moderation');
await p.goto(BASE + '/me'); await audit('me');
await b.close();
