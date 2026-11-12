// Creates accounts only against a locally started application on a dedicated _test database.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const base=process.env.BASE_URL??'http://localhost:3125',out=process.env.OUT??'.local/registration-proof';
assert.match(base,/^http:\/\/localhost:\d+$/u);assert.ok(new URL(process.env.TEST_DATABASE_URL??'').pathname.endsWith('_test'),'Dedicated registration test server and database required');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:360,height:1000},reducedMotion:'reduce'});const p=await ctx.newPage();p.setDefaultTimeout(15000);const errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));
const password=randomBytes(24).toString('hex'),email='browser-'+randomBytes(8).toString('hex')+'@example.test';let sends=0;p.on('request',r=>{if(r.url().endsWith('/api/auth/sign-up/email')&&r.method()==='POST')sends++;});
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS',name);}
async function fill(pass=password,confirm=pass){const fields=p.locator('main form input');await fields.nth(0).fill('Читатель архива');await fields.nth(1).fill(email);await fields.nth(2).fill(pass);await fields.nth(3).fill(confirm);}
try{
 await check('login links to a translated public form, return destination and enlarged mobile layout survive in RU/KK/EN',async()=>{
  for(const lang of ['ru','kk','en']){
   await p.goto(base+'/login?lang='+lang+'&returnTo=%2Fme');assert.ok(!(await p.locator('main').innerText()).includes('Публичная регистрация закрыта'));
   await p.locator('main a[href^="/register?"]').click();await p.locator('main input[autocomplete=name]').waitFor();assert.equal(new URL(p.url()).searchParams.get('returnTo'),'/me');assert.equal(await p.locator('html').getAttribute('lang'),lang);assert.equal(await p.locator('main input').count(),4);
   await p.evaluate(()=>{document.documentElement.dataset.textSize='150';document.documentElement.dataset.theme='dark';});assert.equal(await p.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
   if(lang==='kk')await p.screenshot({path:out+'/register-kk-360.png',fullPage:true});
  }
 });
 await check('short passwords and mismatch fail locally without creating accounts',async()=>{
  await p.goto(base+'/register?lang=ru&returnTo=%2Fme');await fill('short');await p.locator('main button[type=submit]').click();await p.getByText('Пароль должен содержать от 12 до 128 символов.',{exact:true}).first().waitFor();assert.equal(sends,0);
  await fill(password,password+'different');await p.locator('main button[type=submit]').click();await p.getByText('Пароли не совпадают.',{exact:true}).waitFor();assert.equal(sends,0);
 });
 await check('public registration signs a new reader in, redirects to their account and grants no staff rights',async()=>{
  await fill();await p.locator('main button[type=submit]').click();await p.waitForURL(u=>u.pathname==='/me');
  const response=await p.request.get(base+'/api/me');assert.equal(response.status(),200);const {item}=await response.json();assert.equal(item.email,email);assert.equal(item.role,'AUTHOR');assert.equal(item.name,'Читатель архива');assert.equal((await p.request.get(base+'/api/admin/me')).status(),403);assert.ok((await ctx.cookies()).some(c=>c.name.includes('session')&&c.httpOnly));
 });
 await check('a registered visitor can sign out and sign in with the new password',async()=>{
  await p.goto(base+'/login');await p.locator('main').getByRole('button',{name:'Выйти',exact:true}).click();await p.locator('main input[type=email]').fill(email);await p.locator('main input[type=password]').fill(password);await p.locator('main button[type=submit]').click();await p.waitForURL(u=>u.pathname==='/');assert.equal((await p.request.get(base+'/api/me')).status(),200);
  await p.request.post(base+'/api/auth/sign-out',{headers:{Origin:base},data:{}});
 });
 await check('duplicate registration exposes a sign-in path, preserves entered identity and does not sign the visitor in',async()=>{
  await p.goto(base+'/register?lang=ru');await fill();await p.locator('main button[type=submit]').click();await p.getByText('Не удалось создать аккаунт. Проверьте данные или войдите, если аккаунт уже есть.',{exact:true}).waitFor();assert.equal(await p.locator('main input[type=email]').inputValue(),email);assert.equal(await p.locator('main input[type=password]').first().inputValue(),'');assert.equal((await p.request.get(base+'/api/me')).status(),401);assert.equal(await p.locator('main a[href^="/login?"]').count(),1);
 });
 await check('temporary and rate-limit failures stay actionable, and the form passes axe',async()=>{
  for(const status of [503,429]){
   await p.route('**/api/auth/sign-up/email',r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code:'TEMPORARY',message:'Сервис временно недоступен.'}})}));await fill();await p.locator('main button[type=submit]').click();await p.locator('main [role=alert]').filter({hasText:status===429?'Слишком много попыток регистрации. Попробуйте через минуту.':'Сервис временно недоступен.'}).waitFor();assert.equal(await p.locator('main input[type=email]').inputValue(),email);await p.unroute('**/api/auth/sign-up/email');
  }
  await p.addScriptTag({content:await readFile('node_modules/axe-core/axe.min.js','utf8')});assert.deepEqual(await p.evaluate(async()=> (await axe.run(document.querySelector('main'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations),[]);
 });
 await check('the registration endpoint rate-limits direct clients with spoofed forwarded addresses',async()=>{
  let limited=false;for(let i=0;i<7;i++){const r=await p.request.post(base+'/api/auth/sign-up/email',{headers:{Origin:base,'X-Forwarded-For':'198.51.100.'+i},data:{name:'Читатель архива',email,password}});if(r.status()===429){limited=true;break;}}assert.ok(limited);
 });
 assert.deepEqual(errors,[]);
}finally{await ctx.close();await browser.close();await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,errors,scope:'Local production application with disposable dedicated _test database; no production accounts or credentials'},null,2)+'\n');}
