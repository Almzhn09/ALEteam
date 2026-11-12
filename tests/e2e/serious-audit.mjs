// Local-only fault-injection regression. Authentication writes use an isolated _test DB.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const base=process.env.BASE_URL??'http://localhost:3126',real=process.env.REAL_BASE_URL??'http://localhost:3124',out=process.env.OUT??'.local/audit-proof';
for(const url of [base,real])assert.match(url,/^http:\/\/localhost:\d+$/u);assert.ok(new URL(process.env.TEST_DATABASE_URL??'').pathname.endsWith('_test'));await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(15000);const errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));
const email='audit-'+randomBytes(8).toString('hex')+'@example.test',password=randomBytes(24).toString('hex');
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS',name);}
async function settleResponse(action){const done=p.waitForResponse(r=>r.url()===base+'/api/me');action();await done;await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function holdMe(){
 let captured,release,finished;const ready=new Promise(r=>captured=r),gate=new Promise(r=>release=r),done=new Promise(r=>finished=r);let once=false;
 await p.route(base+'/api/me',async route=>{if(once)return route.continue();once=true;const response=await route.fetch();captured(response.status());await gate;try{await route.fulfill({response});}finally{finished();}});
 await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
 const status=await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('No held session request')),15000))]);
 return {status,async finish(){await settleResponse(release);await done;await p.unroute(base+'/api/me');}};
}
try{
 await check('browser-normalized authentication destinations cannot send a visitor off site',async()=>{
  const response=await p.request.post(base+'/api/auth/sign-up/email',{headers:{Origin:base},data:{name:'Читатель аудита',email,password}});assert.equal(response.status(),200);await p.request.post(base+'/api/auth/sign-out',{headers:{Origin:base},data:{}});
  for(const target of ['/\t/evil.example','/a/..//evil.example','//evil.example']){
   await p.goto(base+'/register?returnTo='+encodeURIComponent(target));await p.locator('main a[href^="/login?"]').waitFor();const href=await p.locator('main a[href^="/login?"]').getAttribute('href');assert.equal(new URL(href,base).searchParams.get('returnTo'),'/');
  }
  await p.goto(base+'/login?returnTo='+encodeURIComponent('/\t/evil.example'));await p.locator('main input[type=email]').fill(email);await p.locator('main input[type=password]').fill(password);await p.locator('main button[type=submit]').click();await p.waitForURL(base+'/');assert.equal(new URL(p.url()).origin,base);
 });
 await check('a delayed authenticated session response cannot restore account UI after logout',async()=>{
  await p.goto(base+'/login');await p.locator('main').getByRole('button',{name:'Выйти',exact:true}).waitFor();const held=await holdMe();assert.equal(held.status,200);
  await p.locator('main').getByRole('button',{name:'Выйти',exact:true}).click();await p.locator('main input[type=email]').waitFor();await held.finish();assert.ok(await p.locator('main input[type=email]').isVisible());assert.equal((await p.request.get(base+'/api/me')).status(),401);
 });
 await check('a delayed guest response cannot erase a completed sign-in',async()=>{
  const held=await holdMe();assert.equal(held.status,401);await p.locator('main input[type=email]').fill(email);await p.locator('main input[type=password]').fill(password);await p.locator('main button[type=submit]').click();await p.waitForURL(base+'/');await held.finish();
  await p.goto(base+'/login');await p.locator('main').getByRole('button',{name:'Выйти',exact:true}).waitFor();assert.equal((await p.request.get(base+'/api/me')).status(),200);
 });
 const rc=await browser.newContext({viewport:{width:360,height:900},reducedMotion:'reduce'}),r=await rc.newPage();r.setDefaultTimeout(15000);r.on('pageerror',e=>errors.push(e.message));
 await check('saved CMS search opens actual publications and keeps filters when resubmitted',async()=>{
  const path='/catalog?scope=cms&category=history&contentKind=PAGE&contentLang=ru';await r.goto(real+path);await r.locator('.search-card').first().waitFor();assert.equal(await r.locator('.search-scopes a[aria-current=page]').getAttribute('href')!==null,true);
  const expected=await(await r.request.get(real+'/api/search?scope=cms&category=history&contentKind=PAGE&locale=ru&pageSize=10')).json();assert.ok(expected.total>0);assert.equal(Number(await r.locator('.results-head strong').textContent()),expected.total);
  await r.locator('#archive-query').fill('1940');await r.locator('.archive-search-form button[type=submit]').click();await r.waitForURL(u=>u.searchParams.get('q')==='1940');await r.locator('.search-card').first().waitFor();const url=new URL(r.url());for(const [k,v]of Object.entries({category:'history',contentKind:'PAGE',contentLang:'ru',scope:'cms'}))assert.equal(url.searchParams.get(k),v);
  assert.equal(await r.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);await r.screenshot({path:out+'/saved-cms-search-360.png',fullPage:true});
 });
 await check('scope switching and leaving advanced search clear incompatible source filters',async()=>{
  await r.locator('.search-scopes a').first().click();await r.waitForURL(u=>u.searchParams.get('scope')==='all'&&!u.searchParams.has('contentLang'));await r.locator('#archive-query').waitFor();assert.equal(new URL(r.url()).searchParams.has('contentLang'),false);assert.equal(new URL(r.url()).searchParams.has('category'),false);
  await r.goto(real+'/catalog?advanced=1&category=history&contentLang=ru');await r.getByRole('link',{name:'Вернуться к общему поиску',exact:true}).click();await r.waitForURL(u=>!u.searchParams.has('advanced')&&!u.searchParams.has('category'));await r.locator('#archive-query').waitFor();assert.equal(new URL(r.url()).searchParams.has('category'),false);
 });
 await rc.close();assert.deepEqual(errors,[]);
}finally{await ctx.close();await browser.close();await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,errors,scope:'Private authentication tests on disposable _test DB; read-only real source search on local production'},null,2)+'\n');}
