import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const url=process.env.TEST_DATABASE_URL;if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Dedicated _test database required');process.env.DATABASE_URL=url;process.env.BETTER_AUTH_URL='http://localhost:3132';process.env.BETTER_AUTH_SECRET=randomBytes(32).toString('hex');
const {db}=await import('../src/server/db');const {contentPayload}=await import('../src/server/cms');const {GET,POST}=await import('../src/app/api/[[...path]]/route');
async function get(path:string){const r=await GET(new Request('http://localhost:3132/api'+path),{params:Promise.resolve({path:path.split('?')[0].slice(1).split('/')})});assert.equal(r.status,200,await r.clone().text());return r.json();}
before(async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env:process.env,stdio:'pipe'});
 await db.$executeRawUnsafe('TRUNCATE "Document", "Fund", "ContentItem", "ReferenceDataset", "ArchiveBranch", "User" CASCADE');
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

test('B2 city questions use CMS and both directory kinds, honor periods and reject source withdrawal',async()=>{
 const {publicCitySources,validatePublicCitySources}=await import('../src/server/assistant-public-search');const {semanticConversationPlan}=await import('../src/server/semantic-catalog-plan');const {normalizePlaceSpelling}=await import('../src/server/search-names');
 for(const city of ['Өскемен','Оскемен','Усть-Каменогорск']){const q='покажи документы про '+city;const plan=semanticConversationPlan(normalizePlaceSpelling(q),[],'ru',true);const sources=await publicCitySources(q,plan);assert.deepEqual([...new Set(sources.map(s=>s.kind))].sort(),['cms','fund','newspaper']);assert.ok(await validatePublicCitySources(sources));assert.ok(sources.every(s=>!s.key.includes('hidden')&&!s.key.includes('draft')));}
 const q='покажи документы про Өскемен';const plan=semanticConversationPlan(q,[],'ru',true);const sources=await publicCitySources(q,plan);await db.contentRevision.updateMany({where:{itemId:'urgent-visible'},data:{status:'ARCHIVED'}});assert.equal(await validatePublicCitySources(sources),false);assert.equal((await get('/search?scope=cms&q='+encodeURIComponent('Өскемен'))).total,0);await db.contentRevision.updateMany({where:{itemId:'urgent-visible'},data:{status:'PUBLISHED'}});
 assert.deepEqual(await publicCitySources(q,{...plan,filters:{...plan.filters,reference:'NO-SUCH-REF'}}),[]);
});

