import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BETTER_AUTH_URL;
if(!base || new URL(base).hostname!=='localhost')throw new Error('This check requires a local stand.');
if(!process.env.DEMO_AUTHOR_PASSWORD)throw new Error('Load the private stand environment file.');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 await page.goto(base+'/login?returnTo=%2Fassistant');
 await page.getByLabel('Email',{exact:true}).fill('author@example.test');
 await page.getByLabel('Пароль',{exact:true}).fill(process.env.DEMO_AUTHOR_PASSWORD);
 await page.locator('main form button[type=submit]').click();await page.waitForURL('**/assistant');
 await page.getByLabel('Ваш вопрос',{exact:true}).fill('Кітапхана туралы мәлімет керек');
 await page.getByLabel('Ваш вопрос',{exact:true}).press('Enter');
 await page.locator('[data-assistant-mode="local-model"]').waitFor();
 await page.locator('.sources a[href="/documents/demo-doc-01"]').waitFor();
 const count=await page.locator('[data-assistant-mode]').count();assert.equal(count,1);
 await page.screenshot({path:'training/local-model-ui.png',fullPage:true});
 await writeFile('training/runtime-proof.json',JSON.stringify({testedAt:new Date().toISOString(),target:base,mode:'local-model',authenticated:true,documentSource:'demo-doc-01',browserCheckPassed:true},null,2)+'\n');
 console.log('PASS actual local-model badge and grounded document link in authenticated browser');
} catch(error){console.log(`FAIL local model browser check (${error.name})`);process.exitCode=1;} finally{await browser.close();}
