import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base=process.env.BETTER_AUTH_URL;
if(!base||new URL(base).hostname!=='localhost'||!process.env.DEMO_AUTHOR_PASSWORD)throw new Error('Load private local stand environment.');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:960}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.name));
 await page.goto(base+'/login?returnTo=%2Fassistant');await page.getByLabel('Email',{exact:true}).fill('author@example.test');await page.getByLabel('Пароль',{exact:true}).fill(process.env.DEMO_AUTHOR_PASSWORD);await page.locator('form button[type=submit]').click();await page.waitForURL('**/assistant');
 const requests=[];page.on('request',r=>{if(r.url()===base+'/api/assistant'&&r.method()==='POST')requests.push(r.postDataJSON());});
 let count=0;
 async function ask(question,expected){await page.getByLabel('Ваш вопрос',{exact:true}).fill(question);await page.getByLabel('Ваш вопрос',{exact:true}).press('Enter');count++;await page.waitForFunction(n=>document.querySelectorAll('[data-assistant-mode="local-model"]').length===n,count);const text=await page.locator('.msg-assistant').last().innerText();assert.ok(text.includes(expected),text);}
 await ask('Привет','Привет');await ask('Расскажи про избранное','☆');await ask('А где его найти?','/favorites');await ask('А как это сделать?','☆');await ask('Спасибо','Пожалуйста');
 assert.ok(requests[2].history.some(t=>t.role==='user'&&t.content==='Расскажи про избранное'));assert.ok(requests.every(r=>r.history.length<=6));
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-assistant-mode="local-model"]').length===5);
 const panel=page.locator('.chat');await panel.screenshot({path:'training/site-dialog-ui.png',style:'.site-header{visibility:hidden!important}.chat-form{position:static!important}'});
 // A moderator signing into the same tab must not see the previous account's chat.
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.waitForURL(base+'/');
 await page.goto(base+'/login?returnTo=%2Fassistant');await page.getByLabel('Email',{exact:true}).fill('moderator@example.test');await page.getByLabel('Пароль',{exact:true}).fill(process.env.DEMO_MODERATOR_PASSWORD);await page.locator('form button[type=submit]').click();await page.waitForURL('**/assistant');
 await page.waitForFunction(()=>document.querySelectorAll('[data-assistant-mode]').length===0);
 assert.equal((await page.locator('.chat-log').innerText()).includes('Расскажи про избранное'),false);assert.deepEqual(errors,[]);
 await writeFile('training/dialog-runtime-proof.json',JSON.stringify({testedAt:new Date().toISOString(),turns:count,actualHistorySent:true,reloadPreserved:true,otherAccountIsolated:true,pageErrors:errors,passed:true},null,2)+'\n');console.log('PASS five-turn dialog, HTTP history, reload and account isolation');
}catch(e){console.log(`FAIL site dialog browser check (${e.name})`);process.exitCode=1;}finally{await browser.close();}
