import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { spawn,execFileSync,type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { hashPassword } from 'better-auth/crypto';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw new Error('Dedicated TEST_DATABASE_URL ending in _test required');
process.env.DATABASE_URL=url;
const {db}=await import('../src/server/db');
const origin='http://localhost:3086';const password=randomBytes(32).toString('hex');
const env={...process.env,DATABASE_URL:url,BETTER_AUTH_URL:origin,BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),ALLOW_DEMO_SEED:'1',DEMO_AUTHOR_PASSWORD:password,DEMO_MODERATOR_PASSWORD:password};
let app:ChildProcess;let admin:string;let editor:string;let writer:string;let branchA:string;let branchB:string;let analyst:string;let guest:string;
const branchOne='cms-branch-a',branchTwo='cms-branch-b';
async function call(path:string,method='GET',body?:unknown,cookie?:string,extra:Record<string,string>={}){return fetch(origin+'/api'+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});}
async function login(email:string){const r=await call('/auth/sign-in/email','POST',{email,password});assert.equal(r.status,200);return r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');}
async function clean(){
 await db.editorialNotice.deleteMany();await db.publicationEvent.deleteMany();await db.contentRevision.deleteMany();await db.contentItem.deleteMany();await db.auditEvent.deleteMany();await db.staffAssignment.deleteMany();await db.staffRole.deleteMany({where:{id:{startsWith:'cms-'}}});
 await db.document.deleteMany({where:{fund:{branchId:{not:null}}}});await db.archivalCase.deleteMany();await db.inventory.deleteMany();await db.fund.deleteMany({where:{branchId:{not:null}}});await db.archiveBranch.deleteMany();
 await db.session.deleteMany();await db.account.deleteMany({where:{user:{email:{startsWith:'cms-'}}}});await db.user.deleteMany({where:{email:{startsWith:'cms-'}}});await db.apiRateLimit.deleteMany();await db.rateLimit.deleteMany();
}
before(async()=>{
 execFileSync(process.execPath,['--import','tsx','scripts/migrate.ts'],{env,stdio:'pipe'});await clean();
 const bootstrapEnv={...env,STAFF_ADMIN_EMAIL:'cms-bootstrap@example.test',STAFF_ADMIN_NAME:'Bootstrap test',STAFF_ADMIN_PASSWORD:password};
 execFileSync(process.execPath,['--import','tsx','scripts/bootstrap-staff.ts'],{env:bootstrapEnv,stdio:'pipe'});
 assert.equal(await db.staffAssignment.count({where:{roleId:'SUPERADMIN'}}),1);
 assert.throws(()=>execFileSync(process.execPath,['--import','tsx','scripts/bootstrap-staff.ts'],{env:bootstrapEnv,stdio:'pipe'}));
 await clean();
 const authPassword=await hashPassword(password);
 for(const [id,role,branch] of [['admin','SUPERADMIN',null],['editor','EDITOR',null],['writer','ARCHIVIST',null],['branch-a','BRANCH_ADMIN',branchOne],['branch-b','BRANCH_ADMIN',branchTwo],['analyst','ANALYST',null],['visitor',null,null]] as const){
  await db.user.create({data:{id:'cms-'+id,name:id,email:`cms-${id}@example.test`,emailVerified:true,accounts:{create:{id:randomUUID(),providerId:'credential',accountId:'cms-'+id,password:authPassword}}}});
 }
 for(const id of [branchOne,branchTwo])await db.archiveBranch.create({data:{id,code:id,name:id}});
 for(const [id,role,branch] of [['admin','SUPERADMIN',null],['editor','EDITOR',null],['writer','ARCHIVIST',null],['branch-a','BRANCH_ADMIN',branchOne],['branch-b','BRANCH_ADMIN',branchTwo],['analyst','ANALYST',null]] as const)await db.staffAssignment.create({data:{userId:'cms-'+id,roleId:role,branchId:branch,scopeKey:branch??'*'}});
 execFileSync(process.execPath,['--import','tsx','prisma/seed.ts'],{env,stdio:'pipe'});
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3086'],{env,stdio:'ignore'});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
 const cookies=[];for(const who of ['admin','editor','writer','branch-a','branch-b','analyst','visitor']){await db.rateLimit.deleteMany();cookies.push(await login(`cms-${who}@example.test`));}
 [admin,editor,writer,branchA,branchB,analyst,guest]=cookies;
},{timeout:60000});
after(async()=>{if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}await clean();await db.$disconnect();});
const payload=(title:string)=>({title,body:'Проверенный демонстрационный материал для редакционного процесса.',rights:'ALEteam CC0-1.0',sourceNote:'Оригинальные учебные данные'});
async function create(kind='NEWS',locale='ru',branchId:string|null=branchOne,cookie=writer){const r=await call('/admin/content','POST',{slug:'cms-'+randomUUID(),kind,branchId,isDemo:true,locale,payload:payload('Учебная публикация')},cookie);assert.equal(r.status,201);return (await r.json()).item;}
async function transition(r:{id:string;updatedAt:string},status:string,cookie=editor){const response=await call(`/admin/revisions/${r.id}/transition`,'POST',{status,expectedUpdatedAt:r.updatedAt,reason:'Проверка редакционного решения'},cookie);assert.equal(response.status,200);return (await response.json()).item;}
test('migration preserves public documents and file access; no automatic staff elevation',async()=>{
 assert.equal(await db.document.count({where:{id:{startsWith:'demo-doc-'}}}),20);
 assert.equal((await call('/files/demo-file-1')).status,200);
 assert.equal((await call('/admin/me')).status,401);assert.equal((await call('/admin/me','GET',undefined,guest)).status,403);
 assert.equal((await call('/admin/roles','GET',undefined,analyst)).status,403);
 assert.equal((await call('/admin/content','POST',{x:1},guest)).status,403);
});
test('seven presets exist, custom permissions can be changed and last admin is protected',async()=>{
 const roles=await(await call('/admin/roles','GET',undefined,admin)).json();assert.equal(roles.items.length,7);
 const role=await call('/admin/roles','PUT',{id:'cms-readonly',name:'Только чтение',permissions:['content.read']},admin);assert.equal(role.status,200);
 assert.equal((await call('/admin/assignments','POST',{userId:'cms-visitor',roleId:'cms-readonly',branchId:branchOne},admin)).status,200);
 assert.equal((await call('/admin/me','GET',undefined,guest)).status,200);
 assert.equal((await call('/admin/assignments','DELETE',{userId:'cms-visitor',roleId:'cms-readonly',branchId:branchOne},admin)).status,200);
 assert.equal((await call('/admin/me','GET',undefined,guest)).status,403);
 assert.equal((await call('/admin/assignments','DELETE',{userId:'cms-admin',roleId:'SUPERADMIN',branchId:null},admin)).status,409);
 assert.equal((await call('/admin/roles','PUT',{id:'SUPERADMIN',name:'Без управления правами',permissions:['content.read']},admin)).status,409);
 assert.equal((await call('/admin/users/cms-admin','PATCH',{isActive:false},admin)).status,409);
});
test('branch boundary is enforced on writes and reads, including direct identifiers',async()=>{
 const item=await create('NEWS','ru',branchOne,branchA);
 assert.equal((await call('/admin/content','POST',{slug:'outside',kind:'NEWS',branchId:branchTwo,locale:'ru',payload:payload('x')},branchA)).status,403);
 assert.equal((await call(`/admin/revisions/${item.revisions[0].id}`,'PATCH',{expectedUpdatedAt:item.revisions[0].updatedAt,payload:payload('Изменение')},branchB)).status,403);
 const list=await(await call('/admin/content','GET',undefined,branchB)).json();assert.ok(!list.items.some((r:{id:string})=>r.id===item.id));
 assert.equal((await call('/admin/branches/'+branchTwo,'PATCH',{code:'b',name:'x',expectedUpdatedAt:new Date().toISOString()},branchA)).status,403);
});
test('content passes all six states; private reasons, drafts and stale edits remain private',async()=>{
 const item=await create();let r=item.revisions[0];
 assert.equal((await call('/content/'+item.slug)).status,404);
 assert.equal((await call(`/admin/revisions/${r.id}/transition`,'POST',{status:'PUBLISHED',expectedUpdatedAt:r.updatedAt,reason:'Обход проверки'},editor)).status,409);
 const old=r;r=await transition(r,'IN_REVIEW',writer);
 assert.equal((await call(`/admin/revisions/${r.id}`,'PATCH',{expectedUpdatedAt:old.updatedAt,payload:payload('Устаревшая правка')},writer)).status,409);
 r=await transition(r,'CHANGES_REQUESTED');
 const edit=await call(`/admin/revisions/${r.id}`,'PATCH',{expectedUpdatedAt:r.updatedAt,payload:payload('Исправленная публикация')},writer);assert.equal(edit.status,200);r=(await edit.json()).item;
 r=await transition(r,'IN_REVIEW',writer);r=await transition(r,'APPROVED');r=await transition(r,'PUBLISHED');
 const published=await(await call('/content/'+item.slug)).json();assert.equal(published.item.payload.title,'Исправленная публикация');assert.equal(published.item.authorId,undefined);assert.equal(published.item.reviewerId,undefined);
 assert.equal((await call('/content/'+item.slug+'?locale=en')).status,404);
 const history=await(await call(`/admin/revisions/${r.id}/events`,'GET',undefined,writer)).json();assert.equal(history.total,5);assert.ok(history.items.every((x:{reason:string})=>x.reason.length>0));
 const notices=await(await call('/admin/notices','GET',undefined,writer)).json();assert.ok(notices.items.some((x:{revisionId:string})=>x.revisionId===r.id));
 await transition(r,'ARCHIVED');assert.equal((await call('/content/'+item.slug)).status,404);
});
test('self approval is rejected and a new translation cannot publish itself',async()=>{
 const item=await create('PAGE','ru',null,editor);let r=await transition(item.revisions[0],'IN_REVIEW',editor);
 assert.equal((await call(`/admin/revisions/${r.id}/transition`,'POST',{status:'APPROVED',expectedUpdatedAt:r.updatedAt,reason:'Самопроверка'},editor)).status,403);
 r=await transition(r,'APPROVED',admin);r=await transition(r,'PUBLISHED',editor);
 const draft=await call(`/admin/content/${item.id}/revisions`,'POST',{locale:'en',payload:payload('English draft')},editor);assert.equal(draft.status,201);
 assert.equal((await call('/content/'+item.slug+'?locale=en')).status,404);assert.deepEqual((await(await call('/content/'+item.slug)).json()).item.availableLocales,['ru']);
 let english=(await draft.json()).item;english=await transition(english,'IN_REVIEW',editor);english=await transition(english,'APPROVED',admin);english=await transition(english,'PUBLISHED',editor);
 assert.deepEqual((await(await call('/content/'+item.slug)).json()).item.availableLocales,['en','ru']);
 await transition(english,'ARCHIVED',editor);assert.equal((await call('/content/'+item.slug+'?locale=en')).status,404);assert.equal((await call('/content/'+item.slug)).status,200);
});
test('every information type is data driven and published locale versions are unique',async()=>{
 for(const kind of ['PAGE','FAQ','NEWS','COLLECTION','PERSON','EVENT','MEMOIR','EXHIBITION','EXHIBIT','SETTING']){
  const item=await create(kind,'kk',null,admin);let r=await transition(item.revisions[0],'IN_REVIEW',admin);
  // Settings require an independent reviewer with explicit settings permission.
  r=await transition(r,'APPROVED',kind==='SETTING'?await settingsReviewer():editor);r=await transition(r,'PUBLISHED',admin);
  const found=await call('/content/'+item.slug+'?locale=kk');assert.equal(found.status,200);assert.equal((await found.json()).item.kind,kind);
 }
});
async function settingsReviewer(){
 await call('/admin/assignments','POST',{userId:'cms-editor',roleId:'SITE_ADMIN',branchId:null},admin);return editor;
}
test('hierarchy keeps zero-padded numbers and database prevents a case in a different fund',async()=>{
 const fund=await(await call('/admin/catalog/funds','POST',{branchId:branchOne,number:'0001',name:'Учебный фонд',description:'Демо'},branchA)).json();assert.ok(fund.item.id);
 const other=await(await call('/admin/catalog/funds','POST',{branchId:branchTwo,number:'0002',name:'Другой фонд',description:'Демо'},branchB)).json();
 const inv=await(await call('/admin/catalog/inventories','POST',{fundId:fund.item.id,number:'001',title:'Опись'},branchA)).json();assert.equal(inv.item.number,'001');
 const invalid=await call('/admin/catalog/cases','POST',{fundId:other.item.id,inventoryId:inv.item.id,number:'0003',title:'Чужая опись'},branchB);assert.equal(invalid.status,409);
 const archiveCase=await(await call('/admin/catalog/cases','POST',{fundId:fund.item.id,inventoryId:inv.item.id,number:'0003',title:'Дело'},branchA)).json();
 const body={fundId:fund.item.id,caseId:archiveCase.item.id,title:'Документ',description:'Учебное описание',reference:'TEST-'+randomUUID(),year:1930,type:'LETTER',rights:'CC0',internalNotes:'PRIVATE_INTERNAL_MARKER'};
 const document=await call('/admin/catalog/documents','POST',body,branchA);assert.equal(document.status,201);const d=(await document.json()).item;assert.equal(d.isPublic,false);
 assert.equal((await call('/documents/'+d.id)).status,404);
 assert.equal((await call('/admin/catalog/documents','POST',{...body,fundId:other.item.id,reference:'TEST-'+randomUUID()},branchB)).status,409);
 const scope=await(await call('/admin/catalog/documents','GET',undefined,branchB)).json();assert.ok(!scope.items.some((x:{id:string})=>x.id===d.id));
});
test('catalog-only metadata does not expose private notes, file metadata, bytes or OCR',async()=>{
 await db.document.update({where:{id:'demo-doc-01'},data:{internalNotes:'PRIVATE_INTERNAL_MARKER',allowDigitalCopy:false}});
 try{const r=await call('/documents/demo-doc-01');assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes('PRIVATE_INTERNAL_MARKER'));assert.equal(JSON.parse(text).item.files.length,0);assert.equal((await call('/files/demo-file-1')).status,404);assert.equal((await call('/files/demo-scan-1/ocr')).status,404);}
 finally{await db.document.update({where:{id:'demo-doc-01'},data:{internalNotes:null,allowDigitalCopy:true}});}
});
test('disabled and idle staff sessions are revoked; ordinary account is not promoted',async()=>{
 assert.equal((await call('/admin/users/cms-branch-b','PATCH',{isActive:false},admin)).status,200);
 assert.equal((await call('/admin/me','GET',undefined,branchB)).status,401);
 await db.rateLimit.deleteMany();assert.equal((await call('/auth/sign-in/email','POST',{email:'cms-branch-b@example.test',password})).status,401);
 await db.session.updateMany({where:{userId:'cms-analyst'},data:{lastActivityAt:new Date(0)}});
 assert.equal((await call('/admin/me','GET',undefined,analyst)).status,401);
 assert.equal(await db.session.count({where:{userId:'cms-analyst'}}),0);
});
test('audit contains identifiers, never credentials or publication bodies',async()=>{
 const result=await call('/admin/audit?pageSize=50','GET',undefined,admin);assert.equal(result.status,200);const text=await result.text();assert.ok(!text.includes(password));assert.ok(!text.includes('Проверенный демонстрационный'));
 const first=JSON.parse(text);const actions=first.items.map((x:{action:string})=>x.action);
 for(let page=2;page<=Math.ceil(first.total/50);page++){
  const next=await(await call(`/admin/audit?pageSize=50&page=${page}`,'GET',undefined,admin)).json();actions.push(...next.items.map((x:{action:string})=>x.action));
 }
 assert.ok(actions.includes('STAFF_SIGNIN'));
 assert.equal((await call('/admin/roles','PUT',{id:'x',name:'x',permissions:['unknown.root']},admin)).status,400);
 assert.equal((await call('/admin/content','POST',{slug:'csrf',kind:'NEWS',locale:'ru',payload:payload('x')},admin,{Origin:'https://attacker.invalid'})).status,403);
});

