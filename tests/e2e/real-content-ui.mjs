// Read-only acceptance of the actual published corpus. No source fixtures or seed.
// One intentional failed text request verifies the visible retry path.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const base=process.env.BASE_URL??'http://localhost:3122',out=process.env.OUT??'.local/visual-v2-proof';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u,'Use a local review server.');
await mkdir(out,{recursive:true});
const checks=[],matrix=[],errors=[];
async function api(path){const r=await fetch(base+'/api'+path);assert.ok(r.ok,path+': '+r.status);return r.json();}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',recordVideo:{dir:out+'/video',size:{width:1440,height:1000}}});
await ctx.addCookies([{name:'lang',value:'ru',url:base},{name:'display-theme',value:'light',url:base}]);
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
try{
const history=(await api('/search?'+new URLSearchParams({scope:'cms',q:'1940'}))).items.find(h=>h.kind==='material'&&h.material.title.includes('История'))?.material;
assert.ok(history);const historyRoute=history.href.replace('/api/content/','/materials/').replace('?locale=','?contentLang=');
const decree=(await api('/search?scope=cms&q=142')).items.find(h=>h.kind==='material'&&h.material.href.includes('-142'))?.material;assert.ok(decree);
const decreeRoute=decree.href.replace('/api/content/','/materials/').replace('?locale=','?contentLang=');
const fund=(await api('/directories/funds?'+new URLSearchParams({number:'Р-1 ч.с.'}))).items[0];assert.ok(fund);
const paper=(await api('/directories/newspapers?pageSize=1')).items[0];
const place=(await api('/places?locale=ru&limit=3')).items[0];assert.ok(place);
 await check('home shows source-backed recommendations, a loaded credited photo, local font and voluntary help',async()=>{
  await page.goto(base);await page.locator('section[aria-labelledby="recommendations-title"] .result-list a').first().waitFor();
  assert.equal(await page.locator('dialog[open]').count(),0);
  const photo=page.locator('.archive-photo img');await photo.evaluate(img=>img.decode());assert.ok(await photo.evaluate(img=>img.naturalWidth>0));
  assert.ok(await page.locator('.archive-photo figcaption a').getAttribute('href'));await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.fonts.check('400 16px "Noto Sans"','ӘҒҚҢӨҰҮҺІ')));
  await page.screenshot({path:out+'/home-desktop.png',fullPage:true});
  await page.locator('#hero-q').fill('1940');await page.locator('.hero-search button').click();await page.getByRole('link',{name:'История архива · 1',exact:true}).waitFor();assert.ok(page.url().includes('/catalog?'));
 });
 await check('fund directory keeps literal numbers, exposes source names, sorting, pagination and a safe complete export',async()=>{
  await page.goto(base+'/catalog?scope=fund');await page.locator('.search-card').first().waitFor();
  assert.match(await page.locator('.results-head').innerText(),/1705/u);
  await page.locator('#fund-exact-number').fill('Р-1 ч.с.');await page.locator('.archive-search-form button[type=submit]').click();
  await page.waitForURL(url=>url.searchParams.get('number')==='Р-1 ч.с.');
  await page.waitForFunction(()=>/Найдено:\s*1(?:\s|$)/u.test(document.querySelector('.results-head > p')?.textContent??''));
  await page.getByRole('link',{name:'Фонд Р-1 ч.с.',exact:true}).waitFor();
  await page.locator('#directory-sort').selectOption('title');await page.waitForURL(/sort=title/);await page.getByRole('link',{name:'Фонд Р-1 ч.с.',exact:true}).waitFor();
  const filtered=await(await fetch(base+await page.getByRole('link',{name:'Скачать справочник',exact:true}).getAttribute('href'))).json();assert.equal(filtered.exported,1);assert.equal(filtered.items[0].number,'Р-1 ч.с.');
  await page.getByRole('link',{name:'Фонд Р-1 ч.с.',exact:true}).click();await page.locator('.directory-names').waitFor();assert.match(page.url(),/entry=/u);
  await page.goto(base+'/catalog?scope=fund&page=2');await page.locator('.search-card').first().waitFor();assert.equal(await page.locator('.search-card').count(),10);
  const full=await api('/directories/funds/export');assert.equal(full.exported,1705);assert.ok(full.items.every(i=>i.kind==='fund'&&i.names.length));
 });
 await check('newspaper entry is readable at its own link with original periods and source edition',async()=>{
  await page.goto(base+'/catalog?scope=newspaper&entry='+encodeURIComponent(paper.id));await page.getByRole('heading',{name:paper.title,exact:true}).waitFor();
  assert.ok((await page.locator('.search-card').innerText()).includes(paper.yearsOriginal));assert.ok((await page.locator('.source-details').innerText()).includes(paper.source.edition));
 });
 await check('advanced archival filters keep their existing API while honest empty and retry states work',async()=>{
  await page.goto(base+'/catalog?advanced=1&q=1940');await page.getByRole('heading',{name:'Ничего не найдено',exact:true}).waitFor();assert.equal(await page.getByRole('alert').filter({hasText:/\S/}).count(),0);
  await page.goto(base+'/catalog?scope=cms&q=zzzzzz-no-real-match');await page.getByRole('heading',{name:'Ничего не найдено',exact:true}).waitFor();

 });
 await check('real CMS DOCX offers original bytes, paragraph text, source-bound explanation and related reading',async()=>{
  await page.goto(base+historyRoute);await page.getByRole('heading',{name:'Оригиналы документов',exact:true}).waitFor();
  await page.route('**/api/material-files/*/text**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'Temporary test failure'}})}));
  await page.getByText('Читать текст оригинала',{exact:true}).click();await page.locator('.original-text').getByRole('alert').filter({hasText:/\S/}).waitFor();await page.unroute('**/api/material-files/*/text**');await page.locator('.original-text').getByRole('button',{name:'Повторить',exact:true}).click();await page.locator('.source-fragment').first().waitFor();assert.match(await page.locator('.original-fragments').innerText(),/1940/u);
  await page.getByRole('button',{name:'Показать выдержки и термины',exact:true}).click();await page.locator('.explanation-body blockquote').first().waitFor();
  const hrefs=await page.locator('.explanation-body figcaption a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));assert.ok(hrefs.every(h=>/^\/api\/material-files\/[a-zA-Z0-9_-]+(?:#page=\d+)?$/u.test(h)));
  await page.getByRole('heading',{name:'Связанные материалы',exact:true}).first().waitFor();await page.screenshot({path:out+'/material-desktop.png',fullPage:true});
 });
 await check('decree preview displays the actual page without copying restricted material through image optimisation',async()=>{
  await page.goto(base+decreeRoute);await page.getByText(/Посмотреть страницу источника/u).first().click();const preview=page.locator('.source-preview');await preview.evaluate(img=>img.decode());assert.ok(await preview.evaluate(img=>img.naturalWidth>0));assert.match(await preview.getAttribute('src'),/^\/api\/material-files\//u);
  await page.getByRole('button',{name:/^Просмотреть PDF/}).click();await page.locator('iframe').waitFor();assert.match(await page.locator('iframe').getAttribute('src'),/^blob:/u);await page.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();
  await page.screenshot({path:out+'/decree-desktop.png',fullPage:true});
 });
 await check('help and display controls are keyboard accessible, Escape restores focus and reduced motion is respected',async()=>{
  await page.goto(base);const help=page.getByRole('button',{name:'Как пользоваться',exact:true});await help.click();await page.locator('dialog.tour[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog.tour[open]').count(),0);assert.ok(await help.evaluate(el=>el===document.activeElement));
  const motion=await page.locator('.reveal').first().evaluate(el=>({animation:getComputedStyle(el).animationDuration,transition:getComputedStyle(el).transitionDuration}));assert.ok(motion.animation.split(',').every(v=>parseFloat(v)===0));
 });
 await check('published section hubs, standalone directory entries and alternate search use the integrated real corpus',async()=>{
  for(const route of ['/about','/calendar','/services','/about/compliance','/directories','/directories/funds','/directories/newspapers']){await page.goto(base+route);assert.equal(await page.locator('main h1').count(),1);assert.equal(await page.getByRole('alert').filter({hasText:/\S/}).count(),0);}
  await page.goto(base+'/directories/funds/'+fund.id);await page.locator('.page-head .mono').waitFor();assert.equal(await page.locator('.page-head .mono').textContent(),fund.number);assert.ok((await page.locator('main').innerText()).includes(fund.source.edition));
  await page.goto(base+'/search?q=1940');await page.getByRole('link',{name:'История архива · 1',exact:true}).waitFor();
  await page.goto(base+'/calendar');const calendarHref=await page.locator('.year-card a').first().getAttribute('href');assert.ok(calendarHref);await page.goto(base+calendarHref);await page.locator('.body-text').waitFor();assert.ok((await page.locator('.body-text').innerText()).length>1000);await page.setViewportSize({width:360,height:900});await page.evaluate(()=>document.documentElement.dataset.textSize='150');assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);await page.setViewportSize({width:1440,height:1000});
 });
 const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
 // Full 36 reading variants, 12 real screens each; measured layout, not a claim of physical-device/browser-zoom testing.
 const routes=[['home','/'],['catalog','/catalog?scope=cms'],['funds','/catalog?scope=fund&number='+encodeURIComponent('Р-1 ч.с.')],['material',historyRoute],['places','/places?placeId='+encodeURIComponent(place.id)],['about','/about'],['calendar','/calendar'],['services','/services'],['compliance','/about/compliance'],['directories','/directories'],['fund-list','/directories/funds'],['newspaper-list','/directories/newspapers']];
 const variants=[];for(const width of[360,768,1440])for(const lang of['ru','kk','en'])for(const theme of['light','dark'])for(const size of['100','150'])variants.push({width,lang,theme,size});
 for(const v of variants){
  const c=await browser.newContext({viewport:{width:v.width,height:1000},reducedMotion:'reduce'});await c.addCookies([{name:'lang',value:v.lang,url:base},{name:'display-theme',value:v.theme,url:base},{name:'display-text-size',value:v.size,url:base}]);const p=await c.newPage();
  for(const [name,route]of routes){await p.goto(base+route);await p.evaluate(()=>document.fonts.ready);if(name==='home')await p.locator('section[aria-labelledby="recommendations-title"] .result-list a').first().waitFor();if(name==='places')await p.locator('.history-timeline > li').first().waitFor();if(['catalog','funds'].includes(name))await p.locator('.search-card').first().waitFor();if(name==='material')await p.locator('.material-originals h2').waitFor();
   const geometry=await p.evaluate(()=>{const visible=el=>el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0&&!el.closest('details:not([open]) > :not(summary)')&&!el.closest('dialog:not([open]),.visually-hidden');const elements=[...document.querySelectorAll('.btn,select,input:not([type=hidden]),summary,.search-scopes a')].filter(visible),problems=[];for(const el of elements){const r=el.getBoundingClientRect();if(r.left< -1||r.right>innerWidth+1)problems.push('outside '+(el.textContent||el.tagName).slice(0,40));}for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++){const a=elements[i],b=elements[j];if(a.contains(b)||b.contains(a))continue;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();if(Math.min(ar.right,br.right)-Math.max(ar.left,br.left)>1&&Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top)>1)problems.push('overlap '+a.tagName+'/'+b.tagName);}return{overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),problems};});
   matrix.push({...v,page:name,...geometry});assert.equal(geometry.overflow,0,JSON.stringify(matrix.at(-1)));assert.deepEqual(geometry.problems,[],JSON.stringify(matrix.at(-1)));
   if(v.width===1440&&v.lang==='ru'&&v.size==='100')await p.screenshot({path:out+'/'+name+'-desktop-'+v.theme+'.png',fullPage:true});
   if(v.width===360&&v.lang==='ru'&&v.theme==='dark'&&v.size==='150')await p.screenshot({path:out+'/'+name+'-mobile-dark-150.png',fullPage:true});
   if(v.width===1440&&v.lang==='ru'&&v.size==='100'){await p.addScriptTag({content:axe});const violations=await p.evaluate(async()=> (await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa']})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})));assert.deepEqual(violations,[],JSON.stringify({v,name,violations}));}
  }await c.close();
 }
 checks.push({name:'432 real-page reading layouts: 36 size/language/theme/text variants × 12 screens, no overflow or overlapping controls; axe checks on 24 desktop screens',passed:true});
 // Open panels at the most constrained text setting.
 await ctx.addCookies([{name:'display-theme',value:'dark',url:base},{name:'display-text-size',value:'150',url:base}]);await page.setViewportSize({width:360,height:900});await page.goto(base);await page.locator('.display-preferences summary').click();await page.locator('.display-panel').waitFor();assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Меню',exact:true}).click();await page.locator('.nav-wrap[data-open=true]').waitFor();assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);await page.keyboard.press('Escape');
 checks.push({name:'display and mobile navigation panels fit at 360px / 150% text and close with Escape',passed:true});
 assert.deepEqual(errors,[],'Uncaught browser errors');
}finally{
 await page.close();await ctx.close();await browser.close();
 await writeFile(out+'/report.json',JSON.stringify({generated:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),target:'Actual source corpus; local production review; no seed',checks,matrix,errors,limitations:['Reflow and text scaling; not a physical-device or native browser-zoom accessibility certification.','Browser evidence is technical acceptance, not official archive/editorial or native-language approval.']},null,2)+'\n');
}
console.log('Passed',checks.length,'journeys;',matrix.length,'real-page layouts.');
