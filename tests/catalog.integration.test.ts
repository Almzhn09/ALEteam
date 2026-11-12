import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {spawn, execFileSync, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {hashPassword} from 'better-auth/crypto';

const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL ending in _test required');
process.env.DATABASE_URL = database;
const {db} = await import('../src/server/db');
const origin = 'http://localhost:3087';
const password = randomBytes(32).toString('hex');
const env = {...process.env, DATABASE_URL: database, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), ALLOW_DEMO_SEED: '1', DEMO_AUTHOR_PASSWORD: password, DEMO_MODERATOR_PASSWORD: password};
let app: ChildProcess;
let admin: string, editor: string, writer: string, branchA: string, branchB: string, visitor: string;
let fundId: string, inventoryId: string, caseId: string;
const branchOne = 'catalog-branch-a', branchTwo = 'catalog-branch-b';
async function call(path: string, method = 'GET', body?: unknown, cookie?: string) {
  return fetch(origin + '/api' + path, {method, headers: {Origin: origin, ...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...(cookie ? {Cookie: cookie} : {})}, body: body === undefined ? undefined : JSON.stringify(body)});
}
async function ok(path: string, method = 'GET', body?: unknown, cookie?: string, status = 200) {
  const response = await call(path, method, body, cookie);
  assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`);
  return response.json();
}
async function clean() {
  await db.document.deleteMany({where: {fund: {branchId: {not: null}}}});
  await db.documentTranslation.deleteMany({where: {revisionId: {not: null}}});
  await db.document.updateMany({where: {contentItemId: {not: null}}, data: {contentItemId: null}});
  await db.editorialNotice.deleteMany(); await db.publicationEvent.deleteMany(); await db.contentRevision.deleteMany(); await db.contentItem.deleteMany();
  await db.auditEvent.deleteMany(); await db.staffAssignment.deleteMany();
  await db.archivalCase.deleteMany(); await db.inventory.deleteMany(); await db.fund.deleteMany({where: {branchId: {not: null}}}); await db.archiveBranch.deleteMany();
  await db.session.deleteMany(); await db.account.deleteMany({where: {user: {email: {startsWith: 'catalog-'}}}}); await db.user.deleteMany({where: {email: {startsWith: 'catalog-'}}});
  await db.apiRateLimit.deleteMany(); await db.rateLimit.deleteMany();
}
before(async () => {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {env, stdio: 'pipe'});
  await clean();
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {env, stdio: 'pipe'});
  const hashed = await hashPassword(password);
  for (const who of ['admin', 'editor', 'writer', 'branch-a', 'branch-b', 'visitor']) await db.user.create({data: {
    id: 'catalog-' + who, name: who, email: `catalog-${who}@example.test`, emailVerified: true,
    accounts: {create: {id: randomUUID(), providerId: 'credential', accountId: 'catalog-' + who, password: hashed}},
  }});
  for (const id of [branchOne, branchTwo]) await db.archiveBranch.create({data: {id, code: id, name: id, isPublic: true}});
  for (const [who, roleId, branchId] of [['admin', 'SUPERADMIN', null], ['editor', 'EDITOR', null], ['writer', 'ARCHIVIST', null], ['branch-a', 'BRANCH_ADMIN', branchOne], ['branch-b', 'BRANCH_ADMIN', branchTwo]] as const) {
    await db.staffAssignment.create({data: {userId: 'catalog-' + who, roleId, branchId, scopeKey: branchId ?? '*'}});
  }
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3087'], {env, stdio: 'ignore'});
  let ready = false;
  for (let i = 0; i < 100; i++) {try {if ((await fetch(origin + '/api/health')).ok) {ready = true; break;}} catch {} await delay(100);}
  assert.ok(ready);
  const cookies: string[] = [];
  for (const who of ['admin', 'editor', 'writer', 'branch-a', 'branch-b', 'visitor']) {
    await db.rateLimit.deleteMany();
    const response = await call('/auth/sign-in/email', 'POST', {email: `catalog-${who}@example.test`, password}); assert.equal(response.status, 200);
    cookies.push(response.headers.getSetCookie().map(s => s.split(';')[0]).join('; '));
  }
  [admin, editor, writer, branchA, branchB, visitor] = cookies;
  fundId = (await ok('/admin/catalog/funds', 'POST', {branchId: branchOne, number: '0007', name: 'Учебный фонд', description: 'Учебные сведения'}, branchA, 201)).item.id;
  inventoryId = (await ok('/admin/catalog/inventories', 'POST', {fundId, number: '0001', title: 'Учебная опись'}, branchA, 201)).item.id;
  caseId = (await ok('/admin/catalog/cases', 'POST', {fundId, inventoryId, number: '0003', title: 'Учебное дело'}, branchA, 201)).item.id;
}, {timeout: 60000});
after(async () => {
  if (app?.exitCode === null) {app.kill('SIGTERM'); await once(app, 'exit');}
  await clean(); await db.$disconnect();
});
const text = (title = 'Учебная библиотека') => ({title, description: 'Оригинальный учебный материал о библиотеке и городе.', rights: 'ALEteam CC0-1.0', sourceNote: 'Авторские учебные данные', authorName: 'Учебный Автор', organization: 'Учебная организация', locality: 'Демо город', category: 'Образование', tags: ['Чтение', 'Книги']});
function metadata(title = 'Учебная библиотека') {return {...text(title), reference: 'CAT-' + randomUUID(), caseId, year: 1930, yearTo: 1940, type: 'PHOTO', originalLanguage: 'kk', leafCount: 2, allowDigitalCopy: false};}
async function create(title?: string) {
  const {allowDigitalCopy: _, ...payload} = metadata(title);
  return ok('/admin/catalog/documents', 'POST', {...payload, fundId, internalNotes: 'PRIVATE_CATALOG_NOTE'}, writer, 201);
}
async function transition(revision: {id: string; updatedAt: string}, status: string, cookie = editor) {
  return (await ok(`/admin/revisions/${revision.id}/transition`, 'POST', {status, expectedUpdatedAt: revision.updatedAt, reason: 'Проверка учебной архивной карточки'}, cookie)).item;
}
async function publish(revision: {id: string; updatedAt: string}, author = writer) {
  let r = await transition(revision, 'IN_REVIEW', author); r = await transition(r, 'APPROVED'); return transition(r, 'PUBLISHED');
}
async function revise(id: string, payload: unknown, locale = 'ru') {return (await ok(`/admin/catalog/documents/${id}/revisions`, 'POST', {locale, payload}, writer, 201)).item;}

test('migration and repeatable seed preserve 20 public legacy cards, files and language identity', async () => {
  assert.equal((await ok('/documents')).total, 20);
  const document = (await ok('/documents/demo-doc-01')).item;
  assert.deepEqual(document.availableLocales, ['ru']); assert.equal(document.locale, 'ru');
  assert.equal((await call('/documents/demo-doc-01?locale=en')).status, 404);
  assert.equal((await call('/files/demo-scan-1')).status, 200);
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {env, stdio: 'pipe'});
  assert.equal(await db.documentTranslation.count(), 20);
});
test('hierarchy edits are scoped, optimistic, zero-preserving and cannot reparent records', async () => {
  const fund = (await ok('/admin/catalog/funds/' + fundId, 'GET', undefined, branchA)).item;
  await ok('/admin/catalog/funds/' + fundId, 'PATCH', {name: 'Учебный фонд после правки', expectedUpdatedAt: fund.updatedAt}, branchA);
  const inventoryBefore = (await ok('/admin/catalog/inventories/' + inventoryId, 'GET', undefined, branchA)).item;
  await ok('/admin/catalog/inventories/' + inventoryId, 'PATCH', {title: 'Учебная опись после правки', expectedUpdatedAt: inventoryBefore.updatedAt}, branchA);
  const emptyFund = (await ok('/admin/catalog/funds', 'POST', {branchId: branchOne, number: '0008', name: 'Пустой фонд', description: 'Для проверки удаления'}, branchA, 201)).item;
  await ok('/admin/catalog/funds/' + emptyFund.id, 'DELETE', {expectedUpdatedAt: emptyFund.updatedAt}, branchA);
  const item = (await ok('/admin/catalog/cases/' + caseId, 'GET', undefined, branchA)).item;
  assert.equal((await call('/admin/catalog/cases/' + caseId, 'GET', undefined, branchB)).status, 403);
  assert.equal((await call('/admin/catalog/cases/' + caseId, 'PATCH', {title: 'Чужая правка', expectedUpdatedAt: item.updatedAt}, branchB)).status, 403);
  const updated = (await ok('/admin/catalog/cases/' + caseId, 'PATCH', {number: '0003', title: 'Исправленное дело', expectedUpdatedAt: item.updatedAt}, branchA)).item;
  assert.equal(updated.number, '0003');
  assert.equal((await call('/admin/catalog/cases/' + caseId, 'PATCH', {title: 'Старая правка', expectedUpdatedAt: item.updatedAt}, branchA)).status, 409);
  assert.equal((await call('/admin/catalog/cases/' + caseId, 'PATCH', {fundId: 'other', expectedUpdatedAt: updated.updatedAt}, branchA)).status, 400);
  assert.equal((await call('/admin/catalog/funds', 'POST', {branchId: branchOne, number: '0007', name: 'Дубль', description: 'Дубль'}, branchA)).status, 409);
  const empty = (await ok('/admin/catalog/cases', 'POST', {fundId, inventoryId, number: '0004', title: 'Пустое дело'}, branchA, 201)).item;
  await ok('/admin/catalog/cases/' + empty.id, 'DELETE', {expectedUpdatedAt: empty.updatedAt}, branchA);
  const inventory = (await ok('/admin/catalog/inventories/' + inventoryId, 'GET', undefined, branchA)).item;
  assert.equal((await call('/admin/catalog/inventories/' + inventoryId, 'DELETE', {expectedUpdatedAt: inventory.updatedAt}, branchA)).status, 409);
});
test('catalog drafts reject publication authority and fabricated source-free official material', async () => {
  const {allowDigitalCopy: _, ...payload} = metadata();
  assert.equal((await call('/admin/catalog/documents', 'POST', {...payload, fundId, isPublic: true}, writer)).status, 400);
  assert.equal((await call('/admin/catalog/documents', 'POST', {...payload, fundId, sourceUrl: 'https://user:password@example.test/'}, writer)).status, 400);
  assert.equal((await call('/admin/catalog/documents', 'POST', {...payload, fundId, tags: ['Книги', 'книги']}, writer)).status, 400);
  assert.equal((await call('/admin/catalog/documents', 'POST', {...payload, fundId, allowDigitalCopy: true}, writer)).status, 400);
  assert.equal((await call('/admin/catalog/documents', 'POST', {...payload, fundId, isDemo: false, sourceNote: null}, writer)).status, 400);
  assert.equal((await call('/admin/catalog/documents', 'POST', {...payload, fundId}, visitor)).status, 403);
  assert.equal((await call('/admin/catalog/documents', 'POST', {...payload, fundId}, branchB)).status, 403);
});
test('document approval keeps drafts private, records all six states and protects private notes', async () => {
  const {item, revision} = await create('CATALOG_PUBLICATION_MARKER');
  assert.equal(item.isPublic, false);
  assert.equal((await call('/documents/' + item.id)).status, 404);
  assert.equal((await ok('/documents?q=CATALOG_PUBLICATION_MARKER')).total, 0);
  assert.equal((await call('/admin/revisions/' + revision.id, 'PATCH', {expectedUpdatedAt: revision.updatedAt, payload: metadata()}, branchB)).status, 403);
  let r = await transition(revision, 'IN_REVIEW', writer); r = await transition(r, 'CHANGES_REQUESTED');
  r = (await ok('/admin/revisions/' + r.id, 'PATCH', {expectedUpdatedAt: r.updatedAt, payload: revision.payload}, writer)).item;
  r = await publish(r);
  const publicItem = (await ok('/documents/' + item.id)).item;
  assert.equal(publicItem.title, 'CATALOG_PUBLICATION_MARKER'); assert.equal(publicItem.internalNotes, undefined); assert.deepEqual(publicItem.files, []);
  assert.equal((await ok('/documents?q=CATALOG_PUBLICATION_MARKER')).total, 1);
  const content = await ok('/content'); assert.ok(!content.items.some((c: {id: string}) => c.id === item.contentItemId));
  assert.equal((await call('/content/_archive-' + item.id)).status, 404);
  assert.equal((await call('/admin/content/' + item.contentItemId + '/revisions', 'POST', {locale: 'en', payload: text()}, writer)).status, 404);
  const history = await ok('/admin/revisions/' + r.id + '/events', 'GET', undefined, writer); assert.equal(history.total, 5);
  await transition(r, 'ARCHIVED'); assert.equal((await call('/documents/' + item.id)).status, 404);
});
test('catalog reviewer is independent and a writer cannot approve or publish', async () => {
  const {revision} = await create(); const r = await transition(revision, 'IN_REVIEW', writer);
  assert.equal((await call('/admin/revisions/' + r.id + '/transition', 'POST', {status: 'APPROVED', expectedUpdatedAt: r.updatedAt, reason: 'Обход прав'}, writer)).status, 403);
  await ok('/admin/assignments', 'POST', {userId: 'catalog-visitor', roleId: 'CONTENT_MODERATOR', branchId: branchOne}, admin);
  try {
    assert.equal((await call('/admin/revisions/' + r.id + '/transition', 'POST', {status: 'APPROVED', expectedUpdatedAt: r.updatedAt, reason: 'Нет доступа к каталогу'}, visitor)).status, 403);
  } finally {
    await ok('/admin/assignments', 'DELETE', {userId: 'catalog-visitor', roleId: 'CONTENT_MODERATOR', branchId: branchOne}, admin);
  }
  const self = await ok('/admin/catalog/documents', 'POST', {...metadataWithoutCopy(), fundId}, admin, 201);
  const sent = await transition(self.revision, 'IN_REVIEW', admin);
  assert.equal((await call('/admin/revisions/' + sent.id + '/transition', 'POST', {status: 'APPROVED', expectedUpdatedAt: sent.updatedAt, reason: 'Самопроверка'}, admin)).status, 403);
  const approved = await transition(r, 'APPROVED');
  assert.equal((await call('/admin/revisions/' + approved.id + '/transition', 'POST', {status: 'PUBLISHED', expectedUpdatedAt: approved.updatedAt, reason: 'Обход публикации'}, writer)).status, 403);
});
function metadataWithoutCopy() {const {allowDigitalCopy: _, ...payload} = metadata(); return payload;}

test('all requisition filters combine, distinguish leading zeros and match overlapping periods', async () => {
  const created = await create('100%_ Учебная коллекция'); await publish(created.revision);
  const params = new URLSearchParams({branchId: branchOne, fundId, inventoryId, caseId, fundNumber: '0007', inventoryNumber: '0001', caseNumber: '0003', reference: created.item.reference, author: 'Учебный Автор', organization: 'учебная организация', locality: 'Демо город', originalLanguage: 'KK', category: 'образование', tag: 'чтение', type: 'PHOTO', yearFrom: '1935', yearTo: '1936'});
  assert.deepEqual((await ok('/documents?' + params)).items.map((d: {id: string}) => d.id), [created.item.id]);
  for (const [name, wrong] of [['branchId', branchTwo], ['fundNumber', '7'], ['inventoryNumber', '1'], ['caseNumber', '3'], ['author', 'Другой'], ['originalLanguage', 'en'], ['tag', 'Другая'], ['yearFrom', '1941']]) {
    const negative = new URLSearchParams(params); negative.set(name, wrong); if (name === 'yearFrom') negative.set('yearTo', '1950');
    assert.equal((await ok('/documents?' + negative)).total, 0, name);
  }
  assert.equal((await ok('/documents?q=' + encodeURIComponent('%_'))).total, 1);
  assert.equal((await ok('/documents?author=' + encodeURIComponent('%'))).total, 0);
  assert.equal((await ok('/documents?author=' + encodeURIComponent("' OR 1=1 --"))).total, 0);
  assert.equal((await call('/documents?fundId=a&fundId=b')).status, 400);
  assert.equal((await call('/documents?locale=uz')).status, 400);
  assert.equal((await call('/documents?internalNotes=PRIVATE')).status, 400);
  assert.equal((await call('/documents/' + created.item.id + '?locale=en&locale=ru')).status, 400);
});
test('translated catalog text is reviewed independently and does not mutate shared metadata or Russian text', async () => {
  const {item, revision} = await create('Русская карточка'); await publish(revision);
  const english = await revise(item.id, text('English archive catalogue'), 'en');
  assert.equal((await call('/documents/' + item.id + '?locale=en')).status, 404);
  assert.equal((await ok('/documents?locale=en&q=English')).total, 0);
  await publish(english);
  const en = (await ok('/documents/' + item.id + '?locale=en')).item;
  assert.equal(en.title, 'English archive catalogue'); assert.equal(en.originalLanguage, 'kk'); assert.equal(en.year, 1930);
  assert.deepEqual(en.availableLocales, ['en', 'ru']); assert.equal((await ok('/documents/' + item.id)).item.title, 'Русская карточка');
  assert.equal((await ok('/documents?locale=en&q=English')).total, 1);
  const bad = await call('/admin/catalog/documents/' + item.id + '/revisions', 'POST', {locale: 'kk', payload: {...text('Қазақша'), year: 2000}}, writer); assert.equal(bad.status, 400);
  const kk = await revise(item.id, text('Оқу мұрағаты'), 'kk'); const published = await publish(kk);
  assert.equal((await ok('/documents/' + item.id + '?locale=kk')).item.title, 'Оқу мұрағаты');
  await transition(published, 'ARCHIVED'); assert.equal((await call('/documents/' + item.id + '?locale=kk')).status, 404);
  assert.equal((await call('/documents/' + item.id)).status, 200);
});
test('replacement Russian revision keeps the live version until publication and invalidates stale translations', async () => {
  const {item, revision} = await create('Старая опубликованная версия'); await publish(revision);
  const en = await revise(item.id, text('Approved English source'), 'en'); await publish(en);
  const englishDraft = await revise(item.id, text('Stale English draft'), 'en');
  let kazakh = await revise(item.id, text('Қазақша нұсқа'), 'kk'); kazakh = await transition(kazakh, 'IN_REVIEW', writer); await transition(kazakh, 'APPROVED');
  const next = await revise(item.id, {...revision.payload, title: 'Новая опубликованная версия'});
  assert.equal((await ok('/documents/' + item.id)).item.title, 'Старая опубликованная версия');
  assert.equal((await ok('/documents?locale=en&q=Approved')).total, 1);
  const updated = await publish(next);
  assert.equal((await ok('/documents/' + item.id)).item.title, 'Новая опубликованная версия');
  assert.equal((await call('/documents/' + item.id + '?locale=en')).status, 404);
  assert.equal((await ok('/documents?locale=en&q=Approved')).total, 0);
  const stale = await call('/admin/revisions/' + englishDraft.id + '/transition', 'POST', {status: 'IN_REVIEW', expectedUpdatedAt: englishDraft.updatedAt, reason: 'Устаревший исходник'}, writer); assert.equal(stale.status, 409);
  const fixed = (await ok('/admin/revisions/' + englishDraft.id, 'PATCH', {expectedUpdatedAt: englishDraft.updatedAt, payload: text('Updated English source')}, writer)).item; await publish(fixed);
  const kk = await db.contentRevision.findUniqueOrThrow({where: {id: kazakh.id}}); assert.equal(kk.status, 'CHANGES_REQUESTED'); assert.equal(kk.reviewerId, null);
  const notices = await ok('/admin/notices', 'GET', undefined, writer); assert.ok(notices.items.some((n: {event: string}) => n.event === 'SOURCE_CHANGED'));
  await transition(updated, 'ARCHIVED'); assert.equal((await call('/documents/' + item.id + '?locale=en')).status, 404);
});
test('metadata cannot bypass a revision; notes stay private and concurrent draft changes conflict', async () => {
  const {item, revision} = await create('Concurrent catalogue');
  assert.equal((await call('/admin/catalog/documents/' + item.id, 'PATCH', {title: 'Обход', expectedUpdatedAt: item.updatedAt}, writer)).status, 400);
  const notes = await ok('/admin/catalog/documents/' + item.id, 'PATCH', {internalNotes: 'PRIVATE_UPDATED_NOTES', expectedUpdatedAt: item.updatedAt}, writer);
  assert.equal(notes.item.internalNotes, 'PRIVATE_UPDATED_NOTES');
  const changes = await Promise.all(['Версия A', 'Версия B'].map(title => call('/admin/revisions/' + revision.id, 'PATCH', {expectedUpdatedAt: revision.updatedAt, payload: {...revision.payload, title}}, writer)));
  assert.deepEqual(changes.map(r => r.status).sort(), [200, 409]);
  const r = (await changes.find(r => r.status === 200)!.json()).item; await publish(r);
  const publicText = await (await call('/documents/' + item.id)).text(); assert.ok(!publicText.includes('PRIVATE_UPDATED_NOTES'));
  const current = (await ok('/admin/catalog/cases/' + caseId, 'GET', undefined, writer)).item;
  assert.equal((await call('/admin/catalog/cases/' + caseId, 'PATCH', {title: 'Несогласованная иерархия', expectedUpdatedAt: current.updatedAt}, branchA)).status, 409);
});
test('trash and restore retain history, require timestamps and never republish a document', async () => {
  const {item, revision} = await create('Корзина');
  const removed = (await ok('/admin/catalog/documents/' + item.id, 'DELETE', {expectedUpdatedAt: item.updatedAt}, writer)).item; assert.ok(removed.deletedAt);
  assert.equal((await call('/admin/catalog/documents/' + item.id + '/restore', 'POST', {expectedUpdatedAt: removed.updatedAt}, branchB)).status, 403);
  assert.equal((await call('/admin/revisions/' + revision.id, 'PATCH', {expectedUpdatedAt: revision.updatedAt, payload: revision.payload}, writer)).status, 404);
  assert.equal((await ok('/admin/catalog/documents?fundId=' + fundId, 'GET', undefined, writer)).items.some((d: {id: string}) => d.id === item.id), false);
  const restored = (await ok('/admin/catalog/documents/' + item.id + '/restore', 'POST', {expectedUpdatedAt: removed.updatedAt}, writer)).item; assert.equal(restored.deletedAt, null); assert.equal(restored.isPublic, false);
  assert.equal((await call('/admin/catalog/documents/' + item.id + '/restore', 'POST', {expectedUpdatedAt: removed.updatedAt}, writer)).status, 409);
  assert.equal(await db.contentRevision.count({where: {id: revision.id}}), 1);
});
test('catalog-only approval and withdrawal close file/OCR/AI/favorites paths and seed cannot republish it', async () => {
  const original = await db.document.findUniqueOrThrow({where: {id: 'demo-doc-01'}});
  const originalTranslation = await db.documentTranslation.findUniqueOrThrow({where: {documentId_locale: {documentId: original.id, locale: 'ru'}}});
  let itemId: string | null = null;
  // Public CMS slugs cannot occupy the reserved internal namespace of an existing document.
  await ok('/admin/content', 'POST', {slug: 'archive-demo-doc-01', kind: 'PAGE', locale: 'ru', payload: {title: 'Учебная страница', body: 'Учебный текст', rights: 'ALEteam CC0-1.0'}}, admin, 201);
  try {
    const payload = {title: original.title, description: original.description, rights: original.rights, reference: original.reference, year: original.year, type: original.type, allowDigitalCopy: false};
    let revision = await revise(original.id, payload); itemId = revision.itemId; revision = await publish(revision);
    assert.equal((await ok('/documents/' + original.id)).item.files.length, 0);
    assert.equal((await call('/files/demo-file-1')).status, 404); assert.equal((await call('/files/demo-scan-1/ocr')).status, 404);
    await ok('/me/favorites/' + original.id, 'PUT', {}, visitor);
    await transition(revision, 'ARCHIVED');
    for (const path of ['/documents/' + original.id, '/documents/' + original.id + '/comments', '/documents/' + original.id + '/similar', '/files/demo-scan-1']) assert.equal((await call(path)).status, 404);
    assert.ok(!(await ok('/me/favorites', 'GET', undefined, visitor)).items.some((d: {id: string}) => d.id === original.id));
    const assistant = await ok('/assistant', 'POST', {question: 'Найди библиотеку'}, visitor); assert.ok(!assistant.sources.some((source: {id: string}) => source.id === original.id));
    execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {env, stdio: 'pipe'});
    assert.equal((await call('/documents/' + original.id)).status, 404);
  } finally {
    await db.documentTranslation.deleteMany({where: {documentId: original.id}});
    await db.document.update({where: {id: original.id}, data: {...original, contentItemId: null}});
    if (itemId) {
      const revisions = await db.contentRevision.findMany({where: {itemId}, select: {id: true}}); const ids = revisions.map(r => r.id);
      await db.editorialNotice.deleteMany({where: {revisionId: {in: ids}}}); await db.publicationEvent.deleteMany({where: {revisionId: {in: ids}}});
      await db.contentRevision.deleteMany({where: {itemId}}); await db.contentItem.delete({where: {id: itemId}});
    }
    await db.documentTranslation.create({data: originalTranslation});
  }
});
test('catalog audit stores identifiers and notices remain isolated by branch and permission', async () => {
  const audit = await ok('/admin/audit?pageSize=50', 'GET', undefined, admin); const serialized = JSON.stringify(audit);
  assert.ok(!serialized.includes(password)); assert.ok(!serialized.includes('PRIVATE_CATALOG_NOTE')); assert.ok(!serialized.includes('PRIVATE_UPDATED_NOTES'));
  assert.equal((await call('/admin/catalog/documents', 'GET', undefined, visitor)).status, 403);
  const notices = await ok('/admin/notices', 'GET', undefined, branchB); assert.equal(notices.total, 0);
});
