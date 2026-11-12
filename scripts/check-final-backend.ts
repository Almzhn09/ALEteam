import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const database=process.env.TEST_DATABASE_URL;if(!database||!new URL(database).pathname.endsWith('_test'))throw Error('Copied real corpus in a dedicated _test database required');process.env.DATABASE_URL=database;process.env.BETTER_AUTH_URL='http://localhost:3132';process.env.BETTER_AUTH_SECRET=randomBytes(32).toString('hex');process.env.ASSISTANT_MODE='local-model';delete process.env.ASSISTANT_SERVICE_URL;
const {GET,POST}=await import('../src/app/api/[[...path]]/route');const {db}=await import('../src/server/db');
const samples:any[]=[],timings:any[]=[];let cookie='';
async function call(route:string,body?:unknown){const method=body===undefined?'GET':'POST';const req=new Request('http://localhost:3132/api'+route,{method,headers:{Origin:'http://localhost:3132',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const r=await(body===undefined?GET:POST)(req,{params:Promise.resolve({path:route.split('?')[0].slice(1).split('/')})});assert.equal(r.status,200,route+' '+await r.clone().text());return r;}
try{
 const reg=await call('/auth/sign-up/email',{name:'Final review fixture',email:'final-'+randomBytes(6).toString('hex')+'@example.test',password:randomBytes(24).toString('hex')});cookie=reg.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const firstRequests=[];
 for(const route of ['/discovery/home?locale=ru&limit=3','/search?q='+encodeURIComponent('Өскемен'),'/assistant']){const start=performance.now();const r=await call(route,route==='/assistant'?{question:'покажи документы про Усть-Каменогорск',locale:'ru'}:undefined);await r.json();firstRequests.push({route,ms:Math.round((performance.now()-start)*100)/100});}
 for(const city of ['Өскемен','Оскемен','Усть-Каменогорск','усть — каменогорск','Усть  -  Каменогорск']){
  const result=await(await call('/search?'+new URLSearchParams({q:city,pageSize:'10'}))).json();assert.deepEqual(result.counts,{materials:9,funds:1020,newspapers:19});assert.equal(result.total,1048);samples.push({route:'search',city,total:result.total,counts:result.counts});
  for(const question of [city,'покажи документы про '+city]){const answer=await(await call('/assistant',{question,locale:'ru'})).json();assert.equal(answer.noAnswer,false,question);assert.ok(answer.searchHref?.startsWith('/search?'));assert.deepEqual([...new Set(answer.sources.map((s:any)=>s.kind))].sort(),['cms','fund','newspaper']);samples.push({route:'assistant',question,sourceKinds:answer.sources.map((s:any)=>s.kind),searchHref:answer.searchHref});}
 }
 const literal=await(await call('/search?nameMode=literal&q='+encodeURIComponent('Өскемен'))).json();assert.ok(literal.total<=1048);samples.push({route:'literal',total:literal.total});
 for(const question of ['Найди фотографии Өскемен','покажи документы про Усть-Каменогорск после 2099']){const answer=await(await call('/assistant',{question,locale:'ru'})).json();assert.equal(answer.noAnswer,true,question);samples.push({route:'assistant-filter',question,noAnswer:answer.noAnswer});}
 for(const route of ['/discovery/home?locale=ru&limit=3','/search?q='+encodeURIComponent('Өскемен'),'/assistant']){const runs=[];for(let i=0;i<4;i++){const start=performance.now();const r=await call(route,route==='/assistant'?{question:'покажи документы про Усть-Каменогорск',locale:'ru'}:undefined);await r.json();runs.push(Math.round((performance.now()-start)*100)/100);}timings.push({route,runsMs:runs});}
 const out=process.argv[2]??'.local/final-backend/real-review.json';await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({testedAt:new Date().toISOString(),scope:'Native API router on isolated copy of real public corpus; one disposable reader; not Cloud Run',samples,firstRequestsBeforeMatrix:firstRequests,timings,counter:'Wall-clock API handler timing includes authorization for assistant; not browser or network latency'},null,2)+'\n');console.log('PASS real corpus matrix and API timings',samples.length);
}finally{await db.$disconnect();}
