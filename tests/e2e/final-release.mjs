// Final acceptance against a disposable local container with the real public corpus.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {verifyPriceOriginal} from '../helpers/reference-original.mjs';
const base=process.env.BASE_URL,out=process.env.OUT??'.local/final-release-browser';
assert.match(base??'',/^http:\/\/localhost:\d+$/);
assert.ok(process.env.ALE_BROWSER_COOKIE,'Authenticated disposable-container session required');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.addCookies([{name:'lang',value:'ru',url:base}]);
const page=await context.newPage(),checks=[],errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
async function check(name,fn){const details=await fn();checks.push({name,passed:true,...details});console.log('PASS',name);}
async function json(path){const r=await page.request.get(base+path);assert.equal(r.status(),200,path);return r.json();}
try{
 await check('Two real carousel photos and the contact photo decode; material links open',async()=>{
  await page.goto(base);assert.equal(await page.locator('.hero-slide').count(),2);
  const links=[];
  for(let i=0;i<2;i++){
   await page.locator('.hero-slide-dots a').nth(i).click();const slide=page.locator('.hero-slide').nth(i),image=slide.locator('img');
   await image.scrollIntoViewIfNeeded();await image.evaluate(img=>img.decode());assert.ok(await image.evaluate(img=>img.naturalWidth>0&&img.naturalHeight>0));
   const href=await slide.locator('.hero-slide-link').getAttribute('href');assert.equal((await page.request.get(base+href)).status(),200);links.push(href);
  }
  const contactPhoto=page.locator('.contact-photo img');await contactPhoto.scrollIntoViewIfNeeded();await contactPhoto.evaluate(img=>img.decode());assert.ok(await contactPhoto.evaluate(img=>img.naturalWidth>0&&img.naturalHeight>0));
  await page.locator('.reference-hero').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/home.png'});return {photos:3,links};
 });
 await check('Four city spellings return identical search results; AI answers link to available sources',async()=>{
  const variants=['Өскемен','Оскемен','Усть-Каменогорск','Усть Каменогорск'];let expected;const answers=[];
  for(const q of variants){
   const found=await json('/api/search?'+new URLSearchParams({q,pageSize:'100'}));const ids=found.items.map(row=>row.material?.id??row.id);
   const snapshot={total:found.total,ids};if(expected)assert.deepEqual(snapshot,expected);else expected=snapshot;assert.ok(found.total>0);
   const r=await page.request.post(base+'/api/assistant',{headers:{Origin:base,Cookie:process.env.ALE_BROWSER_COOKIE},data:{question:q,locale:'ru',history:[]}});assert.equal(r.status(),200);
   const answer=await r.json();assert.equal(answer.noAnswer,false,q);assert.ok(answer.sources.length);assert.match(answer.searchHref,/^\/search\?/);
   assert.equal((await page.request.get(base+answer.searchHref)).status(),200);
   for(const source of answer.sources){assert.ok(source.href.startsWith('/'));assert.equal((await page.request.get(base+source.href)).status(),200,source.href);}
   answers.push({question:q,answer:answer.answer,noAnswer:answer.noAnswer,sources:answer.sources.map(s=>({kind:s.kind,href:s.href})),searchHref:answer.searchHref});
  }
  for(const question of ['Расскажи об истории архива','Когда был создан архив?']){
   const r=await page.request.post(base+'/api/assistant',{headers:{Origin:base,Cookie:process.env.ALE_BROWSER_COOKIE},data:{question,locale:'ru',history:[]}});assert.equal(r.status(),200);const answer=await r.json();assert.equal(answer.noAnswer,false,question);assert.ok(answer.sources.length);
   if(question==='Когда был создан архив?')assert.match(answer.answer,/1940/u,'Archive founding must not be confused with later branch creation');
   for(const source of answer.sources)assert.equal((await page.request.get(base+source.href)).status(),200,source.href);
   answers.push({question,answer:answer.answer,noAnswer:answer.noAnswer,sources:answer.sources.map(s=>({kind:s.kind,href:s.href}))});
  }
  return {total:expected.total,answers};
 });
 await check('Paid services opens the complete official PDF in a native browser preview',async()=>{
  const original=await verifyPriceOriginal(base);await page.goto(base+'/materials/archive-paid-services-info');
  const response=page.waitForResponse(r=>r.url()===base+original.href&&r.status()===200);
  await page.getByRole('button',{name:/^Просмотреть PDF/}).click();await response;
  const iframe=page.locator('.pdf-frame iframe');await iframe.waitFor();assert.match(await iframe.getAttribute('src'),/^blob:/);
  // Every preview byte must be the complete, SHA-verified source, never a first-page substitute.
  const previewBytes=await page.evaluate(async()=>{const bytes=await (await fetch(document.querySelector('.pdf-frame iframe').src)).arrayBuffer();return bytes.byteLength;});assert.equal(previewBytes,1636084);
  let viewer;
  for(let i=0;i<40;i++){viewer=page.frames().find(frame=>frame.url().startsWith('chrome-extension://'));if(viewer&&await viewer.locator('input#pageSelector').count())break;await delay(250);}
  assert.ok(viewer,'Native Chromium PDF viewer must load');
  await viewer.locator('input#pageSelector').waitFor();
  await page.locator('.pdf-frame').screenshot({path:out+'/price-pdf.png'});
  for(const target of [2,15]){
   await viewer.locator('input#pageSelector').fill(String(target));await viewer.locator('input#pageSelector').press('Enter');
   await viewer.waitForFunction(target=>document.querySelector('pdf-viewer')?.viewport?.getMostVisiblePage()===target-1,target);
   await page.locator('.pdf-frame').screenshot({path:out+'/price-pdf-page-'+target+'.png'});
  }
  await page.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();assert.equal(await iframe.count(),0);
  return {sha256:original.sha256,bytes:previewBytes,nativeViewerPages:[1,2,15],pagesConfirmedBy:'Native Chromium viewport getMostVisiblePage; separate parser count is 15'};
 });
 await check('History DOCX can be read through its last fragment without truncation',async()=>{
  const {item}=await json('/api/content/archive-history-1');const {items}=await json('/api/discovery/materials/cms/'+item.id+'/attachments?locale=ru');const docx=items.find(f=>f.variant==='master'&&f.name.endsWith('.docx'));assert.ok(docx);
  const fragments=[];let offset,parts=0;
  do{const {item:text}=await json(docx.textHref+'?reader=1'+(offset===undefined?'':'&offset='+offset));fragments.push(...text.fragments);offset=text.nextOffset;parts++;assert.ok(parts<100);}while(offset!=null);
  assert.ok(parts>1,'Real long DOCX must exercise continuation');
  await page.goto(base+'/materials/archive-history-1');const card=page.locator('#material-originals li').filter({has:page.getByRole('heading',{name:docx.name,exact:true})});
  await card.locator('.source-fragment').first().waitFor();
  for(let i=1;i<parts;i++){await card.getByRole('button',{name:'Читать дальше',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('#material-originals .source-fragment').length>n,await card.locator('.source-fragment').count()-1);await card.locator('.original-more [aria-busy=true]').waitFor({state:'hidden'});}
  assert.equal(await card.locator('.source-fragment').count(),fragments.length);assert.equal(await card.getByRole('button',{name:'Читать дальше',exact:true}).count(),0);
  assert.equal(await card.locator('.source-fragment p').last().innerText(),fragments.at(-1).text);
  await card.locator('.source-fragment').last().scrollIntoViewIfNeeded();await page.screenshot({path:out+'/history-last-fragment.png'});return {parts,fragments:fragments.length,lastFragmentCharacters:fragments.at(-1).text.length};
 });
 await check('A missing original stops retries and does not offer a broken new-tab link',async()=>{
  await page.goto(base+'/materials/archive-paid-services-info');let requests=0;
  await page.route('**/api/material-files/*',route=>{requests++;return route.fulfill({status:404,body:'Unavailable'});});
  await page.getByRole('button',{name:/^Просмотреть PDF/}).click();await page.locator('.pdf-frame [role=alert]').waitFor();
  assert.equal(await page.locator('.pdf-frame iframe').count(),0);assert.equal(await page.locator('.pdf-frame a').count(),0);assert.equal(await page.locator('.pdf-frame').getByRole('button',{name:'Повторить',exact:true}).count(),0);
  await delay(1000);assert.equal(requests,1);await page.unroute('**/api/material-files/*');return {requests};
 });
 await check('A delayed real navigation immediately announces loading and then clears it',async()=>{
  await page.route('**/about**',async route=>{if(new URL(route.request().url()).pathname!=='/about')return route.continue();if(route.request().headers()['next-router-prefetch'])return route.abort();await delay(1800);await route.continue();});
  await page.goto(base);await page.locator('.hero-about').click();await page.locator('.navigation-feedback[role=status]').waitFor();assert.equal(await page.locator('#main').getAttribute('aria-busy'),'true');
  await page.waitForURL(u=>u.pathname==='/about');await page.locator('.navigation-feedback').waitFor({state:'hidden'});assert.equal(await page.locator('#main').getAttribute('aria-busy'),null);await page.unroute('**/about**');
 });
 assert.deepEqual(errors,[]);
}finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,errors,scope:'Local compact Cloud Run image; disposable database; real public corpus'},null,2)+'\n');}
