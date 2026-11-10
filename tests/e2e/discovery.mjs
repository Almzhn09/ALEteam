// Cross-feature browser acceptance with real APIs, independently reviewed synthetic fixtures only.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
const database=process.env.TEST_DATABASE_URL;if(!database||!new URL(database).pathname.endsWith('_test'))throw Error('Dedicated test DB required');
const base=process.env.BASE_URL,out='.local/team-ui/discovery';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const checks=[],errors=[],run=Date.now().toString(36),password=randomBytes(32).toString('hex');
const author=await browser.newContext(),reviewer=await browser.newContext(),visitor=await browser.newContext({viewport:{width:1440,height:1000}}),page=await visitor.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
let video,cdp,frameHandler;
async function stopVideo(){if(!video)return;await cdp.send('Page.stopScreencast');cdp.off('Page.screencastFrame',frameHandler);const closed=once(video,'close');video.stdin.end();const [code]=await closed;video=null;assert.equal(code,0);}
if(process.env.FFMPEG_PATH){
 video=spawn(process.env.FFMPEG_PATH,['-y','-loglevel','error','-use_wallclock_as_timestamps','1','-f','image2pipe','-vcodec','mjpeg','-i','pipe:0','-vf','fps=15','-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',out+'/walkthrough.mp4'],{stdio:['pipe','ignore','ignore']});
 cdp=await visitor.newCDPSession(page);frameHandler=({data,sessionId})=>video?.stdin.write(Buffer.from(data,'base64'),()=>void cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{}));cdp.on('Page.screencastFrame',frameHandler);await cdp.send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:1440,maxHeight:1000,everyNthFrame:2});
}
async function check(name,work){await work();checks.push({name,passed:true});console.log('PASS '+name);}
async function api(context,route,method='GET',body){const r=await context.request.fetch(base+'/api'+route,{method,headers:{Origin:base},...(body!==undefined?{data:body}:{})});assert.ok(r.ok(),method+' '+route+': '+r.status()+' '+(r.ok()?'':await r.text()));return r.json();}
async function publish(revision){for(const status of ['IN_REVIEW','APPROVED','PUBLISHED'])revision=(await api(status==='IN_REVIEW'?author:reviewer,'/admin/revisions/'+revision.id+'/transition','POST',{status,expectedUpdatedAt:revision.updatedAt,reason:'Synthetic browser integration acceptance, not editorial approval of real archive sources.'})).item;return revision;}
async function fact(kind,data,parentId=null){let row=(await api(author,'/admin/discovery/facts','POST',{kind,data,parentId,sources:[source]})).item;return(await api(reviewer,'/admin/discovery/facts/'+row.id+'/verify','POST',{expectedUpdatedAt:row.updatedAt})).item;}
let source,place,topic,documentId;
try{
 await api(author,'/auth/sign-in/email','POST',{email:process.env.STAFF_ADMIN_EMAIL,password:process.env.STAFF_ADMIN_PASSWORD});
 const users=[];for(const who of ['reviewer','reader']){const user=(await api(author,'/admin/users','POST',{email:`discovery-ui-${who}-${run}@example.test`,name:'ДЕМО '+who,password})).item;users.push(user);}
 await api(author,'/admin/assignments','POST',{userId:users[0].id,roleId:'EDITOR'});await api(reviewer,'/auth/sign-in/email','POST',{email:users[0].email,password});
 let content=(await api(author,'/admin/content','POST',{slug:'ui-discovery-source-'+run,kind:'PAGE',isDemo:true,locale:'ru',payload:{title:'ДЕМО источник новых функций',body:'Вымышленная история места для проверки интерфейса. Не историческое свидетельство.',rights:'ALEteam CC0-1.0',sourceNote:'Synthetic browser fixture'}})).item;await publish(content.revisions[0]);
 source=(await api(author,'/discovery/materials/cms/'+content.id)).source;
 place=await fact('PLACE',{labels:{ru:{title:'ДЕМО Новыйгород',body:'Синтетическая хронология для проверки. Координаты не задаются.'}},coordinates:null});
 await fact('ALIAS',{name:'ДЕМО Старыйгород',locale:'ru'},place.id);
 topic=await fact('TOPIC',{labels:{ru:{title:'ДЕМО Городская история'}}});
 async function document(title){const created=await api(author,'/admin/catalog/documents','POST',{fundId:'demo-fund-1',title,description:'Вымышленная учебная запись для сквозной проверки.',reference:'DEMO-UI-'+run+'-'+randomBytes(3).toString('hex'),year:1791,type:'PHOTO',locality:'ДЕМО Старыйгород',rights:'ALEteam CC0-1.0',sourceNote:'Synthetic test, not real historical material'});await publish(created.revision);return created.item;}
 const marker='ДЕМО городской альбом '+run;const initial=await document(marker+' исходный материал');documentId=initial.id;
 await fact('EDITORIAL',{material:{kind:'document',id:initial.id},topicId:topic.id,placeId:place.id,order:0});
 await fact('HISTORY',{labels:{ru:{title:'ДЕМО событие с точностью до месяца',body:'Месяц известен, день не указан в синтетическом источнике.'}},date:{datePrecision:'month',dateParts:{year:1791,month:5}},materials:[{kind:'document',id:initial.id}],certainty:'source_assertion'},place.id);
 await fact('LINK',{from:{kind:'document',id:'demo-doc-01'},to:{kind:'document',id:initial.id},reason:'same_place'});
 await check('anonymous topic choices persist and opt-out restores editorial mode',async()=>{
  await page.goto(base);await page.locator('summary',{hasText:'Настроить рекомендации'}).click();await page.getByLabel('Учитывать выбранные темы',{exact:true}).check();await page.getByLabel('ДЕМО Городская история',{exact:true}).check();await page.locator('#recommendations-title').locator('..').locator('..').getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByText('Настройки сохранены.',{exact:true}).waitFor();
  assert.equal((await api(visitor,'/discovery/home?topicIds='+topic.id)).recommended.mode,'interests');await page.reload();await page.getByRole('link',{name:initial.title,exact:true}).first().waitFor();
  await page.locator('summary',{hasText:'Настроить рекомендации'}).click();assert.equal(await page.getByLabel('Учитывать выбранные темы',{exact:true}).isChecked(),true);await page.getByLabel('Учитывать выбранные темы',{exact:true}).uncheck();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByText('Настройки сохранены.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('archive-interests-v1')).enabled),false);
 });
 await check('browser reading history is opt-in, bounded and removed on disable',async()=>{
  assert.equal(await page.evaluate(()=>localStorage.getItem('archive-continue-v1')),null);await page.getByLabel('Сохранять последние три документа в этом браузере').check();
  await page.goto(base+'/documents/demo-doc-01');await page.getByRole('heading',{level:1}).waitFor();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('archive-continue-v1')??'[]').length===1);await page.goto(base);await page.getByRole('heading',{name:'Продолжить чтение',exact:true}).waitFor();await page.locator('summary',{hasText:'Настроить рекомендации'}).click();await page.getByLabel('Сохранять последние три документа в этом браузере').uncheck();assert.equal(await page.evaluate(()=>localStorage.getItem('archive-continue-v1')),null);
 });
 await check('historical-name search preserves period/type filters and allows literal mode',async()=>{
  const query=new URLSearchParams({locality:'ДЕМО Новыйгород',yearFrom:'1790',yearTo:'1792',type:'PHOTO',nameMode:'expanded'});await page.goto(base+'/catalog?'+query);await page.getByText(/Учтены названия:/).waitFor();await page.locator(`main a[href="/documents/${initial.id}"]`).waitFor();await page.getByLabel('Учитывать исторические названия мест').click();await page.getByRole('heading',{name:'Ничего не найдено'}).waitFor();assert.equal(new URL(page.url()).searchParams.get('yearFrom'),'1790');
 });
 await check('explanation uses actual OCR quotes and related links have source-backed reasons',async()=>{
  await page.goto(base+'/documents/demo-doc-01');await page.getByRole('button',{name:'Показать выдержки и термины'}).click();await page.locator('#document-explanation blockquote').first().waitFor();assert.ok(await page.locator('#document-explanation a[href^="/api/files/demo-scan-1"]').count());await page.getByRole('region',{name:'Связанные материалы',exact:true}).getByRole('link',{name:initial.title,exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/document-explanation-1440.png',fullPage:true});
 });
 await check('chronology works without coordinates and never invents a day',async()=>{
  await page.goto(base+'/places?placeId='+place.id);await page.getByRole('heading',{name:'ДЕМО событие с точностью до месяца'}).waitFor();assert.ok(await page.locator('.history-timeline').getByText('05.1791',{exact:true}).count());assert.ok(!(await page.locator('.history-timeline').innerText()).includes('01.05.1791'));await page.getByLabel('Год от',{exact:true}).fill('1800');await page.getByRole('button',{name:'Показать',exact:true}).click();await page.getByText('Для выбранного периода опубликованных событий нет.',{exact:true}).waitFor();
 });
 await check('subscription survives login return, delivers only new matches and can be removed',async()=>{
  await page.goto(base+'/catalog?q='+marker);await page.getByRole('link',{name:'Войти и следить за темой'}).click();await page.locator('input[type=email]').fill(users[1].email);await page.locator('input[type=password]').fill(password);await page.locator('main form button[type=submit]').click();await page.waitForURL(u=>u.pathname==='/catalog');await page.getByRole('button',{name:'Следить за темой',exact:true}).click();await page.getByRole('button',{name:'Вы следите за темой',exact:true}).waitFor();
  await page.getByRole('link',{name:'Мои подписки',exact:true}).click();await page.getByText('Новых опубликованных совпадений пока нет.',{exact:true}).waitFor();
  const next=await document(marker+' новый материал');execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env:process.env,stdio:'pipe'});await page.reload();await page.locator('#topic-subscriptions').getByRole('link',{name:next.title,exact:true}).waitFor();execFileSync(process.execPath,['--import','tsx','scripts/deliver-topic-notices.ts'],{env:process.env,stdio:'pipe'});await page.reload();await page.locator('#topic-subscriptions').getByRole('link',{name:next.title,exact:true}).waitFor();assert.equal(await page.locator('#topic-subscriptions').getByRole('link',{name:next.title,exact:true}).count(),1);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/subscriptions-1440.png',fullPage:true});await page.locator('#topic-subscriptions').getByRole('button',{name:'Отписаться',exact:true}).click();await page.getByText('Подписок пока нет. Выберите тему в каталоге или истории места.',{exact:true}).waitFor();
 });
 await check('research assistant displays server-generated steps and a typed catalog action',async()=>{
  await page.goto(base+'/assistant');await page.getByLabel('Ваш вопрос',{exact:true}).fill('Хочу исследовать школы Риддера после 1940');await page.getByRole('button',{name:'Спросить',exact:true}).click();await page.locator('.research-steps').waitFor();const link=await page.locator('.research-steps a').first().getAttribute('href');assert.equal(new URL(link,base).pathname,'/catalog');assert.equal(new URL(link,base).searchParams.get('yearFrom'),'1941');
 });
 await check('opening a source keeps the chosen UI language and identifies the original content language',async()=>{
  await visitor.addCookies([{name:'lang',value:'kk',url:base}]);await page.goto(base+'/places?placeId='+place.id);await page.locator('.history-timeline >li >details >summary').first().click();await page.locator('.history-timeline >li >details a[href^="/materials/"]').first().click();await page.getByRole('heading',{name:'ДЕМО источник новых функций',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'kk');assert.equal(await page.locator('article').getAttribute('lang'),'ru');
 });
 await stopVideo();
 await check('new screens reflow in both themes, three languages and 150% text',async()=>{
  const axe=await(await import('node:fs/promises')).readFile('node_modules/axe-core/axe.min.js','utf8');
  for(const [lang,theme,width,size]of [['ru','light',1440,'100'],['kk','dark',360,'150'],['en','light',768,'150']]){
   await visitor.addCookies([{name:'lang',value:lang,url:base},{name:'display-theme',value:theme,url:base},{name:'display-text-size',value:size,url:base}]);await page.setViewportSize({width,height:1000});
   for(const [name,path]of [['home','/'],['places','/places?placeId='+place.id],['document','/documents/demo-doc-01'],['subscriptions','/me']]){await page.goto(base+path);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+'/'+lang);await page.addScriptTag({content:axe});const violations=await page.evaluate(async()=>(await window.axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']})).violations.map(v=>v.id));assert.deepEqual(violations,[],name+'/'+lang);await page.screenshot({path:`${out}/${name}-${width}-${theme}-${size}-${lang}.png`,fullPage:true});}
  }
 });
 assert.deepEqual(errors,[]);
}catch(e){process.exitCode=1;checks.push({name:'cross-feature acceptance',passed:false,error:e.message});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});console.log(e.stack);}
finally{await stopVideo().catch(()=>{});await browser.close();await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),checks,pageErrors:errors,syntheticFixturesOnly:true,independentAccounts:true,video:process.env.FFMPEG_PATH?'Actual Chromium CDP screencast of automated interactions; no audio.':null,limitations:['Automated acceptance does not establish historical truth or native translation quality.','Public HTTPS and manual assistive-technology review are separate.']},null,2)+'\n');}