test('B2 API handles bare city aliases and combines existing documents with CMS and both holdings kinds',async()=>{
 const signup=await POST(new Request('http://localhost:3132/api/auth/sign-up/email',{method:'POST',headers:{Origin:'http://localhost:3132','Content-Type':'application/json'},body:JSON.stringify({name:'Urgent visitor',email:'visitor@example.test',password:randomBytes(24).toString('hex')})}),{params:Promise.resolve({path:['auth','sign-up','email']})});assert.equal(signup.status,200);const cookie=signup.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 async function ask(question:string){const r=await POST(new Request('http://localhost:3132/api/assistant',{method:'POST',headers:{Origin:'http://localhost:3132','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({question})}),{params:Promise.resolve({path:['assistant']})});assert.equal(r.status,200,await r.clone().text());return r.json();}
 for(const q of ['Оскемен','Өскемен','Усть-Каменогорск']){const body=await ask(q);assert.equal(body.noAnswer,false,q);assert.deepEqual([...new Set(body.sources.map((s:any)=>s.kind))].sort(),['cms','fund','newspaper']);}
 await db.fund.create({data:{id:'urgent-document-fund',name:'Synthetic fund',description:'Fixture only'}});
 await db.document.create({data:{id:'urgent-document',title:'DEMO Усть-Каменогорск',description:'Synthetic Усть-Каменогорск fixture',reference:'URGENT-0001',year:1940,type:'REPORT',rights:'Synthetic fixture',isPublic:true,allowDigitalCopy:true,locality:'Усть-Каменогорск',fundId:'urgent-document-fund',translations:{create:{locale:'ru',locality:'Усть-Каменогорск',title:'DEMO Усть-Каменогорск',description:'Synthetic Усть-Каменогорск fixture',rights:'Synthetic fixture'}}}});
 const mixed=await ask('покажи документы про Усть-Каменогорск');assert.deepEqual([...new Set(mixed.sources.map((s:any)=>s.kind))].sort(),['cms','document','fund','newspaper']);assert.ok(mixed.sources.length<=5);
 await db.document.update({where:{id:'urgent-document'},data:{isPublic:false}});const hidden=await ask('покажи документы про Усть-Каменогорск');assert.ok(hidden.sources.every((s:any)=>s.id!=='urgent-document'));assert.equal(hidden.noAnswer,false);
});

test('catalog empty fast path is fresh across publication, branch hiding and document deletion',async()=>{
 const {retrieveSemanticCatalog}=await import('../src/server/semantic-catalog');const {semanticConversationPlan}=await import('../src/server/semantic-catalog-plan');const plan=semanticConversationPlan('покажи документы про Усть-Каменогорск',[],'ru',true);
 assert.deepEqual(await retrieveSemanticCatalog(plan),[]);
 await db.document.update({where:{id:'urgent-document'},data:{isPublic:true}});
 assert.deepEqual((await retrieveSemanticCatalog(plan)).map(s=>s.id),['urgent-document']);
 await db.fund.update({where:{id:'urgent-document-fund'},data:{branchId:'urgent-hidden'}});
 assert.deepEqual(await retrieveSemanticCatalog(plan),[]);
 await db.fund.update({where:{id:'urgent-document-fund'},data:{branchId:null}});
 await db.document.update({where:{id:'urgent-document'},data:{deletedAt:new Date()}});
 assert.deepEqual(await retrieveSemanticCatalog(plan),[]);
 await db.document.update({where:{id:'urgent-document'},data:{deletedAt:null}});
 assert.deepEqual((await retrieveSemanticCatalog(plan)).map(s=>s.id),['urgent-document']);
});

test('home batching keeps topic, parent, reviewer and source revocation rules for anonymous and selected topics',async()=>{
 const {resolveMaterial}=await import('../src/server/discovery-materials');const {liveFacts}=await import('../src/server/discovery-facts');const {home}=await import('../src/server/discovery-home');
 const material=await resolveMaterial({kind:'cms',id:'urgent-visible'},'ru',false);assert.ok(material);const proof=[material.source];
 const common={status:'VERIFIED',authorId:'urgent-author',reviewerId:'urgent-reviewer',sources:proof as any};
 for(const [id,kind,branchId,status,reviewerId]of [['topic','TOPIC',null,'VERIFIED','urgent-reviewer'],['private-topic','TOPIC','urgent-hidden','VERIFIED','urgent-reviewer'],['draft-topic','TOPIC',null,'DRAFT','urgent-reviewer'],['place','PLACE',null,'VERIFIED','urgent-reviewer'],['private-place','PLACE','urgent-hidden','VERIFIED','urgent-reviewer'],['self-topic','TOPIC',null,'DRAFT','urgent-author']]as const){await db.discoveryFact.create({data:{...common,id:'urgent-'+id,kind,branchId,status,reviewerId,data:{labels:{ru:{title:'Synthetic '+id,body:'Fixture only'}}}}});}
 for(const [id,topicId,parentId]of [['valid','urgent-topic',null],['private-topic','urgent-private-topic',null],['draft-topic','urgent-draft-topic',null],['wrong-kind','urgent-place',null],['missing','urgent-no-such-topic',null],['self-topic','urgent-self-topic',null],['parent',undefined,'urgent-private-place']]as const){await db.discoveryFact.create({data:{...common,id:'urgent-ed-'+id,kind:'EDITORIAL',parentId,data:{material:{kind:'cms',id:'urgent-visible'},...(topicId?{topicId}:{}),order:0}}});}
 await assert.rejects(db.discoveryFact.update({where:{id:'urgent-self-topic'},data:{status:'VERIFIED'}}));
 assert.deepEqual((await liveFacts('EDITORIAL')).map(r=>r.id),['urgent-ed-valid']);
 const normal=await(await home(new Request('http://localhost:3132/api/discovery/home?locale=ru&limit=3'))).json();assert.deepEqual(normal.recommended.items.map((i:any)=>i.id),['urgent-visible']);
 const chosen=await(await home(new Request('http://localhost:3132/api/discovery/home?locale=ru&topicIds=urgent-topic'))).json();assert.equal(chosen.recommended.mode,'interests');assert.deepEqual(chosen.recommended.items.map((i:any)=>i.id),['urgent-visible']);
 await db.discoveryFact.update({where:{id:'urgent-topic'},data:{branchId:'urgent-hidden'}});assert.deepEqual(await liveFacts('EDITORIAL'),[]);
 await db.discoveryFact.update({where:{id:'urgent-topic'},data:{branchId:null}});assert.equal((await liveFacts('EDITORIAL')).length,1);
 await db.contentRevision.updateMany({where:{itemId:'urgent-visible'},data:{status:'ARCHIVED'}});assert.deepEqual(await liveFacts('EDITORIAL'),[]);assert.equal((await(await home(new Request('http://localhost:3132/api/discovery/home?locale=ru'))).json()).recommended.items.length,0);
});