test('branch profiles require complete contacts, approval and the branch visibility switch',async()=>{
 const p={...payload('Учебный филиал'),address:'ДЕМО адрес',phone:'+7 000 0000000',email:'demo@example.test',hours:'ДЕМО график',latitude:49.0,longitude:82.0};
 const r=await call('/admin/content','POST',{slug:'cms-profile-'+randomUUID(),kind:'BRANCH_PROFILE',branchId:branchOne,locale:'ru',payload:p},writer);assert.equal(r.status,201);const item=(await r.json()).item;
 let revision=await transition(item.revisions[0],'IN_REVIEW',writer);revision=await transition(revision,'APPROVED');await transition(revision,'PUBLISHED');
 assert.equal((await call('/content/'+item.slug)).status,404);
 let b=await db.archiveBranch.findUniqueOrThrow({where:{id:branchOne}});
 const show=await call('/admin/branches/'+branchOne,'PATCH',{code:b.code,name:b.name,isPublic:true,expectedUpdatedAt:b.updatedAt.toISOString()},branchA);assert.equal(show.status,200);
 const branches=await(await call('/branches')).json();assert.ok(branches.items.some((x:{id:string})=>x.id===item.id));
 b=await db.archiveBranch.findUniqueOrThrow({where:{id:branchOne}});await call('/admin/branches/'+branchOne,'PATCH',{code:b.code,name:b.name,isPublic:false,expectedUpdatedAt:b.updatedAt.toISOString()},branchA);
 assert.equal((await call('/content/'+item.slug)).status,404);
});
test('withdrawn sources are removed from public exhibition references',async()=>{
 const source=await create('EXHIBIT');let r=await transition(source.revisions[0],'IN_REVIEW',writer);r=await transition(r,'APPROVED');r=await transition(r,'PUBLISHED');
 const response=await call('/admin/content','POST',{slug:'cms-exhibition-'+randomUUID(),kind:'EXHIBITION',branchId:branchOne,locale:'ru',payload:{...payload('Выставка'),exhibitIds:[source.id],documentIds:['demo-doc-01'],fileIds:['demo-scan-1']}},writer);assert.equal(response.status,201);const item=(await response.json()).item;
 let exhibition=await transition(item.revisions[0],'IN_REVIEW',writer);exhibition=await transition(exhibition,'APPROVED');await transition(exhibition,'PUBLISHED');
 await transition(r,'ARCHIVED');const data=await(await call('/content/'+item.slug)).json();assert.deepEqual(data.item.payload.exhibitIds,[]);
 await db.document.update({where:{id:'demo-doc-01'},data:{allowDigitalCopy:false}});
 try{const data=await(await call('/content/'+item.slug)).json();assert.deepEqual(data.item.payload.fileIds,[]);assert.deepEqual(data.item.payload.documentIds,['demo-doc-01']);}
 finally{await db.document.update({where:{id:'demo-doc-01'},data:{allowDigitalCopy:true}});}
});
test('concurrent draft edits and replacement publication keep one live version',async()=>{
 const item=await create();const r=item.revisions[0];const responses=await Promise.all(['Первый','Второй'].map(title=>call('/admin/revisions/'+r.id,'PATCH',{expectedUpdatedAt:r.updatedAt,payload:payload(title)},writer)));
 assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);let current=(await responses.find(x=>x.status===200)!.json()).item;
 current=await transition(current,'IN_REVIEW',writer);current=await transition(current,'APPROVED');await transition(current,'PUBLISHED');
 const firstId=current.id;
 const next=await call(`/admin/content/${item.id}/revisions`,'POST',{locale:'ru',payload:payload('Новая версия')},writer);assert.equal(next.status,201);let revision=(await next.json()).item;assert.equal(revision.version,2);
 revision=await transition(revision,'IN_REVIEW',writer);revision=await transition(revision,'APPROVED');await transition(revision,'PUBLISHED');
 assert.equal(await db.contentRevision.count({where:{itemId:item.id,locale:'ru',status:'PUBLISHED'}}),1);assert.equal((await(await call('/content/'+item.slug)).json()).item.payload.title,'Новая версия');
 assert.equal(await db.publicationEvent.count({where:{revisionId:firstId,toStatus:'ARCHIVED'}}),1);
});

test('content moderator can review but cannot write; site administrator cannot manage roles',async()=>{
 assert.equal((await call('/admin/assignments','POST',{userId:'cms-visitor',roleId:'CONTENT_MODERATOR',branchId:branchOne},admin)).status,200);
 try{
  const item=await create();const r=await transition(item.revisions[0],'IN_REVIEW',writer);
  await transition(r,'APPROVED',guest);
  assert.equal((await call('/admin/content','POST',{slug:'forbidden-write',kind:'NEWS',branchId:branchOne,locale:'ru',payload:payload('x')},guest)).status,403);
  assert.equal((await call('/admin/roles','GET',undefined,editor)).status,403);
  assert.equal((await call('/admin/me','GET',undefined,admin)).status,200);
 }finally{await call('/admin/assignments','DELETE',{userId:'cms-visitor',roleId:'CONTENT_MODERATOR',branchId:branchOne},admin);}
});
