import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, cp, appendFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { docker } from '../deploy/docker.mjs';

const run = Date.now().toString(36); const project = `ale-deploy-${run}`; const restored = `${project}-restore`;
const folder = `.local/deploy-test-${run}`; await mkdir(folder, { mode: 0o700 });
const secret = () => randomBytes(32).toString('hex');
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const port = await freePort(); const restorePort = await freePort();
const config = { DEPLOY_DOMAIN: '', DEPLOY_HTTP_PORT: String(port), BETTER_AUTH_URL: `http://localhost:${port}`,
  POSTGRES_ADMIN_PASSWORD: secret(), APP_DB_PASSWORD: secret(), BETTER_AUTH_SECRET: secret(), ALLOW_DEMO_SEED: '1',
  DEMO_AUTHOR_PASSWORD: secret(), DEMO_MODERATOR_PASSWORD: secret(), STAFF_ADMIN_EMAIL: 'docker-staff@example.test', STAFF_ADMIN_NAME: 'Docker staff', STAFF_ADMIN_PASSWORD: secret(), MODERATION_MODE: 'local', ASSISTANT_MODE: 'retrieval', ARCHIVE_LLM_API_KEY: '', ARCHIVE_LLM_MODEL: '' };
const restoreConfig = { ...config, DEPLOY_HTTP_PORT: String(restorePort), BETTER_AUTH_URL: `http://localhost:${restorePort}`, ALLOW_DEMO_SEED: '0' };
const envFile = `${folder}/source.env`; const restoreEnvFile = `${folder}/restore.env`;
const serialize = value => Object.entries(value).map(([k,v]) => `${k}=${v}`).join('\n') + '\n';
await writeFile(envFile, serialize(config), { mode: 0o600 }); await writeFile(restoreEnvFile, serialize(restoreConfig), { mode: 0o600 });
const prefix = name => ['compose', '--env-file', name === project ? envFile : restoreEnvFile, '-f', 'deploy/compose.yaml', '--project-name', name];
const environment = name => ({ ...process.env, ...(name === project ? config : restoreConfig) });
const compose = (name, args) => docker([...prefix(name), ...args], environment(name));
const checks = [];const measurements=[];
let reservedVolume;
async function check(name, work) { try { await work(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); } catch (error) { checks.push({ name, passed: false, errorType: error.name }); throw error; } }
async function login(origin, moderator = false) {
  const response = await fetch(origin + '/api/auth/sign-in/email', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: moderator ? 'moderator@example.test' : 'author@example.test', password: moderator ? config.DEMO_MODERATOR_PASSWORD : config.DEMO_AUTHOR_PASSWORD }) });
  assert.equal(response.status, 200); return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}
