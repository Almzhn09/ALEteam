import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated _test database required');process.env.DATABASE_URL=url;process.env.BETTER_AUTH_URL='http://localhost:3132';process.env.BETTER_AUTH_SECRET=randomBytes(32).toString('hex');
const {db}=await import('../src/server/db');const {contentPayload}=await import('../src/server/cms');const {GET}=await import('../src/app/api/[[...path]]/route');
async function get(path:string){const r=await GET(new Request('http://localhost:3132/api'+path),{params:Promise.resolve({path:path.split('?')[0].slice(1).split('/')})});assert.equal(r.status,200,await r.clone().text());return r.json();}
before(async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env:process.env,stdio:'pipe'});
 await db.user.createMany({data:[{id:'urgent-author',name:'Fixture author',email:'urgent-author@example.test'},{id:'urgent-reviewer',name:'Fixture reviewer',email:'urgent-reviewer@example.test'}]});
 await db.archiveBranch.create({data:{id:'urgent-hidden',code:'urgent-hidden',name:'Private fixture',isPublic:false}});
 for(const [id,status,branchId,reviewerId]of [['visible','PUBLISHED',null,'urgent-reviewer'],['draft','DRAFT',null,null],['hidden','PUBLISHED','urgent-hidden','urgent-reviewer'],['self','PUBLISHED',null,'urgent-author']]as const){
 await db.contentItem.create({data:{id:'urgent-'+id,slug:'urgent-'+id,kind:'PAGE',isDemo:true,branchId,revisions:{create:{locale:'ru',version:1,status,authorId:'urgent-author',reviewerId,payload:contentPayload.parse({title:'DEMO Усть-Каменогорск '+id,body:'Учебная запись о городе Усть-Каменогорск. Не исторический источник.',rights:'Synthetic fixture',category:'history',yearFrom:1940,yearTo:1945})}}}});}
 for(const kind of ['fund','newspaper'])for(const visible of [true,false]){
 const id='urgent-'+kind+'-'+visible;await db.referenceDataset.create({data:{id,kind,title:'Synthetic dataset',sourceSha256:'a'.repeat(64),importHash:'a'.repeat(64),source:{edition:'fixture',title:'Synthetic',sha256:'a'.repeat(64)},isPublic:visible,entries:{create:{id,sourceKey:id,position:1,number:kind==='fund'?'0007':null,title:'DEMO Усть-Каменогорск',searchText:'DEMO Усть-Каменогорск',payload:kind==='fund'?{names:[{name:'DEMO Усть-Каменогорск',periodOriginal:'1940',sourceRow:1}]}:{publisherOriginal:'Fixture',volumesOriginal:'1',yearsOriginal:'1940',notes:'Synthetic',sourceRow:1},raw:{fixture:true},isPublic:true}}}});}
});
after(()=>db.$disconnect());
test('B1 aliases return the same public CMS/fund/newspaper results without leaking hidden or unreviewed records',async()=>{
 let expected:string[]|undefined;for(const q of ['Өскемен','Оскемен','Усть-Каменогорск','Усть  Каменогорск','УСТЬ — КАМЕНОГОРСК']){const r=await get('/search?'+new URLSearchParams({q,pageSize:'100'}));const ids=r.items.map((x:any)=>x.kind==='material'?x.material.id:x.id).sort();assert.deepEqual(ids,['urgent-fund-true','urgent-newspaper-true','urgent-visible']);if(expected)assert.deepEqual(ids,expected);expected=ids;}
});
test('B1 literal mode, source, exact fund number and CMS filters remain restrictive',async()=>{
 assert.equal((await get('/search?q='+encodeURIComponent('Өскемен')+'&nameMode=literal')).total,0);
 assert.equal((await get('/search?scope=cms&q='+encodeURIComponent('Оскемен')+'&category=other')).total,0);
 assert.equal((await get('/search?scope=cms&q='+encodeURIComponent('Оскемен')+'&yearFrom=2000')).total,0);
 const found=await get('/directories/funds?q='+encodeURIComponent('Өскемен')+'&number=0007');assert.equal(found.total,1);assert.equal(found.items[0].number,'0007');assert.equal((await get('/directories/funds?q='+encodeURIComponent('Өскемен')+'&number=7')).total,0);
 await db.referenceDataset.update({where:{id:'urgent-fund-true'},data:{isPublic:false}});assert.equal((await get('/search?scope=fund&q='+encodeURIComponent('Өскемен'))).total,0);await db.referenceDataset.update({where:{id:'urgent-fund-true'},data:{isPublic:true}});
});
