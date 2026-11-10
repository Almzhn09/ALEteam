import { chromium } from 'playwright-core';
import {spawn, execFileSync, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes, createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw Error('Dedicated TEST_DATABASE_URL ending in _test required');
const base = 'http://localhost:3097', folder = '.local/display-20261110';
const env = {...process.env, DATABASE_URL: database, BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  ALLOW_DEMO_SEED:'1', DEMO_AUTHOR_PASSWORD:randomBytes(32).toString('hex'), DEMO_MODERATOR_PASSWORD:randomBytes(32).toString('hex'), NEXT_PUBLIC_API_MOCK:'0'};
let app: ChildProcess | undefined;
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const checks: unknown[] = [], errors: string[] = [];
try {
  await mkdir(folder,{recursive:true});
  execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env,stdio:'pipe'});
  execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3097'],{env,stdio:'ignore'});
  let ready=false;
  for(let i=0;i<100;i++) {try {if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{} await delay(100);}
  assert.ok(ready);
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.name));
  await page.goto(base+'/catalog?q='+encodeURIComponent('библиотека'));
  await page.getByText('Найдено:').waitFor();
  const initialUrl=page.url();
  await page.getByText('Вид сайта',{exact:true}).click();
  await page.getByLabel('Цветовая тема',{exact:true}).selectOption('light');
  await page.getByLabel('Размер текста',{exact:true}).selectOption('150');
  assert.equal(page.url(),initialUrl);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).fontSize),'24px');
  await page.getByLabel('Размер текста',{exact:true}).press('Escape');
  assert.equal(await page.locator('.display-preferences').getAttribute('open'),null);
  assert.equal(await page.locator('.display-preferences summary').evaluate(el=>el===document.activeElement),true);
  await page.reload();await page.getByText('Найдено:').waitFor();
  assert.equal(await page.getByLabel('Размер текста',{exact:true}).inputValue(),'150');
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'light');
  const html=await (await context.request.get(page.url())).text();
  assert.match(html, /data-theme="light"/);assert.match(html, /data-text-size="150"/);
  checks.push({name:'preferences preserve search URL, persist on reload, render in server HTML, override dark OS; Escape restores focus',passed:true});
  const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
  for(const width of [360,768,1440]) for(const theme of ['light','dark']) for(const size of ['100','112.5','125','150']) {
    await page.setViewportSize({width,height:1000});
    await page.locator('.display-preferences summary').click();
    await page.getByLabel('Цветовая тема',{exact:true}).selectOption(theme);
    await page.getByLabel('Размер текста',{exact:true}).selectOption(size);
    await page.getByLabel('Размер текста',{exact:true}).press('Escape');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}/${theme}/${size}: overflow`);
    await page.addScriptTag({content:axe});
    const violations=await page.evaluate(async()=> (await (window as unknown as {axe:{run:(o:unknown)=>Promise<{violations:{id:string; nodes:{html:string; failureSummary?:string}[]}[]}>}}).axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))})));
    if (violations.length) await writeFile(folder+'/failure.json',JSON.stringify({width,theme,size,violations},null,2));
    assert.deepEqual(violations,[],`${width}/${theme}/${size}`);
    checks.push({width,theme,size,overflow:false,axeViolations:violations});
  }
  // A 720px CSS viewport on a 1440px-wide display represents the reflow width at 200% browser zoom.
  // Font enlargement is also tested above; this is not a manual browser/OS zoom certification.
  await page.setViewportSize({width:720,height:500});
  await page.goto(base);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  checks.push({name:'720 CSS px reflow (200% width equivalent on 1440 display)',passed:true});
  await context.clearCookies();await page.goto(base);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'system');
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'dark');
  await page.emulateMedia({colorScheme:'light'});
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'light');
  checks.push({name:'system preference follows device changes',passed:true});
  await page.locator('.display-preferences summary').click();
  await page.getByLabel('Цветовая тема',{exact:true}).selectOption('dark');
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).colorScheme),'dark');
  await page.getByLabel('Размер текста',{exact:true}).selectOption('125');
  await page.getByLabel('Размер текста',{exact:true}).press('Escape');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:folder+'/02-home-dark-large.png',fullPage:true});
  await page.locator('.display-preferences summary').click();
  await page.getByLabel('Цветовая тема',{exact:true}).selectOption('light');
  await page.getByLabel('Размер текста',{exact:true}).selectOption('100');
  await page.getByLabel('Размер текста',{exact:true}).press('Escape');
  await page.screenshot({path:folder+'/01-home-light.png',fullPage:true});
  await page.setViewportSize({width:360,height:844});
  await page.locator('.display-preferences summary').click();
  await page.getByLabel('Размер текста',{exact:true}).selectOption('150');
  await page.screenshot({path:folder+'/03-mobile-reading-settings.png',fullPage:true});
  await page.getByLabel('Размер текста',{exact:true}).press('Escape');
  await page.getByRole('button',{name:'Қазақ тіліне ауысу'}).click();
  await page.waitForFunction(()=>document.documentElement.lang==='kk');
  assert.equal(await page.getByLabel('Мәтін өлшемі',{exact:true}).inputValue(),'150');
  await page.getByRole('button',{name:'Мәзір',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:folder+'/04-mobile-kk-large.png',fullPage:true});
  checks.push({name:'Kazakh switch retains preference; mobile navigation and reading settings remain available',passed:true});
  assert.deepEqual(errors,[]);
  const sourceSha256:Record<string,string>={};
  for(const file of ['src/components/DisplayPreferences.tsx','src/components/Header.tsx','src/app/layout.tsx','src/app/globals.css','src/lib/kk.ts']) sourceSha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
  await writeFile(folder+'/report.json',JSON.stringify({capturedAt:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256,checks,browserErrors:errors,syntheticData:true,environment:'Local production Next.js; real isolated PostgreSQL; Chromium',limitations:['Manual browser zoom, screen reader and native language review remain; EN UI and future CMS screens not covered.']},null,2)+'\n');
  console.log(`PASS ${checks.length} display checks, including 24 viewport/theme/text combinations; four screenshots.`);
} finally {
  await browser.close();if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}
}