async function waitHealthy(origin) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(origin + '/api/health', { headers: { Connection: 'close' }, signal: AbortSignal.timeout(2000) })).ok) return;
    } catch { /* host publishing / stale keep-alive sockets can settle after restart */ }
    await delay(200);
  }
  throw new Error('HTTP readiness timed out');
}
try {
  await check('runtime is non-root and both images exclude environment files', async () => {
    for (const image of ['aleteam:local', 'aleteam-tools:local']) {
      const info = JSON.parse(docker(['run','--rm','--entrypoint','node',image,'-e',"const fs=require('node:fs');console.log(JSON.stringify({uid:process.getuid(),env:fs.existsSync('/app/.env')||fs.existsSync('/app/deploy/.env')}))"]));
      assert.equal(info.uid, 1000); assert.equal(info.env, false);
    }
  });
  await check('fresh Compose stack initializes schema, original assets and two accounts', async () => {
    compose(project, ['up','-d','--wait','--no-build','app']);
    await waitHealthy(config.BETTER_AUTH_URL);
    assert.equal((await fetch(config.BETTER_AUTH_URL + '/api/health')).status, 200);
    const page = await fetch(config.BETTER_AUTH_URL); assert.equal(page.status, 200); const html = await page.text(); assert.ok(html.includes('Электронный архив'));
    const styles = [...html.matchAll(/href="([^" ]+\.css[^" ]*)"/g)].map(m => m[1]); assert.ok(styles.length > 0);
    for (const style of styles) assert.equal((await fetch(new URL(style, config.BETTER_AUTH_URL))).status, 200);
    const catalog = await (await fetch(config.BETTER_AUTH_URL + '/api/documents')).json(); assert.equal(catalog.total, 20);
    const role = compose(project, ['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT rolsuper FROM pg_roles WHERE rolname=current_user']); assert.equal(role, 'f');
  });
  let commentId; let replyId; let modCookie; let staffCookie; let cmsId; let cmsSlug; let fundId; let catalogueId; let branchId;
  let discoverySubId;let filePreviewId;let sourceDraftId;let previewFileId;let discoveryTopicId;
  let uploadFileId; let quarantinedId; let importId; let importDigest; let importedIds; let uploadedSha256;
  await check('standalone runtime serves a PNG and persists an authenticated comment', async () => {
    const origin = config.BETTER_AUTH_URL; const cookie = await login(origin);
    const response = await fetch(origin + '/api/documents/demo-doc-01/comments', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ body: `Проверка сохранности Docker ${run}` }) });
    assert.equal(response.status, 201); const item = (await response.json()).item; assert.equal(item.status, 'PUBLISHED'); commentId = item.id;
    const change = async (path, method, body, session = cookie, extra = {}) => fetch(origin + path, { method, headers: { Origin: origin, Cookie: session, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
    assert.equal((await change('/api/me/favorites/demo-doc-01', 'PUT', {})).status, 200);
    const mod = await login(origin, true); modCookie = mod;
    const reply = await change('/api/documents/demo-doc-01/comments', 'POST', { body: 'Ответ для проверки восстановления уведомлений', parentId: commentId }, mod, { 'Idempotency-Key': randomUUID() });
    assert.equal(reply.status, 201); replyId = (await reply.json()).item.id;
    assert.equal((await change('/api/me/notification-settings', 'PATCH', { notifyReplies: false, notifyModeration: true })).status, 200);
    const png = await fetch(origin + '/api/files/demo-scan-1'); assert.equal(png.status, 200);
    const expected = JSON.parse(await readFile('data/scans/manifest.json','utf8'))[0];
    assert.equal(createHash('sha256').update(Buffer.from(await png.arrayBuffer())).digest('hex'), expected.sha256);
  });
  await check('CMS creates independent reviewed translations and archive hierarchy in Compose', async () => {
    compose(project, ['run','--rm','--no-deps','-e','STAFF_ADMIN_EMAIL','-e','STAFF_ADMIN_NAME','-e','STAFF_ADMIN_PASSWORD','setup','node','--import','tsx','scripts/bootstrap-staff.ts']);
    const origin = config.BETTER_AUTH_URL;
    // The synchronous tools container can outlive HTTP keep-alive sockets. Resume with a safe GET.
    await waitHealthy(origin);
    const logged = await fetch(origin + '/api/auth/sign-in/email', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:config.STAFF_ADMIN_EMAIL,password:config.STAFF_ADMIN_PASSWORD})});
    assert.equal(logged.status, 200); staffCookie=logged.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
    const change = async (path, body, cookie=staffCookie, method='POST') => {
      const response=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
      assert.ok(response.ok, `${path}: ${response.status}`);return (await response.json()).item;
    };
    const moderator=await(await fetch(origin+'/api/me',{headers:{Cookie:modCookie}})).json();
    await change('/admin/assignments',{userId:moderator.item.id,roleId:'EDITOR',branchId:null});
    const branch=await change('/admin/branches',{code:'docker-'+run,name:'Учебный филиал',isDemo:true});
    branchId=branch.id;
    await change('/admin/branches/'+branch.id,{code:branch.code,name:branch.name,isDemo:true,isPublic:true,expectedUpdatedAt:branch.updatedAt},staffCookie,'PATCH');
    const fund=await change('/admin/catalog/funds',{branchId:branch.id,number:'0007',name:'Демо фонд',description:'Учебная иерархия'});fundId=fund.id;
    const inventory=await change('/admin/catalog/inventories',{fundId,number:'0001',title:'Учебная опись'});
    const archiveCase=await change('/admin/catalog/cases',{fundId,inventoryId:inventory.id,number:'0003',title:'Учебное дело'});
    const payload={title:'Демо CMS Docker',body:'Учебный материал для проверки восстановления.',rights:'ALEteam CC0-1.0',sourceNote:'Оригинальные учебные данные'};
    cmsSlug='docker-cms-'+run;
    const item=await change('/admin/content',{slug:cmsSlug,kind:'EXHIBITION',isDemo:true,locale:'ru',payload});cmsId=item.id;
    for(const locale of ['ru','en']){
      let revision=locale==='ru'?item.revisions[0]:await change(`/admin/content/${cmsId}/revisions`,{locale,payload:{...payload,title:'Demo CMS Docker'}});
      for(const status of ['IN_REVIEW','APPROVED','PUBLISHED'])revision=await change(`/admin/revisions/${revision.id}/transition`,{status,expectedUpdatedAt:revision.updatedAt,reason:'Учебная проверка Docker'},status==='APPROVED'?modCookie:staffCookie);
    }
    const catalogue=await change('/admin/catalog/documents',{fundId,caseId:archiveCase.id,reference:'DOCKER-'+run,year:1930,yearTo:1940,type:'PHOTO',originalLanguage:'kk',title:'Учебная карточка Docker',description:'Учебная проверка восстановления каталога',rights:'ALEteam CC0-1.0',sourceNote:'Авторские учебные данные',category:'Образование',tags:['Книги'],internalNotes:'PRIVATE_DOCKER_CATALOG_NOTE'});catalogueId=catalogue.id;
    const detail=await(await fetch(origin+'/api/admin/catalog/documents/'+catalogueId,{headers:{Cookie:staffCookie}})).json();
    for(const locale of ['ru','en']){
      let revision=locale==='ru'?detail.item.contentItem.revisions[0]:await change('/admin/catalog/documents/'+catalogueId+'/revisions',{locale,payload:{title:'Docker catalogue EN',description:'Original demonstration catalogue text',rights:'ALEteam CC0-1.0',sourceNote:'Original demo'}});
      for(const status of ['IN_REVIEW','APPROVED','PUBLISHED'])revision=await change(`/admin/revisions/${revision.id}/transition`,{status,expectedUpdatedAt:revision.updatedAt,reason:'Учебная проверка карточки'},status==='APPROVED'?modCookie:staffCookie);
    }
    // Only this isolated fixture database: keep existing login checks within their rate window.
    compose(project,['exec','-T','db','psql','-U','archive_app','-d','archive','-c','DELETE FROM "RateLimit"']);
  });
  await check('standalone stages private bytes, independently publishes a file and commits metadata drafts', async () => {
    const origin=config.BETTER_AUTH_URL;
    const post=async(route,body,cookie=staffCookie)=>{
      const r=await fetch(origin+'/api'+route,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
      assert.equal(r.status,route==='/admin/uploads'||route==='/admin/imports'?201:200,route);return(await r.json()).item;
    };
    const bytes=await readFile('data/scans/demo-doc-01.png');uploadedSha256=createHash('sha256').update(bytes).digest('hex');
    const receive=async name=>{
      const row=await post('/admin/uploads',{documentId:'demo-doc-01',originalName:name,mimeType:'image/png',expectedBytes:bytes.length,expectedSha256:uploadedSha256,rights:'ALEteam CC0-1.0',sourceNote:'Original synthetic Docker fixture'});
      const r=await fetch(origin+'/api/admin/uploads/'+row.id+'/content',{method:'PUT',headers:{Origin:origin,Cookie:staffCookie,'Content-Type':'image/png','If-Match':'"'+row.updatedAt+'"'},body:new Uint8Array(bytes)});
      assert.equal(r.status,200);return(await r.json()).item;
    };
    let row=await receive('Docker-published.png');assert.equal(row.state,'QUARANTINED');
    row=await post('/admin/uploads/'+row.id+'/review',{expectedUpdatedAt:row.updatedAt,decision:'APPROVE',rightsConfirmed:true,reason:'Original Docker byte fixture'},modCookie);
    row=await post('/admin/uploads/'+row.id+'/publish',{expectedUpdatedAt:row.updatedAt,downloadable:true});uploadFileId=row.fileId;previewFileId='preview-'+row.id;assert.equal(row.inspection.fullFormatParsing,true);assert.equal((await fetch(origin+'/api/files/'+previewFileId)).status,200);
    const privateRow=await receive('Docker-quarantine.png');quarantinedId=privateRow.id;assert.equal(privateRow.state,'QUARANTINED');
    const manifest=JSON.parse(await readFile('data/artur/import-fixture.json','utf8'));manifest.branchId=branchId;manifest.sourceNamespace='docker-source-'+run;
    manifest.funds[0].number='0107';manifest.funds[1].number='0108';for(const document of manifest.documents)document.metadata.reference='DEMO-DOCKER-'+run+'-'+document.sourceId;
    let batch=await post('/admin/imports',manifest);assert.equal(batch.state,'READY');importDigest=batch.digest;
    batch=await post('/admin/imports/'+batch.id+'/commit',{expectedUpdatedAt:batch.updatedAt,digest:batch.digest});importId=batch.id;importedIds=batch.createdDocuments.map(d=>d.id);assert.equal(importedIds.length,2);
    assert.equal((await fetch(origin+'/api/files/upload-'+quarantinedId)).status,404);
    for(const id of importedIds)assert.equal((await fetch(origin+'/api/documents/'+id)).status,404);
  });
  await check('new source, spreadsheet and discovery records are private and persist before backup',async()=>{
    const origin=config.BETTER_AUTH_URL,cookie=await login(origin);
    const api=async(route,method='GET',body,c=staffCookie)=>{const response=await fetch(origin+'/api'+route,{method,headers:{Origin:origin,Cookie:c,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(response.ok,route+': '+response.status);return response.json();};
    const source=(await api('/discovery/materials/cms/'+cmsId)).source;
    const topic=(await api('/admin/discovery/facts','POST',{kind:'TOPIC',sources:[source],data:{labels:{ru:{title:'ДЕМО тема Docker'}}}})).item;discoveryTopicId=topic.id;
    await api('/admin/discovery/facts/'+topic.id+'/verify','POST',{expectedUpdatedAt:topic.updatedAt},modCookie);
    await api('/me/interests','PUT',{topicIds:[topic.id],personalizationEnabled:true,historyEnabled:false},cookie);
    const sub=await api('/me/topic-subscriptions','POST',{locale:'ru',filters:{q:'Учебная карточка Docker'}},cookie);discoverySubId=sub.item.id;
    const draft=await api('/admin/source-drafts','POST',{package:'archive-20261110',mode:'cms',mappings:[{sourceKey:'contacts',slug:'docker-source-contacts-'+run}]});sourceDraftId=draft.item.id;
    await api('/admin/source-drafts/'+sourceDraftId+'/commit','POST',{});
    const csv=Buffer.from('number,name\n0007-а,ДЕМО фонд\n');
    const preview=await api('/admin/file-previews','POST',{branchId,sourceNamespace:'docker-fund-preview',format:'csv',base64:csv.toString('base64'),mapping:{sheet:'Sheet1',startRow:2,mode:'funds',columns:{number:{column:1},name:{column:2}},defaults:{}}});filePreviewId=preview.item.id;assert.equal(preview.item.result.mappedRows[0].values.number,'0007-а');
    assert.equal((await fetch(origin+'/api/admin/file-previews/'+filePreviewId)).status,401);
    const result=compose(project,['run','--rm','--no-deps','setup','node','--import','tsx','scripts/process-upload-inspections.ts']);assert.ok(result.includes('"passed":1'));
    const repeated=compose(project,['run','--rm','--no-deps','setup','node','--import','tsx','scripts/process-upload-inspections.ts']);assert.ok(repeated.includes('"processed":0'));
    await waitHealthy(origin);
    const privateJob=(await api('/admin/uploads/'+quarantinedId+'/inspection')).item;assert.equal(privateJob.state,'PASSED');assert.equal((await fetch(origin+'/api/files/upload-'+quarantinedId)).status,404);
  });
  await check('optional workers profile runs bounded batches and stops without changing public visibility',async()=>{
    compose(project,['--profile','workers','up','-d','--wait','jobs']);
    let observed=false;for(let i=0;i<50;i++){if(compose(project,['logs','--no-color','jobs']).includes('"inspected":')){observed=true;break;}await delay(200);}assert.ok(observed);
    compose(project,['stop','jobs']);assert.equal((await fetch(config.BETTER_AUTH_URL+'/api/files/upload-'+quarantinedId)).status,404);
  });
  await check('search and real PNG preview timing is recorded on the declared synthetic corpus',async()=>{
    const origin=config.BETTER_AUTH_URL,catalog=await(await fetch(origin+'/api/documents')).json();
    for(const [name,route]of [['catalog_search','/api/documents?q='+encodeURIComponent('Учебная')],['png_preview','/api/files/'+previewFileId]]){
      const times=[];for(let i=0;i<12;i++){const start=performance.now();const response=await fetch(origin+route);assert.equal(response.status,200);await response.arrayBuffer();times.push(performance.now()-start);}times.sort((a,b)=>a-b);
      measurements.push({name,requests:times.length,p50Ms:Math.round(times[5]*100)/100,p95Ms:Math.round(times[11]*100)/100,publicDocuments:catalog.total,corpus:'synthetic seeded demo plus this isolated workflow; not S09 funds',runtime:'Node 24 Linux Docker local loopback; sequential requests; includes full response bytes',browser:'Node fetch; Lighthouse not measured'});
    }
  });
  await check('compiled standalone assistant retains chained date bounds and refuses contradictions',async()=>{
    const origin=config.BETTER_AUTH_URL,cookie=await login(origin);
    const history=[{role:'user',content:'photos in the 1930s'},{role:'user',content:'and after 1930'}];
    const ask=async question=>{const r=await fetch(origin+'/api/assistant',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({question,locale:'ru',history})});assert.equal(r.status,200);return r.json();};
    const result=await ask('and before 1940');assert.equal(result.catalogQuery.yearFrom,1931);assert.equal(result.catalogQuery.yearTo,1939);assert.deepEqual(result.sources.map(s=>s.id),[catalogueId]);
    assert.ok(!result.answer.includes('Учебная проверка восстановления каталога'));
    const invalid=await ask('and before 1920');assert.equal(invalid.noAnswer,true);assert.deepEqual(invalid.sources,[]);assert.equal(invalid.catalogQuery,undefined);
  });
  await check('database and app restart preserve the marker comment and file volume', async () => {
    compose(project, ['restart','db','app']); compose(project, ['up','-d','--wait','--no-build','app']);
    await waitHealthy(config.BETTER_AUTH_URL);
    const data = await (await fetch(config.BETTER_AUTH_URL + '/api/documents/demo-doc-01/comments')).json(); assert.ok(data.items.some(c => c.id === commentId));
    assert.equal((await fetch(config.BETTER_AUTH_URL + '/api/files/demo-scan-1')).status, 200);
  });
  await check('backup includes private database and files with an integrity manifest', async () => {
    execFileSync(process.execPath, ['deploy/backup.mjs','--project',project,'--env',envFile,'--directory',`${folder}/backup`], { env: environment(project), stdio: 'pipe' });
    const manifest = JSON.parse(await readFile(`${folder}/backup/manifest.json`,'utf8')); assert.equal(manifest.files.length, 2); assert.ok(manifest.files.every(f => f.size > 0));
  });
  await check('same-project, corrupted-backup and occupied-volume restore fail before changing resources', async () => {
    const same = spawnSync(process.execPath, ['deploy/restore.mjs','--project',project,'--env',envFile,'--directory',`${folder}/backup`], { env: environment(project), stdio: 'pipe' }); assert.notEqual(same.status, 0);
    await cp(`${folder}/backup`, `${folder}/corrupt`, { recursive: true }); await appendFile(`${folder}/corrupt/database.dump`, 'corruption');
    const badProject = `${project}-bad`;
    const bad = spawnSync(process.execPath, ['deploy/restore.mjs','--project',badProject,'--env',restoreEnvFile,'--directory',`${folder}/corrupt`], { env: environment(restored), stdio: 'pipe' }); assert.notEqual(bad.status, 0);
    assert.equal(docker(['volume','ls','--filter',`label=com.docker.compose.project=${badProject}`,'--format','{{.Name}}']), '');
    const name = `${badProject}_postgres_data`;
    assert.ok(!docker(['volume','ls','--format','{{.Name}}']).split('\n').includes(name));
    docker(['volume','create',name]); reservedVolume = name;
    const occupied = spawnSync(process.execPath, ['deploy/restore.mjs','--project',badProject,'--env',restoreEnvFile,'--directory',`${folder}/backup`], { env: environment(restored), stdio: 'pipe' }); assert.notEqual(occupied.status, 0);
    assert.equal(docker(['ps','-aq','--filter',`label=com.docker.compose.project=${badProject}`]), '');
  });
  await check('restore to a fresh project recovers the marker, users and exact file bytes', async () => {
    execFileSync(process.execPath, ['deploy/restore.mjs','--project',restored,'--env',restoreEnvFile,'--directory',`${folder}/backup`], { env: environment(restored), stdio: 'pipe' });
    const origin = restoreConfig.BETTER_AUTH_URL;
    await waitHealthy(origin);
    assert.equal((await fetch(origin + '/api/health')).status, 200); await login(origin);
    const comments = await (await fetch(origin + '/api/documents/demo-doc-01/comments')).json(); assert.ok(comments.items.some(c => c.id === commentId));
    const png = Buffer.from(await (await fetch(origin + '/api/files/demo-scan-1')).arrayBuffer());
    const expected = JSON.parse(await readFile('data/scans/manifest.json','utf8'))[0]; assert.equal(createHash('sha256').update(png).digest('hex'), expected.sha256);
    assert.equal(compose(restored,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "ArchiveFile"']), '12');
  });
  await check('CMS roles, hierarchy, translations, private history and notices survive backup and restore', async () => {
    for(const origin of [config.BETTER_AUTH_URL,restoreConfig.BETTER_AUTH_URL]){
      const get=async path=>{const response=await fetch(origin+'/api'+path,{headers:{Cookie:staffCookie}});assert.equal(response.status,200);return response.json();};
      const roles=await get('/admin/roles');assert.equal(roles.items.length,7);
      const ru=await get('/content/'+cmsSlug);const en=await get('/content/'+cmsSlug+'?locale=en');assert.equal(ru.item.id,cmsId);assert.equal(en.item.payload.title,'Demo CMS Docker');assert.deepEqual(en.item.availableLocales,['en','ru']);
      const content=await get('/admin/content/'+cmsId);assert.equal(content.items[0].revisions.length,2);
      const history=await get('/admin/revisions/'+content.items[0].revisions[0].id+'/events');assert.equal(history.total,3);
      const notices=await get('/admin/notices');assert.ok(notices.total>0);
      const inventory=await get('/admin/catalog/inventories?fundId='+fundId);assert.equal(inventory.items[0].number,'0001');
      const cases=await get('/admin/catalog/cases?fundId='+fundId);assert.equal(cases.items[0].number,'0003');
    }
  });
  await check('catalog publication snapshots, translations and copy restrictions survive restore', async () => {
    for(const origin of [config.BETTER_AUTH_URL,restoreConfig.BETTER_AUTH_URL]){
      const ru=await(await fetch(origin+'/api/documents/'+catalogueId)).json();assert.equal(ru.item.title,'Учебная карточка Docker');assert.equal(ru.item.allowDigitalCopy,false);assert.deepEqual(ru.item.files,[]);assert.equal(ru.item.internalNotes,undefined);
      const en=await(await fetch(origin+'/api/documents/'+catalogueId+'?locale=en')).json();assert.equal(en.item.title,'Docker catalogue EN');assert.deepEqual(en.item.availableLocales,['en','ru']);assert.equal(en.item.originalLanguage,'kk');
      const found=await(await fetch(origin+'/api/documents?fundId='+fundId+'&fundNumber=0007&inventoryNumber=0001&caseNumber=0003&yearFrom=1935&yearTo=1936&category='+encodeURIComponent('Образование'))).json();assert.deepEqual(found.items.map(d=>d.id),[catalogueId]);
      const detail=await(await fetch(origin+'/api/admin/catalog/documents/'+catalogueId,{headers:{Cookie:staffCookie}})).json();assert.equal(detail.item.contentItem.revisions.length,2);assert.equal(detail.item.internalNotes,'PRIVATE_DOCKER_CATALOG_NOTE');
    }
  });
  await check('published and quarantined upload bytes plus import provenance survive restore exactly',async()=>{
    for(const origin of [config.BETTER_AUTH_URL,restoreConfig.BETTER_AUTH_URL]){
      const publicFile=await fetch(origin+'/api/files/'+uploadFileId+'?download=1');assert.equal(publicFile.status,200);assert.equal(createHash('sha256').update(Buffer.from(await publicFile.arrayBuffer())).digest('hex'),uploadedSha256);
      const get=async route=>{const r=await fetch(origin+'/api'+route,{headers:{Cookie:staffCookie}});assert.equal(r.status,200);return r;};
      const privateRow=(await(await get('/admin/uploads/'+quarantinedId)).json()).item;assert.equal(privateRow.state,'QUARANTINED');assert.equal(privateRow.actualSha256,uploadedSha256);
      const privateBytes=await get('/admin/uploads/'+quarantinedId+'/content');assert.equal(createHash('sha256').update(Buffer.from(await privateBytes.arrayBuffer())).digest('hex'),uploadedSha256);
      assert.equal((await fetch(origin+'/api/files/upload-'+quarantinedId)).status,404);
      const batch=(await(await get('/admin/imports/'+importId)).json()).item;assert.equal(batch.state,'COMMITTED');assert.equal(batch.digest,importDigest);assert.equal(batch.createdDocuments.length,2);
      const exported=await(await get('/admin/imports/'+importId+'/export')).json();assert.equal(exported.currentValidation.valid,true);assert.equal(exported.currentValidation.counts.unchanged,2);
      assert.deepEqual(exported.materialized.map(row=>row.sourceId).sort(),['000009','000010']);assert.deepEqual(exported.materialized.map(row=>row.document.fund.number).sort(),['0107','0108']);
      for(const row of exported.materialized){assert.equal(row.document.isPublic,false);assert.ok(row.document.contentItem.revisions.every(r=>r.status==='DRAFT'));}
      for(const id of importedIds)assert.equal((await fetch(origin+'/api/documents/'+id)).status,404);
    }
  });
  await check('new discovery baselines, source bindings, original spreadsheet bytes and parsed previews survive restore',async()=>{
    for(const name of [project,restored]){
      const origin=name===project?config.BETTER_AUTH_URL:restoreConfig.BETTER_AUTH_URL,cookie=await login(origin);
      const get=async(route,c=staffCookie)=>{const r=await fetch(origin+'/api'+route,{headers:{Cookie:c}});assert.equal(r.status,200);return r.json();};
      const subs=await get('/me/topic-subscriptions',cookie);assert.ok(subs.items.some(s=>s.id===discoverySubId));assert.equal((await get('/me/topic-notifications',cookie)).items.length,0);
      assert.equal((await get('/me/interests',cookie)).item.topicIds[0],discoveryTopicId);
      assert.equal((await get('/admin/source-drafts/'+sourceDraftId)).item.status,'COMMITTED');
      assert.equal((await get('/admin/file-previews/'+filePreviewId)).item.result.mappedRows[0].values.number,'0007-а');
      assert.equal(compose(name,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT count(*) FROM "SourceDraftBinding"']),'1');
      const bytes=await readFile('data/scans/demo-doc-01.png');const preview=await fetch(origin+'/api/files/'+previewFileId);assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/png');
      assert.equal(compose(name,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc',`SELECT count(*) FROM "UploadInspectionJob" WHERE state='PASSED'`]),'2');
      const bundled=compose(name,['exec','-T','app','node','-e',`const fs=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(fs.readFileSync('/data/files/source-bundles/archive-20261110/manifest.json')).digest('hex'))`]);assert.equal(bundled,createHash('sha256').update(await readFile('sources/archive-20261110/manifest.json')).digest('hex'));
      const storedHash=compose(name,['exec','-T','db','psql','-U','archive_app','-d','archive','-tAc','SELECT "sourceHash" FROM "FileImportPreview"']);assert.equal(storedHash,createHash('sha256').update(Buffer.from('number,name\n0007-а,ДЕМО фонд\n')).digest('hex'));
    }
  });
  await check('favorites, notification preferences and reply events survive restart and restore', async () => {
    for (const origin of [config.BETTER_AUTH_URL, restoreConfig.BETTER_AUTH_URL]) {
      const cookie = await login(origin);
      const get = async path => (await fetch(origin + path, { headers: { Cookie: cookie } })).json();
      const favorites = await get('/api/me/favorites'); assert.equal(favorites.total, 1); assert.equal(favorites.items[0].id, 'demo-doc-01');
      const preferences = await get('/api/me/notification-settings'); assert.equal(preferences.item.notifyReplies, false);
      const notifications = await get('/api/me/notifications'); assert.equal(notifications.total, 1); assert.equal(notifications.items[0].commentId, replyId);
      const ocr = await get('/api/files/demo-scan-1/ocr'); assert.equal(ocr.item.isOcr, true); assert.ok(ocr.item.text.length > 100);
    }
  });
} catch (error) {
  process.exitCode = 1;
  let diagnostic = String(error.stderr ?? error.stack ?? error.message);
  if(error.cause)diagnostic += '\nCause: ' + String(error.cause.code ?? error.cause.name);
  try { diagnostic += '\n' + compose(project, ['logs','--no-color','--tail','80']); } catch { /* retain available evidence */ }
  for (const [name,value] of Object.entries(config)) if (/PASSWORD|SECRET|KEY/.test(name) && value) diagnostic = diagnostic.replaceAll(value, '[REDACTED]');
  await writeFile(`${folder}/failure.log`, diagnostic, { mode: 0o600 });
  console.log(`FAIL deployment validation (${error.name}); private redacted diagnosis: ${folder}/failure.log`);
}
finally {
  for (const name of [restored, project]) {
    try { compose(name, ['down','--volumes','--remove-orphans']); } catch { /* only this test run's unique projects are eligible for cleanup */ }
  }
  if (reservedVolume) docker(['volume','rm',reservedVolume]);
  await unlink(envFile).catch(()=>{});await unlink(restoreEnvFile).catch(()=>{});
  await writeFile('.local/deploy-validation.json', JSON.stringify({ testedAt: new Date().toISOString(), target: 'isolated local Docker projects, not a public deployment', checks, measurements, backupRetainedPrivately: true, temporaryEnvFilesRemoved:true }, null, 2) + '\n');
  console.log(`Deployment checks: ${checks.filter(c => c.passed).length}/${checks.length}`);
}
