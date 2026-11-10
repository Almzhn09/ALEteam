import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {spawn, execFileSync, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdir, readFile, readdir, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {hashPassword} from 'better-auth/crypto';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw Error('Dedicated TEST_DATABASE_URL ending in _test required');
process.env.DATABASE_URL = url;
const {db} = await import('../src/server/db');
const origin = 'http://localhost:3089', prefix = 'upload-test-', password = randomBytes(32).toString('hex');
const root = process.env.FILE_STORAGE_ROOT ?? '.local/files';
const env = {...process.env, DATABASE_URL: url, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  ALLOW_DEMO_SEED: '1', DEMO_AUTHOR_PASSWORD: password, DEMO_MODERATOR_PASSWORD: password};
let app: ChildProcess, writer: string, reviewer: string, foreign: string, visitor: string, admin: string;
let documentId: string, restrictedId: string;
const bytes = await readFile('data/scans/demo-doc-01.png');
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const proof: Record<string, boolean | number | string> = {syntheticData: true};
async function call(route: string, method = 'GET', body?: unknown, cookie?: string) {
  return fetch(origin + '/api' + route, {method, headers: {Origin: origin, ...(cookie ? {Cookie: cookie} : {}), ...(body === undefined ? {} : {'Content-Type': 'application/json'})}, body: body === undefined ? undefined : JSON.stringify(body)});
}
async function ok(route: string, method = 'GET', body?: unknown, cookie = writer, expected = 200) {
  const r = await call(route, method, body, cookie); assert.equal(r.status, expected, method + ' ' + route); return r.json();
}
async function clean() {
  const derivatives=await db.uploadInspectionJob.findMany({where:{upload:{document:{fund:{branchId:{startsWith:prefix}}}}},select:{previewStorageKey:true}});for(const job of derivatives)if(job.previewStorageKey)await unlink(path.join(root,job.previewStorageKey)).catch(()=>{});
  const rows = await db.archiveUpload.findMany({where: {document: {fund: {branchId: {startsWith: prefix}}}}, select: {storageKey: true}});
  for (const row of rows) if (row.storageKey) await unlink(path.join(root, row.storageKey)).catch(() => {});
  await db.archiveUpload.deleteMany({where: {document: {fund: {branchId: {startsWith: prefix}}}}});
  const docs = await db.document.findMany({where: {fund: {branchId: {startsWith: prefix}}}, select: {id: true, contentItemId: true}});
  await db.archiveFile.deleteMany({where: {documentId: {in: docs.map(d => d.id)}}}); await db.document.deleteMany({where: {id: {in: docs.map(d => d.id)}}});
  const ids = docs.flatMap(d => d.contentItemId ? [d.contentItemId] : []);
  await db.editorialNotice.deleteMany({where: {revision: {itemId: {in: ids}}}}); await db.publicationEvent.deleteMany({where: {revision: {itemId: {in: ids}}}});
  await db.contentRevision.deleteMany({where: {itemId: {in: ids}}}); await db.contentItem.deleteMany({where: {id: {in: ids}}});
  await db.fund.deleteMany({where: {branchId: {startsWith: prefix}}});
  await db.auditEvent.deleteMany({where: {actorId: {startsWith: prefix}}}); await db.staffAssignment.deleteMany({where: {userId: {startsWith: prefix}}});
  await db.session.deleteMany({where: {userId: {startsWith: prefix}}}); await db.account.deleteMany({where: {userId: {startsWith: prefix}}}); await db.user.deleteMany({where: {id: {startsWith: prefix}}});
  await db.archiveBranch.deleteMany({where: {id: {startsWith: prefix}}});
}
async function publishRevision(revision: {id: string; updatedAt: string}) {
  let r = revision;
  for (const status of ['IN_REVIEW','APPROVED','PUBLISHED']) r = (await ok('/admin/revisions/' + r.id + '/transition', 'POST', {status, expectedUpdatedAt: r.updatedAt, reason: 'Original upload fixture approval'}, status === 'IN_REVIEW' ? writer : reviewer)).item;
  return r;
}
async function createUpload(doc = documentId, patch = {}) {
  return (await ok('/admin/uploads', 'POST', {documentId: doc, originalName: 'Original.png', mimeType: 'image/png', expectedBytes: bytes.length,
    expectedSha256: sha(bytes), rights: 'ALEteam CC0-1.0', sourceNote: 'Original synthetic PNG', ...patch}, writer, 201)).item;
}
async function put(row: {id: string; updatedAt: string; mimeType?: string}, content: Buffer = bytes, cookie = writer) {
  return fetch(origin + '/api/admin/uploads/' + row.id + '/content', {method: 'PUT', headers: {Origin: origin, Cookie: cookie,
    'Content-Type': row.mimeType ?? 'image/png', 'If-Match': '"' + row.updatedAt + '"'}, body: new Uint8Array(content)});
}
async function stage(row: {id: string; updatedAt: string; mimeType?: string}, content = bytes) {const r = await put(row, content); assert.equal(r.status, 200); return (await r.json()).item;}
async function approve(row: {id: string; updatedAt: string}) {return (await ok('/admin/uploads/' + row.id + '/review', 'POST', {expectedUpdatedAt: row.updatedAt, decision: 'APPROVE', rightsConfirmed: true, reason: 'PRIVATE_REVIEW_REASON'}, reviewer)).item;}
before(async () => {
  execFileSync(process.execPath, ['--import','tsx','scripts/migrate.ts'], {env, stdio: 'pipe'}); await clean();
  execFileSync(process.execPath, ['--import','tsx','prisma/seed.ts'], {env, stdio: 'pipe'});
  for (const suffix of ['a','b']) await db.archiveBranch.create({data: {id: prefix + suffix, code: prefix + suffix, name: 'DEMO upload branch ' + suffix, isPublic: true}});
  const hash = await hashPassword(password);
  for (const [who, roleId, branchId] of [['writer','ARCHIVIST',prefix+'a'],['reviewer','EDITOR',null],['foreign','ARCHIVIST',prefix+'b'],['admin','SUPERADMIN',null],['visitor',null,null]] as const) {
    const id = prefix + who; await db.user.create({data: {id, name: who, email: id + '@example.test', emailVerified: true,
      accounts: {create: {id: randomUUID(), providerId: 'credential', accountId: id, password: hash}}}});
    if (roleId) await db.staffAssignment.create({data: {userId: id, roleId, branchId, scopeKey: branchId ?? '*'}});
  }
  // Even with review permission the uploader cannot approve their own bytes.
  await db.staffAssignment.create({data: {userId: prefix+'writer', roleId: 'EDITOR', branchId: prefix+'a', scopeKey: prefix+'a'}});
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','--port','3089'], {env, stdio: 'ignore'});
  let ready = false; for (let i=0;i<100;i++) {if (app.exitCode !== null) throw Error('Upload app exited'); try {if ((await fetch(origin+'/api/health')).ok) {ready=true;break;}} catch {} await delay(100);} assert.ok(ready);
  const cookies: string[] = [];
  for (const who of ['writer','reviewer','foreign','visitor','admin']) {await db.rateLimit.deleteMany(); const r=await call('/auth/sign-in/email','POST',{email:prefix+who+'@example.test',password}); assert.equal(r.status,200);cookies.push(r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '));}
  [writer,reviewer,foreign,visitor,admin]=cookies;
  const fund=(await ok('/admin/catalog/funds','POST',{branchId:prefix+'a',number:'0007',name:'DEMO upload fund',description:'Original fixture'},writer,201)).item;
  const create=async(copy:boolean)=>{
    const d=await ok('/admin/catalog/documents','POST',{fundId:fund.id,title:'DEMO upload '+copy,description:'Original upload workflow fixture.',reference:'DEMO-UPLOAD-'+randomUUID(),year:1960,type:'PHOTO',rights:'ALEteam CC0-1.0',sourceNote:'Original fixture'},writer,201);
    const r=(await ok('/admin/revisions/'+d.revision.id,'PATCH',{expectedUpdatedAt:d.revision.updatedAt,payload:{...d.revision.payload,allowDigitalCopy:copy}},writer)).item;
    await publishRevision(r);return d.item.id;
  };
  documentId=await create(true);restrictedId=await create(false);
}, {timeout: 120000});
after(async () => {if(app?.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}await mkdir('.local/uploads',{recursive:true});await writeFile('.local/uploads/report.json',JSON.stringify(proof,null,2)+'\n');await clean();await db.$disconnect();});

test('upload creation is scoped, strict and never creates a public file',async()=>{
  assert.equal((await call('/admin/uploads')).status,401);assert.equal((await call('/admin/uploads','GET',undefined,visitor)).status,403);
  const row=await createUpload();assert.equal(row.state,'AWAITING_CONTENT');assert.equal(row.fileId,null);assert.equal(row.inspection.antivirus,'not-configured');
  for(const key of ['storageKey','receiveToken','document'])assert.ok(!(key in row));
  assert.equal((await call('/admin/uploads/'+row.id,'GET',undefined,foreign)).status,403);
  assert.equal((await ok('/admin/uploads','GET',undefined,foreign)).total,0);
  assert.equal((await call('/admin/uploads/'+row.id+'/content','GET',undefined,writer)).status,404);
  assert.equal((await put(row,bytes,admin)).status,403);
  assert.equal((await call('/files/upload-'+row.id)).status,404);
  const normal={documentId,originalName:'Original.png',mimeType:'image/png',expectedBytes:bytes.length,expectedSha256:sha(bytes),rights:'CC0-1.0',sourceNote:'Fixture'};
  for(const patch of [{state:'PUBLISHED'},{storageKey:'/tmp/private'},{uploaderId:prefix+'admin'},{mimeType:'image/tiff'},{originalName:'../Original.png'}])assert.equal((await call('/admin/uploads','POST',{...normal,...patch},writer)).status,400);
  proof.scopedCreationAndStrictMetadata=true;proof.noAutomaticPublication=true;
});
test('real PNG stays quarantined until independent rights review and explicit publication',async()=>{
  let row=await stage(await createUpload());assert.equal(row.state,'QUARANTINED');assert.equal(row.actualSha256,sha(bytes));
  assert.equal((await call('/admin/uploads/'+row.id+'/content')).status,401);
  const preview=await call('/admin/uploads/'+row.id+'/content','GET',undefined,reviewer);assert.equal(preview.status,200);assert.equal(sha(Buffer.from(await preview.arrayBuffer())),sha(bytes));assert.match(preview.headers.get('content-disposition')!,/^attachment/);
  assert.equal((await call('/admin/uploads/'+row.id+'/publish','POST',{expectedUpdatedAt:row.updatedAt},reviewer)).status,409);
  assert.equal((await call('/admin/uploads/'+row.id+'/review','POST',{expectedUpdatedAt:row.updatedAt,decision:'APPROVE',rightsConfirmed:true,reason:'Self approval attempt'},writer)).status,403);
  assert.equal((await call('/admin/uploads/'+row.id+'/review','POST',{expectedUpdatedAt:row.updatedAt,decision:'APPROVE',rightsConfirmed:false,reason:'Missing rights confirmation'},reviewer)).status,400);
  row=await approve(row);assert.equal(row.inspection.fullFormatParsing,true);assert.equal(row.inspection.parserState,'PASSED');assert.equal(row.state,'APPROVED');assert.equal((await call('/files/upload-'+row.id)).status,404);
  const previous=row;row=(await ok('/admin/uploads/'+row.id+'/publish','POST',{expectedUpdatedAt:row.updatedAt,downloadable:true},reviewer)).item;assert.equal(row.state,'PUBLISHED');
  const file=await call('/files/'+row.fileId);assert.equal(file.status,200);assert.equal(sha(Buffer.from(await file.arrayBuffer())),sha(bytes));
  assert.equal((await call('/files/'+row.fileId+'?download=1')).status,200);
  assert.equal((await call('/admin/uploads/'+row.id+'/publish','POST',{expectedUpdatedAt:previous.updatedAt},reviewer)).status,409);
  assert.equal(await db.archiveFile.count({where:{id:row.fileId}}),1);
  const derivative=await db.archiveFile.findUniqueOrThrow({where:{id:'preview-'+row.id}});assert.equal(derivative.parentFileId,row.fileId);assert.equal(derivative.variant,'preview');assert.equal(derivative.downloadable,false);assert.equal((await call('/files/'+derivative.id)).status,200);assert.equal((await call('/files/'+derivative.id+'?download=1')).status,404);
  await db.archiveFile.update({where:{id:derivative.id},data:{isPublic:false}});assert.equal((await call('/files/'+derivative.id)).status,404);await db.archiveFile.update({where:{id:derivative.id},data:{isPublic:true}});
  const publicMetadata=JSON.stringify((await ok('/documents/'+documentId,'GET',undefined,visitor)).item);assert.ok(!publicMetadata.includes('PRIVATE_REVIEW_REASON'));assert.ok(!publicMetadata.includes('uploaderId'));
  proof.independentReviewAndExplicitPublish=true;proof.realPngBytesVerified=true;
});
test('existing original generated PDF passes the same private-to-reviewed publication path',async()=>{
  const original=await db.archiveFile.findUniqueOrThrow({where:{id:'demo-file-1'}});const pdf=await readFile(path.join(root,original.storageKey));
  const created=await createUpload(documentId,{originalName:'Original.pdf',mimeType:'application/pdf',expectedBytes:pdf.length,expectedSha256:sha(pdf)});
  let row=await approve(await stage(created,pdf));row=(await ok('/admin/uploads/'+row.id+'/publish','POST',{expectedUpdatedAt:row.updatedAt},reviewer)).item;
  const response=await call('/files/'+row.fileId);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(pdf));
  assert.equal((await call('/files/'+row.fileId+'?download=1')).status,404);
  const text=(await ok('/files/'+row.fileId+'/text','GET',undefined,visitor)).item;assert.equal(text.isOcr,false);assert.equal(text.sourceSha256,sha(pdf));assert.ok(text.text.length>0);assert.equal(text.fragments[0].page,1);
  const explained=await ok('/documents/'+documentId+'/explanation','POST',{locale:'en'},visitor);assert.equal(explained.status,'ready');assert.equal(explained.mode,'extractive');assert.equal(explained.ocr.used,false);assert.ok(explained.citations.some((c:{source:{fragment:{page?:number}}})=>c.source.fragment.page===1));
  const job=await db.uploadInspectionJob.findUniqueOrThrow({where:{uploadId:row.id}});await writeFile(path.join(root,job.previewStorageKey!),Buffer.from('corrupted'));assert.equal((await call('/files/'+job.previewFileId)).status,404);
  await db.archiveUpload.update({where:{id:row.id},data:{state:'REJECTED'}});assert.equal((await call('/files/'+row.fileId+'/text')).status,404);assert.equal((await call('/files/'+job.previewFileId)).status,404);
  proof.realGeneratedPdfBytesVerified=true;
});
test('bad bytes fail safely and retry uses the same immutable declaration',async()=>{
  let row=await createUpload();const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
  const failed=await put(row,changed);assert.equal(failed.status,400);row=(await ok('/admin/uploads/'+row.id)).item;assert.equal(row.state,'FAILED');assert.equal(row.failureCode,'UPLOAD_CHECKSUM_MISMATCH');
  row=(await ok('/admin/uploads/'+row.id+'/retry','POST',{expectedUpdatedAt:row.updatedAt})).item;assert.equal(row.state,'AWAITING_CONTENT');row=await stage(row);
  row=(await ok('/admin/uploads/'+row.id+'/review','POST',{expectedUpdatedAt:row.updatedAt,decision:'REJECT',rightsConfirmed:false,reason:'Original demo rejection'},reviewer)).item;assert.equal(row.state,'REJECTED');
  assert.equal((await call('/admin/uploads/'+row.id+'/publish','POST',{expectedUpdatedAt:row.updatedAt},reviewer)).status,409);
  assert.equal((await call('/files/upload-'+row.id)).status,404);
  const html=Buffer.from('<html>not a PNG</html>');const fake=await createUpload(documentId,{expectedBytes:html.length,expectedSha256:sha(html)});
  assert.equal((await put(fake,html)).status,400);assert.equal((await ok('/admin/uploads/'+fake.id)).item.failureCode,'UPLOAD_SIGNATURE_MISMATCH');
  proof.failedChecksumAndSignatureStayPrivate=true;proof.retryAndHumanRejection=true;
});
test('copy restriction and hidden branch block file release and later reads',async()=>{
  const restricted=await approve(await stage(await createUpload(restrictedId)));
  assert.equal((await call('/admin/uploads/'+restricted.id+'/publish','POST',{expectedUpdatedAt:restricted.updatedAt},reviewer)).status,409);
  const row=await approve(await stage(await createUpload()));const published=(await ok('/admin/uploads/'+row.id+'/publish','POST',{expectedUpdatedAt:row.updatedAt},reviewer)).item;
  const branch=await db.archiveBranch.findUniqueOrThrow({where:{id:prefix+'a'}});
  await ok('/admin/branches/'+branch.id,'PATCH',{code:branch.code,name:branch.name,isPublic:false,expectedUpdatedAt:branch.updatedAt.toISOString()},admin);
  try{assert.equal((await call('/files/'+published.fileId)).status,404);assert.equal((await call('/admin/uploads/'+published.id+'/content','GET',undefined,reviewer)).status,200);}
  finally{const current=await db.archiveBranch.findUniqueOrThrow({where:{id:branch.id}});await ok('/admin/branches/'+branch.id,'PATCH',{code:branch.code,name:branch.name,isPublic:true,expectedUpdatedAt:current.updatedAt.toISOString()},admin);}
  const document=await db.document.findUniqueOrThrow({where:{id:documentId}});
  for(const copy of [false,true]){
    const publication=await db.contentRevision.findFirstOrThrow({where:{itemId:document.contentItemId!,locale:'ru',status:'PUBLISHED'}});
    const next=(await ok('/admin/catalog/documents/'+documentId+'/revisions','POST',{locale:'ru',payload:{...(publication.payload as Record<string,unknown>),allowDigitalCopy:copy}},writer,201)).item;
    await publishRevision(next);assert.equal((await call('/files/'+published.fileId)).status,copy?200:404);
  }
  proof.restrictedCopiesAndHiddenBranchesEnforced=true;
});
test('post-review file corruption is denied by both staff preview and public byte delivery',async()=>{
  let row=await approve(await stage(await createUpload()));row=(await ok('/admin/uploads/'+row.id+'/publish','POST',{expectedUpdatedAt:row.updatedAt},reviewer)).item;
  const stored=await db.archiveUpload.findUniqueOrThrow({where:{id:row.id}});const filename=path.join(root,stored.storageKey!);const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
  await writeFile(filename,changed);
  try{assert.equal((await call('/files/'+row.fileId)).status,404);assert.equal((await call('/admin/uploads/'+row.id+'/content','GET',undefined,reviewer)).status,404);}
  finally{await writeFile(filename,bytes);}
  assert.equal((await call('/files/'+row.fileId)).status,200);proof.publishedChecksumRechecked=true;
});
test('parallel PUTs cannot replace or duplicate immutable staged bytes',async()=>{
  const row=await createUpload();const responses=await Promise.all([put(row),put(row)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const current=(await ok('/admin/uploads/'+row.id)).item;assert.equal(current.state,'QUARANTINED');assert.equal(current.actualSha256,sha(bytes));proof.concurrentReceiveIsExclusive=true;
});
test('expired receiver recovery cannot let an old stream overwrite a newer attempt',async()=>{
  const initial=await createUpload();let controller:ReadableStreamDefaultController<Uint8Array>;
  const stream=new ReadableStream<Uint8Array>({start(c){controller=c;c.enqueue(new Uint8Array(bytes.subarray(0,32)));}});
  const old=fetch(origin+'/api/admin/uploads/'+initial.id+'/content',{method:'PUT',headers:{Origin:origin,Cookie:writer,'Content-Type':'image/png','If-Match':'"'+initial.updatedAt+'"'},body:stream,duplex:'half'} as RequestInit & {duplex:'half'});
  let receiving=false;for(let i=0;i<100;i++){if((await db.archiveUpload.findUniqueOrThrow({where:{id:initial.id}})).state==='RECEIVING'){receiving=true;break;}await delay(20);}assert.ok(receiving);
  const past=await db.archiveUpload.update({where:{id:initial.id},data:{updatedAt:new Date(Date.now()-180000)}});
  const retried=(await ok('/admin/uploads/'+initial.id+'/retry','POST',{expectedUpdatedAt:past.updatedAt.toISOString()})).item;
  const current=await stage(retried);controller!.enqueue(new Uint8Array(bytes.subarray(32)));controller!.close();assert.equal((await old).status,409);
  const latest=(await ok('/admin/uploads/'+initial.id)).item;assert.equal(latest.state,'QUARANTINED');assert.equal(latest.updatedAt,current.updatedAt);
  const preview=await call('/admin/uploads/'+initial.id+'/content','GET',undefined,reviewer);assert.equal(preview.status,200);assert.equal(sha(Buffer.from(await preview.arrayBuffer())),sha(bytes));
  proof.expiredReceiverCannotOverwriteRetry=true;
});
test('bounded active upload quota, private DTOs and audit history are enforced',async()=>{
  const base={documentId,uploaderId:prefix+'writer',originalName:'Original.png',mimeType:'image/png',expectedBytes:bytes.length,expectedSha256:sha(bytes),rights:'CC0-1.0',sourceNote:'Synthetic quota fixture'};
  await db.archiveUpload.createMany({data:Array.from({length:100},(_,i)=>({...base,id:prefix+'quota-'+i}))});
  try{const r=await call('/admin/uploads','POST',{...base,uploaderId:undefined},writer);assert.equal(r.status,409);}
  finally{await db.archiveUpload.deleteMany({where:{id:{startsWith:prefix+'quota-'}}});}
  const list=await ok('/admin/uploads');for(const row of list.items)for(const key of ['storageKey','receiveToken','document'])assert.ok(!(key in row));
  const actions=await db.auditEvent.findMany({where:{actorId:{startsWith:prefix}},select:{action:true}});
  for(const action of ['UPLOAD_CREATED','UPLOAD_RECEIVE_STARTED','UPLOAD_CONTENT_VERIFIED','UPLOAD_APPROVED','UPLOAD_REJECTED','UPLOAD_PUBLISHED','UPLOAD_RETRIED','UPLOAD_FAILED'])assert.ok(actions.some(a=>a.action===action),action);
  const staged=await db.archiveUpload.count({where:{documentId:{in:[documentId,restrictedId]},storageKey:{not:null}}});
  assert.equal((await readdir(path.join(root,'uploads'))).length,staged);
  proof.quotaAndAuditVerified=true;proof.retainedStagedFiles=staged;proof.noCompletedAttemptOrphans=true;
});
test('revoking staff grants blocks upload access on the next request of an existing session',async()=>{
  const row=await createUpload();await db.staffAssignment.deleteMany({where:{userId:prefix+'reviewer'}});
  try{assert.equal((await call('/admin/uploads/'+row.id,'GET',undefined,reviewer)).status,403);}
  finally{await db.staffAssignment.create({data:{userId:prefix+'reviewer',roleId:'EDITOR',branchId:null,scopeKey:'*'}});}
  assert.equal((await call('/admin/uploads/'+row.id,'GET',undefined,reviewer)).status,200);proof.revokedGrantIsImmediate=true;
});

test('signature-only fake PNG remains quarantined after parser failure and bounded explicit retry',async()=>{
 const content=Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3]);const created=await createUpload(documentId,{expectedBytes:content.length,expectedSha256:sha(content)});const row=await stage(created,content);
 assert.equal((await call('/admin/uploads/'+row.id+'/review','POST',{expectedUpdatedAt:row.updatedAt,decision:'APPROVE',rightsConfirmed:true,reason:'Full parse required'},reviewer)).status,422);
 assert.equal((await ok('/admin/uploads/'+row.id)).item.state,'QUARANTINED');const state=(await ok('/admin/uploads/'+row.id+'/inspection')).item;assert.equal(state.state,'FAILED');assert.equal(state.attempts,1);assert.ok(!JSON.stringify(state).includes('storageKey'));
 assert.equal((await call('/admin/uploads/'+row.id+'/inspection','GET',undefined,foreign)).status,403);assert.equal((await call('/admin/uploads/'+row.id+'/inspection-retry','POST',{},reviewer)).status,403);
 await ok('/admin/uploads/'+row.id+'/inspection-retry','POST',{},writer);assert.equal((await ok('/admin/uploads/'+row.id+'/inspection')).item.state,'QUEUED');assert.equal((await call('/files/upload-'+row.id)).status,404);
});
