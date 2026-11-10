import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'sources/archive-20261110/';
const manifest = JSON.parse(await readFile(root + 'manifest.json', 'utf8'));
let originals = 0, texts = 0, linked = 0;
async function check(path, expected, bytes) {
  assert.ok(!path.startsWith('/') && !path.split('/').includes('..'));
  const data = await readFile(root + path);
  assert.equal(createHash('sha256').update(data).digest('hex'), expected, path);
  if (bytes !== undefined) assert.equal(data.length, bytes, path);
}
for (const source of manifest.sources) {
  await check(source.original, source.sha256, source.bytes); originals++;
  for (const text of source.texts ?? []) {await check(text.path, text.sha256); texts++;}
}
for (const ref of JSON.parse(await readFile(root + 'linked-fetch.json', 'utf8'))) {
  if (ref.status === 200) {await check(ref.path, ref.sha256, ref.bytes); linked++;}
}
for (const ref of JSON.parse(await readFile(root + 'linked-extraction.json', 'utf8'))) await check(ref.extractedPath, ref.extractedSha256);
assert.equal(originals, 9);
const branches = JSON.parse(await readFile('data/archive-20261110/branches.json', 'utf8'));
assert.equal(branches.records.length, 13);
assert.ok(branches.records.every(r => r.publicationState === 'DRAFT' && r.coordinates === null));
const drafts = JSON.parse(await readFile('data/archive-20261110/cms-draft-requests.json', 'utf8'));
assert.equal(drafts.draftsOnly, true);
for (const r of drafts.records) {
  assert.equal(r.publicationAllowed, false); assert.equal(r.requiresReview, true);
  assert.ok(r.request.payload.body.length > 0 && r.request.payload.body.length <= 10000);
}
console.log(`Verified ${originals} originals, ${texts} texts, ${linked} linked files; 13 branch drafts and ${drafts.records.length} CMS draft requests. No publication performed.`);
