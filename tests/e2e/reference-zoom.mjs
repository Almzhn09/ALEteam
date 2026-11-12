// Native 200% browser zoom across the same CSS widths as the reflow matrix.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const base=process.env.BASE_URL??'http://localhost:3122',out=process.env.OUT??'.local/reference-native-zoom';assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u);await mkdir(out,{recursive:true});
const routes=['/','/catalog?scope=cms','/catalog?scope=fund','/materials/archive-history-1?contentLang=ru','/places','/about','/calendar','/services','/about/compliance','/directories','/directories/funds','/directories/newspapers'],rows=[];
try{for(const width of [360,768,1440])for(const lang of ['ru','kk','en'])for(const theme of ['light','dark']){
 const profile=await mkdtemp('.local/reference-zoom-profile-'),ctx=await chromium.launchPersistentContext(profile,{executablePath:'/usr/bin/chromium',headless:true,viewport:null,reducedMotion:'reduce',args:['--no-sandbox',`--window-size=${width*2},1400`]});
 try{
  const settings=await ctx.newPage();await settings.goto('chrome://settings/appearance');await settings.evaluate(()=>new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(2,resolve)));assert.equal(await settings.evaluate(()=>new Promise(resolve=>chrome.settingsPrivate.getDefaultZoom(resolve))),2);await settings.close();
  await ctx.addCookies([{name:'lang',value:lang,url:base},{name:'display-theme',value:theme,url:base}]);const page=await ctx.newPage();
  for(const size of ['100','150']){await ctx.addCookies([{name:'display-text-size',value:size,url:base}]);for(const route of routes){
   await page.goto(base+route);await page.evaluate(()=>document.fonts.ready);if(route==='/')await page.locator('#recommendations-title').waitFor();if(route.startsWith('/catalog'))await page.locator('.search-card').first().waitFor();
   const geometry=await page.evaluate(()=>{const elements=[...document.querySelectorAll('.btn,summary,select,input:not([type=hidden])')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&!n.closest('details:not([open]) > :not(summary),dialog:not([open]),.visually-hidden');});const outside=elements.filter(n=>{const r=n.getBoundingClientRect();return r.left< -1||r.right>innerWidth+1;}).map(n=>n.textContent?.slice(0,35));const overlaps=[];for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++){const a=elements[i],b=elements[j];if(a.contains(b)||b.contains(a))continue;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)overlaps.push(a.tagName+'/'+b.tagName);}return{outerWidth,innerWidth,devicePixelRatio,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),outside,overlaps};});
   const row={lang,theme,size,route,nativeZoom:2,cssWidth:width,...geometry};rows.push(row);assert.equal(geometry.outerWidth,width*2);assert.equal(geometry.innerWidth,width);assert.equal(geometry.devicePixelRatio,2);assert.equal(geometry.overflow,0,JSON.stringify(row));assert.deepEqual(geometry.outside,[],JSON.stringify(row));assert.deepEqual(geometry.overlaps,[],JSON.stringify(row));
   if(route==='/'&&lang==='ru'&&size==='150')await page.screenshot({path:`${out}/home-${width}-${theme}-zoom200-text150.png`,fullPage:true});
  }}
 }finally{await ctx.close();await rm(profile,{recursive:true,force:true});}
}}finally{await writeFile(out+'/report.json',JSON.stringify({testedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mechanism:'Native chrome.settingsPrivate.setDefaultZoom(2); viewport:null; physical windows720/1536/2880 produce CSS widths360/768/1440, DPR2; no CDP emulation',rows},null,2)+'\n');}
console.log('PASS',rows.length,'native200% layouts');
