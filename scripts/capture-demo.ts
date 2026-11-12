import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin;
if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Only local capture is allowed.');
await mkdir('.local/reports/screenshots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const width of [360, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, locale: 'ru-RU' });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.name));
    await page.goto(origin, { waitUntil: 'networkidle' });
    if (!await page.getByRole('heading', { level: 1 }).isVisible()) throw new Error('Missing technical heading');
    await page.keyboard.press('Tab');
    const keyboardFocus = await page.evaluate(() => document.activeElement?.tagName === 'A');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const health = await page.evaluate(async () => (await fetch('/api/health')).status);
    const guide = await page.evaluate(async () => (await fetch('/api/guides/guide-fund')).status);
    const file = `.local/reports/screenshots/landing-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    results.push({ width, keyboardFocus, overflow, health, guide, pageErrors: errors, screenshot: file, target: 'integrated public landing; full user flows are tested by test:release' });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile('.local/reports/browser-smoke.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
if (results.some(r => r.overflow || !r.keyboardFocus || r.health !== 200 || r.guide !== 200 || r.pageErrors.length)) process.exitCode = 1;
