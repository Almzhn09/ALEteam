// Real production build, real isolated PostgreSQL, original demo records; no mock screenshots.
import {chromium} from 'playwright-core';
import {randomBytes, createHash} from 'node:crypto';
import {spawn, execFileSync, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw Error('Dedicated TEST_DATABASE_URL ending in _test required');
const origin = 'http://localhost:3096';
const password = randomBytes(32).toString('hex');
const env = {...process.env, DATABASE_URL: url, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  ALLOW_DEMO_SEED: '1', DEMO_AUTHOR_PASSWORD: password, DEMO_MODERATOR_PASSWORD: randomBytes(32).toString('hex'),
  ASSISTANT_MODE: 'local-model', ASSISTANT_SERVICE_URL: '', MODERATION_MODE: 'local', NEXT_PUBLIC_API_MOCK: '0'};
const folder = '.local/review-20261110';
let app: ChildProcess | undefined;
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
const screenshots: {file: string; route: string; locale: string; width: number; height: number}[] = [];
const pageErrors: string[] = [];
try {
  await mkdir(folder, {recursive: true});
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {env, stdio: 'pipe'});
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {env, stdio: 'pipe'});
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3096'], {env, stdio: 'ignore'});
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw Error('Review app exited');
    try {if ((await fetch(origin + '/api/health')).ok) {ready = true; break;}} catch { /* startup */ }
    await delay(100);
  }
  assert.ok(ready);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, colorScheme: 'light'});
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => pageErrors.push(e.name));
  const shot = async (file: string, route: string) => {
    await page.screenshot({path: folder + '/' + file, fullPage: true});
    screenshots.push({file, route, locale: 'ru', width: 1440, height: 1000});
  };
  await page.goto(origin); await page.locator('main a[href^="/documents/"]').first().waitFor();
  await shot('01-home-ru-desktop.png', '/');
  await page.goto(origin + '/catalog?q=' + encodeURIComponent('библиотека'));
  await page.getByText('Найдено:').waitFor();
  assert.match(await page.locator('main').innerText(), /Найдено:\s*4/);
  await shot('02-catalog-ru-desktop.png', '/catalog?q=библиотека');
  await page.goto(origin + '/documents/demo-doc-01');
  const image = page.locator('.viewer-stage img'); await image.waitFor({state: 'visible'});
  await page.waitForFunction(() => {const image = document.querySelector('.viewer-stage img') as HTMLImageElement | null; return image?.complete && image.naturalWidth > 0;});
  await shot('03-document-ru-desktop.png', '/documents/demo-doc-01');
  const login = await context.request.post(origin + '/api/auth/sign-in/email', {headers: {Origin: origin}, data: {email: 'author@example.test', password}});
  assert.equal(login.status(), 200);
  await page.goto(origin + '/assistant');
  const question = page.getByLabel('Ваш вопрос', {exact: true});
  await question.fill('Что такое архивный фонд?'); await question.press('Enter');
  await page.locator('.sources a[href="/about#guide-fund"]').waitFor();
  await shot('04-assistant-ru-desktop.png', '/assistant');
  const mobile = await browser.newContext({viewport: {width: 390, height: 844}, colorScheme: 'light'});
  await mobile.addCookies([{name: 'lang', value: 'kk', url: origin}]);
  const mobilePage = await mobile.newPage(); mobilePage.on('pageerror', e => pageErrors.push(e.name));
  await mobilePage.goto(origin); await mobilePage.locator('main a[href^="/documents/"]').first().waitFor();
  assert.equal(await mobilePage.locator('html').getAttribute('lang'), 'kk');
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobilePage.screenshot({path: folder + '/05-home-kk-mobile.png', fullPage: true});
  screenshots.push({file: '05-home-kk-mobile.png', route: '/', locale: 'kk', width: 390, height: 844});
  assert.deepEqual(pageErrors, []);
  const sourcePaths = ['src/app/page.tsx', 'src/app/assistant/Assistant.tsx', 'src/server/assistant.ts', 'src/server/corpus-health.ts'];
  const hashes: Record<string, string> = {};
  for (const file of sourcePaths) hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  const report = {capturedAt: new Date().toISOString(), codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    target: 'Local production Next.js build, real dedicated PostgreSQL, real Chromium; no mock API', syntheticData: true,
    screenshots, pageErrors, sourceSha256: hashes,
    limitations: ['Only the frontend currently published in GitHub is shown; no newer final UI commit was available.',
      'Demo records and original demo scans; not official archive data or proof of rights.', 'No EN UI or new CMS editing screens are claimed.']};
  await writeFile(folder + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Captured ${screenshots.length} real screenshots; no browser errors. Credentials were not recorded.`);
} finally {
  await browser.close();
  if (app?.exitCode === null) {app.kill('SIGTERM'); await once(app, 'exit');}
}
