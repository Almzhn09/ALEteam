// Native Chromium browser zoom, set through the same settings API as its UI.
// No device-metrics emulation: viewport is null, window remains 1440 pixels,
// innerWidth changes to 720 and devicePixelRatio to 2 at native 200% zoom.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const base=process.env.BASE_URL??'http://localhost:3122',out=process.env.OUT??'.local/visual-v2-zoom-proof';assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u);await mkdir(out,{recursive:true});
const rows=[];
for(const lang of['ru','kk','en'])for(const theme of['light','dark']){
 const profile=await mkdtemp('.local/native-zoom-');const ctx=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,viewport:null,reducedMotion:'reduce',args:['--no-sandbox','--window-size=1440,1000']});
 try{
  const settings=await ctx.newPage();await settings.goto('chrome://settings/appearance');await settings.evaluate(()=>new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(2,()=>resolve())));
  const zoom=await settings.evaluate(()=>new Promise(resolve=>chrome.settingsPrivate.getDefaultZoom(resolve)));assert.equal(zoom,2);await settings.close();
  await ctx.addCookies([{name:'lang',value:lang,url:base},{name:'display-theme',value:theme,url:base},{name:'display-text-size',value:'100',url:base}]);const p=await ctx.newPage();
  for(const route of['/','/catalog?scope=cms','/catalog?scope=fund','/materials/archive-history-1?contentLang=ru','/guide','/about','/calendar','/services','/directories/funds']){
   await p.goto(base+route);await p.evaluate(()=>document.fonts.ready);if(route.startsWith('/catalog'))await p.locator('.search-card').first().waitFor();if(route==='/')await p.locator('section[aria-labelledby="recommendations-title"] .result-list a').first().waitFor();
   const row=await p.evaluate(()=>({outerWidth,innerWidth,devicePixelRatio,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth)}));assert.equal(row.outerWidth,1440);assert.equal(row.innerWidth,720);assert.equal(row.devicePixelRatio,2);assert.equal(row.overflow,0,JSON.stringify({lang,theme,route,...row}));rows.push({lang,theme,route,browserZoom:zoom,...row});
   if(lang==='ru'&&['/','/catalog?scope=cms'].includes(route))await p.screenshot({path:out+'/'+(route==='/'?'home':'catalog')+'-'+theme+'-zoom200.png',fullPage:true});
  }
 }finally{await ctx.close()}
}
await writeFile(out+'/report.json',JSON.stringify({generated:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),mechanism:'Native Chromium chrome.settingsPrivate.setDefaultZoom(2), viewport:null, fixed 1440px browser window; no CDP device emulation',rows},null,2)+'\n');console.log('PASS',rows.length,'native browser zoom200 layouts');
