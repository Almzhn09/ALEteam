// Reference redesign: real local corpus, no source or API fixtures.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base=process.env.BASE_URL??'http://localhost:3122',out=process.env.OUT??'.local/reference-design-proof';assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const checks=[],colors=[],errors=[];async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS',name);}
const ctx=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,reducedMotion:'reduce'});await ctx.addCookies([{name:'lang',value:'ru',url:base},{name:'display-theme',value:'light',url:base}]);const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
function luminance(color){const values=color.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
try{
 await check('current CMS contacts, source-based leadership, source-linked sections and no invented reference categories',async()=>{
  await page.goto(base);await page.evaluate(()=>document.fonts.ready);await page.locator('#recommendations-title').waitFor();
  const source=await(await fetch(base+'/api/content/archive-contacts')).json();const p=source.item.payload,text=await page.locator('.contact-section').innerText();for(const field of ['address','phone','email','hours'])assert.ok(p[field]&&text.includes(p[field]),field);
  for(const row of await page.locator('.contact-leadership dd').all()){const name=(await row.innerText()).split('\n')[0];assert.ok(p.body.includes(name),name);}
  assert.ok(!/Гостевая книга|Метрические книги|Погода|Личные фонды/u.test(await page.locator('main').innerText()));
  assert.ok(!/1424/u.test(await page.locator('.compliance-band').innerText()));
  for(const link of await page.locator('.site-sections a[target=_blank]').all()){assert.match(await link.getAttribute('rel'),/noopener/u);assert.ok((await link.innerText()).includes('На официальном сайте'));}
  assert.equal(await page.locator('main h1').count(),1);await page.screenshot({path:out+'/home-desktop-light.png',fullPage:true});
 });
 await check('manual slides support next/previous, keyboard, touch scrolling and remain still without user input',async()=>{
  assert.equal(await page.locator('.hero-slide').count(),2);
  const position=()=>page.locator('.hero-slides').evaluate(n=>Math.round(n.scrollLeft/n.clientWidth));
  assert.equal(await position(),0);await page.getByRole('link',{name:'Следующий слайд',exact:true}).click();assert.equal(await position(),1);
  await page.locator('.hero-slides').focus();await page.keyboard.press('ArrowLeft');assert.equal(await position(),0);
  const touchContext=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844},reducedMotion:'reduce'});const mobile=await touchContext.newPage();await mobile.goto(base);await mobile.evaluate(()=>document.fonts.ready);const target=mobile.locator('.hero-slides');await target.scrollIntoViewIfNeeded();const rect=await target.boundingBox(),cdp=await touchContext.newCDPSession(mobile),x=rect.x+rect.width*.8,y=rect.y+rect.height*.4;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let n=1;n<=15;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-n*(rect.width*.7/15),y,id:1}]});await mobile.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mobile.waitForFunction(()=>{const n=document.querySelector('.hero-slides');return Math.round(n.scrollLeft/n.clientWidth)===1;});await cdp.detach();await touchContext.close();
  await page.getByRole('link',{name:'Следующий слайд',exact:true}).click();assert.equal(await position(),1);
  await page.waitForTimeout(1600);assert.equal(await position(),1,'No auto-advance');
  await page.getByRole('link',{name:'Предыдущий слайд',exact:true}).click();assert.equal(await position(),0);
 });
 await check('every displayed photograph is an original published CMS attachment with immediate-access headers',async()=>{
  const manifest=JSON.parse(await readFile('sources/archive-visual-20261111/manifest.json'));
  for(const img of await page.locator('.archive-photo img').all()){
   await img.evaluate(n=>n.decode());const src=await img.getAttribute('src');assert.match(src,/^\/api\/material-files\/[a-zA-Z0-9_-]+$/u);const response=await fetch(base+src);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private/u);assert.match(response.headers.get('cache-control'),/no-store/u);
   const sha=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');assert.ok(manifest.images.some(i=>i.sha256===sha&&i.decoderValidation.status==='complete_decode'&&i.publicationParentSourceKey));
  }
  assert.equal(await page.locator('.contact-photo img').count(),1);
 });
 await check('navigation groups, search disclosure and display shortcut work with keyboard and restore focus',async()=>{
  const summary=page.locator('.nav-group > summary').filter({hasText:'Об архиве'});await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.nav-group[open]').count(),1);await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Об архиве');await page.keyboard.press('Escape');assert.equal(await page.locator('.nav-group[open]').count(),0);assert.ok(await summary.evaluate(n=>n===document.activeElement));
  const search=page.locator('.site-search>summary');await search.focus();await page.keyboard.press('Enter');await page.locator('.header-search input').fill('1940');await page.keyboard.press('Escape');assert.equal(await page.locator('.site-search[open]').count(),0);assert.ok(await search.evaluate(n=>n===document.activeElement));
  await page.locator('.site-sections').getByRole('link',{name:'Вид сайта'}).click();assert.equal(await page.locator('.display-preferences[open]').count(),1);await page.keyboard.press('Escape');
 });
 await check('reading colors meet AA, local serif contains Kazakh glyphs and no font CDN is requested',async()=>{
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const tokens=await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);return Object.fromEntries(['bg','surface','surface-2','text','muted','accent','on-accent','border-strong'].map(k=>[k,style.getPropertyValue('--'+k).trim()]));});
   for(const [foreground,background,min]of [['text','bg',4.5],['muted','bg',4.5],['muted','surface',4.5],['muted','surface-2',4.5],['accent','bg',4.5],['on-accent','accent',4.5],['border-strong','bg',3]]){const ratio=contrast(tokens[foreground],tokens[background]);colors.push({theme,foreground,background,ratio:Math.round(ratio*100)/100,minimum:min});assert.ok(ratio>=min,JSON.stringify(colors.at(-1)));}
  }
  await page.evaluate(()=>document.fonts.ready);assert.match(await page.locator('h1').evaluate(n=>getComputedStyle(n).fontFamily),/Noto Serif/u);
  for(const style of ['normal','italic']){
   const covered=new Set();for(const subset of ['latin','cyrillic','cyrillic-ext']){
    const filename='public/fonts/noto-serif-'+subset+'-wght-'+style+'.woff2';const charset=execFileSync('fc-scan',['--format','%{charset}\n',filename],{encoding:'utf8'}).split('\n')[0];for(const range of charset.split(' ')){const [start,end=start]=range.split('-').map(n=>parseInt(n,16));for(let cp=start;cp<=end;cp++)covered.add(cp);}
   }
   for(const character of 'ӘҒҚҢӨҰҮҺІәғқңөұүһі')assert.ok(covered.has(character.codePointAt(0)),style+character);
  }
  assert.deepEqual(await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/u.test(r.name)).map(r=>r.name)),[]);
  await page.screenshot({path:out+'/home-desktop-dark.png',fullPage:true});
 });
 await check('mobile header uses two layout rows and its dialogs/disclosures fit at 360px with 150% text',async()=>{
  await page.setViewportSize({width:360,height:1000});await page.evaluate(()=>{document.documentElement.dataset.textSize='150';document.documentElement.dataset.theme='light';});
  assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);await page.screenshot({path:out+'/home-mobile150.png',fullPage:true});
  assert.equal(await page.locator('.header-inner').evaluate(n=>getComputedStyle(n).gridTemplateRows.split(' ').length),2);
  await page.getByRole('button',{name:'Меню',exact:true}).click();await page.locator('.nav-wrap[data-open=true]').waitFor();await page.locator('.nav-group > summary').filter({hasText:'Фонды'}).click();await page.screenshot({path:out+'/mobile-menu.png',fullPage:true});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.locator('.display-preferences>summary').click();const rect=await page.locator('.display-panel').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=360);await page.keyboard.press('Escape');
 });
 await check('without JavaScript the first cover and every slide remain reachable through real anchors',async()=>{
  const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:1440,height:1000}});const p=await nojs.newPage();await p.goto(base);assert.equal(await p.locator('.hero-slide').count(),2);assert.equal(await p.locator('.hero-slide img').first().getAttribute('src')===null,false);await p.getByRole('link',{name:'Слайд 2',exact:true}).click();assert.ok(p.url().endsWith('#hero-slide-1'));await p.screenshot({path:out+'/home-no-js.png',fullPage:true});await nojs.close();
 });
 await check('print omits abstract ornament and interactive navigation while retaining source content',async()=>{
  await page.emulateMedia({media:'print'});for(const element of await page.locator('.archive-mountains,.archive-ornament,.hero-slide-controls,.site-header').all())assert.equal(await element.isVisible(),false);assert.equal(await page.locator('.contact-section').isVisible(),true);await page.emulateMedia({media:'screen'});
 });
 assert.deepEqual(errors,[]);
}finally{await ctx.close();await browser.close();await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks,colors,errors,target:'Local production server; supplied real CMS corpus; no seed or mocked sources'},null,2)+'\n');}
