// Read-only regression for published editions, source fallbacks and language switching.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const base=process.env.BASE_URL??'http://localhost:3124',out=process.env.OUT??'.local/language-proof';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u);await mkdir(out,{recursive:true});
const blocks=JSON.parse(await readFile('data/artur/reference-design/blocks.json'));
const paths=[...new Set([...blocks.navigation.flatMap(n=>n.children??[n]),...blocks.footerLinks].map(n=>n.href).filter(h=>h?.startsWith('/')).concat(['/news','/exhibitions','/memory','/branches','/pages/archive-contacts','/catalog?scope=newspaper&entry=rn-3eacef96c7c8cf5d159a004902dd']))];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const checks=[],pages=[],errors=[];const ctx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS',name);}
function localized(path,lang){const u=new URL(path,base);u.searchParams.set('lang',lang);return u.href;}
try{
 await check('all public menu and footer destinations open in RU, KK and EN',async()=>{
  for(const lang of ['ru','kk','en'])for(const path of paths){
   const response=await p.goto(localized(path,lang));assert.equal(response.status(),200,path+' '+lang);assert.equal(await p.locator('html').getAttribute('lang'),lang);
   const title=await p.locator('main h1').innerText();assert.ok(!/No translation|Таңдалған тілге аударма жоқ|Нет перевода|404/u.test(title),path+' '+lang+': '+title);
   if(path.startsWith('/materials/')||path.startsWith('/pages/'))await p.locator('#material-body .body-text').waitFor();
   pages.push({path,lang,status:response.status(),title});
  }
 });
 await check('missing English translation opens the unchanged published source and retains English interface',async()=>{
  const source=await (await p.request.get(base+'/api/content/archive-history-1?locale=ru')).json();
  assert.equal((await p.request.get(base+'/api/content/archive-history-1?locale=en')).status(),404,'Public API must not invent a translation');
  await p.goto(localized('/materials/archive-history-1','en'));assert.equal(await p.locator('main h1').innerText(),source.item.payload.title);assert.equal(await p.locator('#material-body').getAttribute('lang'),'ru');await p.locator('.source-language').filter({hasText:'Material in its original language'}).waitFor();assert.equal(await p.locator('link[hreflang=en]').count(),0,'Do not advertise an unpublished translation');
  await p.screenshot({path:out+'/history-en.png',fullPage:true});
 });
 await check('branches are available in every interface language and each profile opens',async()=>{
  const ru=await (await p.request.get(base+'/api/content?kind=BRANCH_PROFILE&locale=ru&pageSize=50')).json();assert.ok(ru.items.length);
  for(const lang of ['kk','en']){
   await p.goto(localized('/branches',lang));assert.equal(await p.locator('.branch-layout .result-list>li').count(),ru.items.length);
   const target=await p.locator('.branch-layout .result-list>li a').first().getAttribute('href');const response=await p.goto(localized(target,lang));assert.equal(response.status(),200);await p.locator('#material-body .body-text').waitFor();
  }
 });
 await check('language picker releases a pinned source edition, prefers a published translation and preserves unrelated URL state',async()=>{
  const ru=(await(await p.request.get(base+'/api/content/archive-reading-room-info?locale=ru')).json()).item;
  const kk=(await(await p.request.get(base+'/api/content/archive-reading-room-info?locale=kk')).json()).item;assert.ok(ru&&kk);
  await p.goto(base+'/materials/archive-reading-room-info?contentLang=ru&lang=en&keep=1#material-body');
  await p.locator('.site-header select').first().selectOption('kk');await p.waitForFunction(()=>document.documentElement.lang==='kk'&&document.querySelector('#material-body')?.lang==='kk');
  assert.equal(await p.locator('main h1').innerText(),kk.payload.title);const url=new URL(p.url());assert.equal(url.searchParams.get('keep'),'1');assert.equal(url.hash,'#material-body');assert.equal(url.searchParams.has('contentLang'),false);assert.equal(url.searchParams.has('lang'),false);
  const englishResponse=await p.request.get(base+'/api/content/archive-reading-room-info?locale=en');const expected=englishResponse.ok()?(await englishResponse.json()).item:ru;await p.locator('.site-header select').first().selectOption('en');await p.waitForFunction(locale=>document.documentElement.lang==='en'&&document.querySelector('#material-body')?.lang===locale,expected.locale);assert.equal(await p.locator('main h1').innerText(),expected.payload.title);
 });
 await check('unpublished or wrong-kind routes remain unavailable, and explicit edition selection is respected',async()=>{
  for(const path of ['/materials/does-not-exist-language-check','/news/archive-history-1'])assert.equal((await p.goto(localized(path,'en'))).status(),404);
  await p.goto(base+'/materials/archive-history-1?lang=en&contentLang=kk');await p.getByRole('heading',{name:'No translation in the selected language',exact:true}).waitFor();const href=await p.getByRole('link',{name:'Русский',exact:true}).getAttribute('href');assert.ok(href.includes('contentLang=ru'));await p.goto(new URL(href,base).href);assert.equal(await p.locator('html').getAttribute('lang'),'en');await p.locator('#material-body').waitFor();
 });
 await check('contacts, history and structure fit three widths in both affected languages',async()=>{
  for(const width of [360,768,1440])for(const lang of ['kk','en'])for(const slug of ['archive-contacts','archive-history-1','archive-structure']){
   await p.setViewportSize({width,height:900});await p.goto(localized('/materials/'+slug,lang));await p.locator('#material-body .body-text').waitFor();assert.equal(await p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
   if(width===1440&&lang==='en'&&slug==='archive-contacts'||width===360&&lang==='kk'&&slug==='archive-structure'){await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:out+'/'+slug+'-'+lang+'-'+width+'.png'});}
  }
 });
 assert.deepEqual(errors,[]);
}finally{await ctx.close();await browser.close();await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,pages,errors,scope:'Local production; existing real public CMS editions; no writes or automatic translation'},null,2)+'\n');}
