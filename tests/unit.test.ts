import {safeReturnTo} from '../src/lib/return-to';
import {archiveParams,archiveRequest,archiveKey} from '../src/app/catalog/shared';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { catalogSchema } from '../src/server/catalog';
import { assistantInput } from '../src/server/assistant';
import { commentBody } from '../src/server/discussions';
import { ApiError, readJson, sameOrigin } from '../src/server/http';
import { moderate, moderationResult, serviceUrl } from '../src/server/services';
import { db } from '../src/server/db';

after(() => db.$disconnect());
test('catalog rejects oversized pages, invalid ranges and unexpected parameters', () => {
  for (const value of [{ pageSize: 51 }, { page: 0 }, { yearFrom: 2000, yearTo: 1900 }, { sort: 'DROP TABLE' }, { isPublic: false }, { q: 'x'.repeat(201) }]) {
    assert.equal(catalogSchema.safeParse(value).success, false);
  }
  assert.equal(catalogSchema.parse({ q: '  библиотека  ' }).q, 'библиотека');
});
test('comment and assistant schemas reject privilege fields and unbounded input', () => {
  assert.equal(commentBody.safeParse({ body: 'okay', status: 'PUBLISHED' }).success, false);
  assert.equal(commentBody.safeParse({ body: ' '.repeat(10) }).success, false);
  assert.equal(commentBody.safeParse({ body: 'x'.repeat(2001) }).success, false);
  assert.equal(assistantInput.safeParse({ question: 'q', model: 'expensive' }).success, false);
  assert.equal(assistantInput.safeParse({ question: 'q', history: Array(7).fill({ role: 'user', content: 'q' }) }).success, false);
});
test('CSRF guard rejects missing/cross-site origins', () => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  for (const origin of [undefined, 'https://attacker.example']) {
    assert.throws(() => sameOrigin(new Request('http://localhost:3000/api', { headers: origin ? { origin } : {} })), ApiError);
  }
  assert.doesNotThrow(() => sameOrigin(new Request('http://localhost:3000/api', { headers: { origin: 'http://localhost:3000' } })));
});
test('body limit counts bytes even without Content-Length', async () => {
  const request = new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'я'.repeat(100) }) });
  await assert.rejects(readJson(request, 100), (e: unknown) => e instanceof ApiError && e.status === 413);
});
test('invalid JSON and unexpected content type fail explicitly', async () => {
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', body: '{}' })), (e: unknown) => e instanceof ApiError && e.status === 415);
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })), (e: unknown) => e instanceof ApiError && e.status === 400);
});
test('manual or unknown moderation configuration always queues a comment', async () => {
  delete process.env.MODERATION_SERVICE_URL;
  try {
    for (const mode of ['manual', 'invalid-configuration']) {
      process.env.MODERATION_MODE = mode;
      assert.equal((await moderate('test')).status, 'PENDING');
    }
  }
  finally { delete process.env.MODERATION_MODE; }
});
test('moderation rejects inconsistent publish decisions', () => {
  assert.equal(moderationResult.safeParse({ status: 'PUBLISHED', reason: 'PROFANITY', version: '1' }).success, false);
  assert.equal(moderationResult.safeParse({ status: 'PUBLISHED', reason: 'CLEAN', version: '1' }).success, true);
});
test('service destination cannot be user-controlled credentials or insecure remote HTTP', () => {
  assert.throws(() => serviceUrl('http://external.example/api'));
  assert.throws(() => serviceUrl('https://user:password@external.example/api'));
  assert.equal(serviceUrl('http://127.0.0.1:3002').hostname, '127.0.0.1');
});

test('authentication return targets cannot become a foreign browser origin after URL normalization',()=>{
 for(const target of ['https://evil.example','//evil.example','/a/..//evil.example','/a/%2e%2e//evil.example','/\\evil.example','/\t/evil.example','/\n/evil.example','/\r/evil.example','/\u0000/evil.example'])assert.equal(safeReturnTo(target),'/');
 for(const target of ['/me','/catalog?q=архив#results','/register?returnTo=%2Fme'])assert.equal(new URL(safeReturnTo(target),'https://archive.invalid').origin,'https://archive.invalid');
 assert.equal(safeReturnTo('/me?tab=comments#my-comments'),'/me?tab=comments#my-comments');
});
test('saved CMS searches keep their corpus, source language and category across pagination',()=>{
 const p=archiveParams(new URLSearchParams('scope=cms&q=архив&category=history&contentKind=PAGE&contentLang=ru&yearFrom=1900&page=2'));
 assert.equal(p.legacy,false);const query=new URL(archiveRequest(p,'en'),'http://local');assert.equal(query.pathname,'/search');for(const [key,value]of Object.entries({scope:'cms',category:'history',contentKind:'PAGE',locale:'ru',page:'2',yearFrom:'1900'}))assert.equal(query.searchParams.get(key),value);
 const other=archiveParams(new URLSearchParams('scope=cms&category=compliance'));assert.notEqual(archiveKey(p,'en'),archiveKey(other,'en'));
 assert.equal(archiveParams(new URLSearchParams('scope=document&reference=DEMO-1&contentLang=ru')).legacy,true);
});
