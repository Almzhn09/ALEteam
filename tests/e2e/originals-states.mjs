// R-F02/R-F05: read-only real-corpus acceptance, with intentional transport failures.
// No account, fixture writes, publication or database reset.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const base=process.env.BASE_URL??'http://localhost:3123';
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u);
const out=process.env.OUT??'.local/alinur-originals';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:360,height:900},reducedMotion:'reduce'});
await context.addCookies([{name:'lang',value:'ru',url:base},{name:'display-text-size',value:'150',url:base}]);
await context.addInitScript(()=>{const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.previewUrls={created:[],revoked:[]};URL.createObjectURL=blob=>{const url=create(blob);window.previewUrls.created.push(url);return url;};URL.revokeObjectURL=url=>{window.previewUrls.revoked.push(url);revoke(url);};});
const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS',name);}
const route='/materials/archive-branch-decree-142';
const filesPattern='**/api/discovery/materials/cms/*/attachments?*';
try{
 await check('PDF failure exposes retry and direct source link; retry loads actual bytes, closing restores focus',async()=>{
  await page.goto(base+route);await page.evaluate(()=>document.documentElement.dataset.textSize='150');
  const response=await page.request.get(base+'/api/content/archive-branch-decree-142');assert.equal(response.status(),200);
  const button=page.getByRole('button',{name:/^Просмотреть PDF/}).first();
  await button.waitFor();
  // The URL is from the published real attachment list, not a mock catalogue entry.
  const listResponse=await page.request.get(base+'/api/discovery/materials/cms/'+(await response.json()).item.id+'/attachments?locale=ru');
  const pdf=(await listResponse.json()).items.find(f=>f.mimeType==='application/pdf'&&f.variant==='master');assert.ok(pdf);
  await page.route(base+pdf.href,r=>r.fulfill({status:503,body:'Temporarily unavailable'}));
  await button.click();const viewer=page.locator('.pdf-frame');await viewer.getByRole('alert').waitFor();
  assert.equal(await viewer.getByRole('link',{name:/Открыть в новой вкладке/}).getAttribute('href'),pdf.href);
  assert.equal(await viewer.locator('iframe').count(),0);
  await page.unroute(base+pdf.href);await viewer.getByRole('button',{name:'Повторить',exact:true}).click();
  await viewer.locator('iframe').waitFor();assert.match(await viewer.locator('iframe').getAttribute('src'),/^blob:/u);
  await page.locator('#material-originals').screenshot({path:out+'/pdf-mobile-150.png'});
  await viewer.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();
  assert.ok(await button.evaluate(n=>n===document.activeElement));const urls=await page.evaluate(()=>window.previewUrls);assert.deepEqual(urls.created,urls.revoked,'Closing must revoke every preview URL');assert.equal(await page.locator('.pdf-frame').count(),0);
  // A previously viewed file must still consult the server; no reuse after a rights change.
  await page.route(base+pdf.href,r=>r.fulfill({status:404,body:'Unavailable'}));
  await button.click();await page.locator('.pdf-frame').getByRole('alert').waitFor();assert.equal(await page.locator('.pdf-frame iframe').count(),0);await page.unroute(base+pdf.href);
 });
 await check('successful HTML response cannot be displayed as a PDF',async()=>{
  await page.goto(base+route);const pdfResponse=await page.request.get(base+'/api/search?scope=cms&q=142');assert.equal(pdfResponse.status(),200);
  await page.route('**/api/material-files/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>Sign in</h1>'}));
  await page.getByRole('button',{name:/^Просмотреть PDF/}).first().click();await page.locator('.pdf-frame').getByRole('alert').waitFor();assert.equal(await page.locator('.pdf-frame iframe').count(),0);await page.unroute('**/api/material-files/*');
 });
 await check('empty recognised text explains the absence and retains original access',async()=>{
  await page.goto(base+route);await page.route('**/api/material-files/*/text**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({item:{text:'',isOcr:true,fragments:[]}})}));
  await page.getByText('Читать текст оригинала',{exact:true}).first().click();await page.getByText('Текст не распознан. Просмотрите оригинал документа.',{exact:true}).waitFor();assert.ok(await page.getByRole('link',{name:'Скачать оригинал',exact:true}).first().isVisible());await page.unroute('**/api/material-files/*/text**');
 });
 await check('material without initial files still exposes a failed availability check and permits retry',async()=>{
  const list=await (await page.request.get(base+'/api/search?scope=cms&pageSize=100')).json();let empty;
  for(const row of list.items){const m=row.material;if(!m)continue;const response=await page.request.get(base+'/api/discovery/materials/cms/'+m.id+'/attachments?locale='+m.contentLocale);if((await response.json()).items?.length===0){empty=m;break;}}
  assert.ok(empty,'A real material without attachments is required');
  await page.route(filesPattern,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'Temporary test failure'}})}));
  await page.goto(base+empty.href.replace('/api/content/','/materials/').replace('?locale=','?contentLang='));
  await page.locator('#material-originals').getByRole('alert').filter({hasText:/\S/}).waitFor();
  await page.unroute(filesPattern);await page.locator('#material-originals').getByRole('button',{name:'Повторить',exact:true}).click();await page.locator('#material-originals').waitFor({state:'detached'});
  await page.goto(base+route);await page.getByRole('button',{name:/^Просмотреть PDF/}).first().waitFor();
 });
 await check('reading and error controls fit both themes at 360px/150%; axe reports no violations',async()=>{
  await page.addScriptTag({content:await readFile('node_modules/axe-core/axe.min.js','utf8')});
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.textSize='150';},theme);
   await page.getByRole('button',{name:/^Просмотреть PDF/}).first().click();await page.locator('.pdf-frame iframe').waitFor();
   assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
   const violations=await page.evaluate(async()=> (await axe.run(document.querySelector('#material-originals'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations);assert.deepEqual(violations,[]);
   await page.locator('#material-originals').screenshot({path:out+'/originals-'+theme+'.png'});await page.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();
  }
 });
 assert.deepEqual(errors,[]);
}finally{await context.close();await browser.close();await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,errors,scope:'Real published sources, read-only; fault injection for unavailable transport and empty OCR only'},null,2)+'\n');}
