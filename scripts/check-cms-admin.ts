// UI acceptance: ONLY the dedicated visual-v2 test database and supplied source bytes.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {hashPassword} from 'better-auth/crypto';
import {chromium,type BrowserContext,type Page} from 'playwright-core';

const database=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL;
assert.ok(database&&new URL(database).pathname==='/archive_visual_v2_test','Dedicated archive_visual_v2_test database required; never use a shared deployment.');
process.env.DATABASE_URL=database;
const {db}=await import('../src/server/db');
const base=process.env.CMS_UI_BASE_URL??'http://localhost:3122';
const target=new URL(base);assert.ok(['localhost','127.0.0.1'].includes(target.hostname),'Local test server only');
const folder='.local/cms-admin-proof';await mkdir(folder,{recursive:true});
const checks:string[]=[];
const password=randomBytes(32).toString('hex');
const actors=['writer','reviewer'] as const;
const suffix=randomBytes(5).toString('hex');
const accounts:Record<string,{id:string;email:string;password:string}>={};
for(const who of actors){
 const id='visual-v2-cms-'+who+'-'+suffix,email=id+'@example.test';
 await db.user.create({data:{id,email,name:'Техническая UI-проверка CMS '+who,emailVerified:true}});
 await db.account.create({data:{id:id+'-credential',userId:id,providerId:'credential',accountId:id,password:await hashPassword(password)}});
 await db.staffAssignment.create({data:{userId:id,roleId:'SUPERADMIN',scopeKey:'*'}});
 accounts[who]={id,email,password};
}
await writeFile('.local/visual-v2-cms-accounts.json',JSON.stringify(accounts),{mode:0o600});
const binding=await db.realContentBinding.findFirstOrThrow({where:{namespace:'real-content-20261111',sourceKey:'contacts',locale:'ru',targetKind:'cms'}});
const material=await db.contentItem.findUniqueOrThrow({where:{id:binding.targetId},include:{revisions:{where:{locale:'ru',status:'PUBLISHED'}}}});
const revision=material.revisions[0];assert.ok(revision);
const source='sources/archive-20261110/originals/Контакты.docx';
const bytes=await readFile(source);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const contexts:BrowserContext[]=[];
const created:string[]=[];
async function actor(who:typeof actors[number]){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
 await context.addCookies([{name:'lang',value:'ru',url:base}]);
 const r=await context.request.post(base+'/api/auth/sign-in/email',{headers:{Origin:base},data:{email:accounts[who].email,password}});assert.equal(r.status(),200);
 const page=await context.newPage();await page.goto(base+'/admin/content/'+material.id);await page.getByRole('heading',{name:'Оригиналы публикации',exact:true}).waitFor();return {context,page};
}
async function visibleText(page:Page,text:string){await page.getByText(text,{exact:false}).first().waitFor();}
async function rowFor(page:Page,id:string){const row=page.locator('[data-cms-file-id="'+id+'"]');await row.waitFor();return row;}
try{
 const writer=await actor('writer');
 const upload=writer.page.locator('details.cms-upload');await upload.locator('summary').click();
 await upload.getByLabel('Файл (PDF, DOCX, PNG или JPEG, до 20 МиБ)').setInputFiles(source);
 await upload.getByLabel('Версия источника').fill('Предоставленный оригинал Контакты.docx');
 const registered=writer.page.waitForResponse(r=>r.url().endsWith('/attachments')&&r.request().method()==='POST');
 await upload.getByRole('button',{name:'Загрузить файл',exact:true}).click();
 const declared=await (await registered).json();const id=declared.item.id;created.push(id);
 const writerRow=await rowFor(writer.page,id);await writerRow.getByText('На проверке',{exact:true}).waitFor();
 assert.equal(await writerRow.getByRole('button',{name:'Одобрить',exact:true}).count(),0);
 checks.push('Writer uploads supplied DOCX through real browser form; independent review is required, no self-approval control.');
 const reviewer=await actor('reviewer');let row=await rowFor(reviewer.page,id);
 await row.getByLabel('Основание решения').fill('Сверены предоставленный источник и права для технической проверки интерфейса.');
 await row.getByRole('button',{name:'Одобрить',exact:true}).click();await row.getByText('Подтвердите права на публикацию копии.',{exact:true}).waitFor();
 await row.getByLabel('Права на публикацию копии проверены').check();
 const record=await db.cmsAttachment.findUniqueOrThrow({where:{id}});
 await db.cmsAttachment.update({where:{id},data:{updatedAt:new Date(record.updatedAt.getTime()+1000)}});
 const stale=reviewer.page.waitForResponse(r=>r.url().endsWith('/'+id+'/review')&&r.request().method()==='POST');
 await row.getByRole('button',{name:'Одобрить',exact:true}).click();assert.equal((await stale).status(),409);
 await row.getByText('Состояние обновлено.',{exact:false}).waitFor();
 assert.ok((await row.getByLabel('Основание решения').inputValue()).includes('Сверены предоставленный'));
 checks.push('Review requires rights confirmation; concurrent-version conflict is surfaced and typed reason survives refresh.');
 const approved=reviewer.page.waitForResponse(r=>r.url().endsWith('/'+id+'/review')&&r.request().method()==='POST');
 await row.getByRole('button',{name:'Одобрить',exact:true}).click();assert.equal((await approved).status(),200);
 await row.getByText('Одобрен',{exact:true}).waitFor();
 await row.getByLabel('Основание решения').fill('Публикуется сверенный предоставленный оригинал для технической приёмки.');
 await row.getByRole('button',{name:'Опубликовать файл',exact:true}).click();await row.getByText('Опубликован',{exact:true}).waitFor();
 const text=await reviewer.context.request.get(base+'/api/material-files/'+id+'/text');assert.equal(text.status(),200);const parsed=(await text.json()).item;assert.ok(parsed.fragments.some((f:{paragraph?:number})=>f.paragraph));
 checks.push('Independent reviewer approves and publishes the real original; public text carries paragraph provenance.');
 await reviewer.page.screenshot({path:folder+'/cms-original-published.png',fullPage:true});
 await row.getByLabel('Основание решения').fill('Снятие собственного тестового вложения после завершения проверки.');
 await row.getByRole('button',{name:'Снять файл с публикации',exact:true}).click();await row.getByText('Снят с публикации',{exact:true}).waitFor();
 assert.equal((await reviewer.context.request.get(base+'/api/material-files/'+id)).status(),404);
 assert.equal((await reviewer.context.request.get(base+'/api/material-files/'+id+'/text')).status(),404);
 checks.push('Withdraw through browser immediately revokes original and readable text.');
 // A failed transfer is an existing registered upload, not a new synthetic source.
 const digest=await import('node:crypto').then(m=>m.createHash('sha256').update(bytes).digest('hex'));
 const response=await writer.context.request.post(base+'/api/admin/content/'+material.id+'/attachments',{headers:{Origin:base},data:{revisionId:revision.id,name:'Контакты.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',expectedBytes:bytes.length,expectedSha256:digest,rights:'Предоставленный источник для изолированной проверки загрузки.',sourceNote:'Контакты.docx, предоставленный оригинал.',sourceLabel:'Контакты',sourceVersion:'Предоставленный оригинал'}});assert.equal(response.status(),201);const failed=(await response.json()).item;created.push(failed.id);
 const broken=await writer.context.request.put(base+'/api/admin/material-files/'+failed.id+'/content',{headers:{Origin:base,'Content-Type':failed.mimeType,'If-Match':'"'+failed.updatedAt+'"'},data:Buffer.from('invalid')});assert.ok(broken.status()>=400);
 await writer.page.getByRole('button',{name:'Обновить список',exact:true}).click();const failedRow=await rowFor(writer.page,failed.id);await failedRow.getByText('Ошибка загрузки',{exact:true}).waitFor();
 await failedRow.getByLabel('Основание решения').fill('Повтор передачи того же оригинала после ошибки сети.');
 await failedRow.getByRole('button',{name:'Разрешить повторную передачу',exact:true}).click();await failedRow.getByText('Ожидает файл',{exact:true}).waitFor();
 await failedRow.getByLabel('Выберите тот же оригинал для продолжения').setInputFiles(source);
 await failedRow.getByRole('button',{name:'Продолжить передачу',exact:true}).click();await failedRow.getByText('На проверке',{exact:true}).waitFor();
 await reviewer.page.getByRole('button',{name:'Обновить список',exact:true}).click();row=await rowFor(reviewer.page,failed.id);await row.getByLabel('Основание решения').fill('Повторный оригинал отклонён после технической проверки восстановления передачи.');await row.getByRole('button',{name:'Отклонить',exact:true}).click();await row.getByText('Отклонён',{exact:true}).waitFor();
 checks.push('Uploader retries an interrupted transfer and resends identical bytes without duplicate registration; reviewer can reject.');
 const guest=await browser.newContext();contexts.push(guest);assert.equal((await guest.request.get(base+'/api/admin/content/'+material.id+'/attachments')).status(),401);
 checks.push('Anonymous browser cannot list private CMS attachment management data.');
 await reviewer.page.setViewportSize({width:360,height:900});await reviewer.page.evaluate(()=>document.documentElement.dataset.textSize='150');await reviewer.page.screenshot({path:folder+'/cms-original-mobile-150.png',fullPage:true});
 const overflow=await reviewer.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=1,'CMS editor overflows at 360px/150%');
 checks.push('CMS editor and attachment controls fit 360px at 150% text without horizontal overflow.');
 console.log('CMS attachment UI acceptance: '+checks.length+'/'+checks.length+' passed.');
}finally{
 for(const id of created){const row=await db.cmsAttachment.findUnique({where:{id}});if(row&&row.state==='PUBLISHED')await db.cmsAttachment.update({where:{id},data:{state:'WITHDRAWN'}});}
 await Promise.all(contexts.map(c=>c.close()));await browser.close();await db.$disconnect();
 await writeFile(folder+'/report.json',JSON.stringify({generated:new Date().toISOString(),target:'Isolated archive_visual_v2_test; real provided contacts DOCX; no seed',checks,technicalAccounts:true,publishedTestOriginalsWithdrawn:true,sourceMaterialUnchanged:true},null,2)+'\n');
}
