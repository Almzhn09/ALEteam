import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stageUpload, readStagedUpload, removeStagedUpload} from '../src/server/upload-storage';
import {uploadCreateSchema} from '../src/server/uploads';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const metadata = (b: Buffer) => ({bytes: b.length, sha256: sha(b), mime: 'image/png' as const});
function request(body: Uint8Array) {return new Request('http://test.invalid', {method: 'PUT', body: new Uint8Array(body)});}
test('staging verifies real original PNG bytes, uses an immutable generated key and detects later corruption', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'archive-upload-'));
  try {
    const bytes = await readFile('data/scans/demo-doc-01.png'); const staged = await stageUpload(request(bytes), metadata(bytes), dir);
    assert.match(staged.storageKey, /^uploads\/[a-f0-9-]+\.bin$/);
    const record = {storageKey: staged.storageKey, expectedBytes: bytes.length, expectedSha256: sha(bytes), mimeType: 'image/png'};
    assert.deepEqual(await readStagedUpload(record, dir), bytes);
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1; await writeFile(join(dir, staged.storageKey), changed);
    await assert.rejects(() => readStagedUpload(record, dir), {status: 404});
    await removeStagedUpload(staged.storageKey, dir); assert.deepEqual(await readdir(join(dir, 'uploads')), []);
  } finally {await rm(dir, {recursive: true, force: true});}
});
test('bad MIME, checksum, too-short and oversized bodies leave no retained partial files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'archive-upload-'));
  try {
    const bytes = await readFile('data/scans/demo-doc-01.png');
    await assert.rejects(() => stageUpload(request(bytes), {...metadata(bytes), mime: 'application/pdf'}, dir), {code: 'UPLOAD_SIGNATURE_MISMATCH'});
    await assert.rejects(() => stageUpload(request(bytes), {...metadata(bytes), sha256: '0'.repeat(64)}, dir), {code: 'UPLOAD_CHECKSUM_MISMATCH'});
    await assert.rejects(() => stageUpload(request(bytes.subarray(0, 20)), metadata(bytes), dir), {code: 'UPLOAD_SIZE_MISMATCH'});
    await assert.rejects(() => stageUpload(request(bytes), {...metadata(bytes), bytes: 20}, dir), {status: 413});
    assert.deepEqual(await readdir(join(dir, 'uploads')), []);
  } finally {await rm(dir, {recursive: true, force: true});}
});
test('symlink escape and caller-controlled paths never reach an external file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'archive-upload-')), outside = await mkdtemp(join(tmpdir(), 'archive-upload-outside-'));
  try {
    const bytes = await readFile('data/scans/demo-doc-01.png'); await symlink(outside, join(dir, 'uploads'));
    await assert.rejects(() => stageUpload(request(bytes), metadata(bytes), dir)); assert.deepEqual(await readdir(outside), []);
    for (const key of ['../private','/etc/passwd','uploads/../../private']) await assert.rejects(() => readStagedUpload({storageKey: key, expectedBytes: bytes.length, expectedSha256: sha(bytes), mimeType: 'image/png'}, dir), {status: 404});
  } finally {await rm(dir, {recursive: true, force: true}); await rm(outside, {recursive: true, force: true});}
});
test('upload metadata cannot supply paths, publication state, another author or unsupported media', () => {
  const input = {documentId: 'document-1', originalName: 'Original.png', mimeType: 'image/png', expectedBytes: 100, expectedSha256: 'a'.repeat(64), rights: 'CC0-1.0', sourceNote: 'Original fixture'};
  assert.equal(uploadCreateSchema.parse(input).originalName, 'Original.png');
  for (const patch of [{storageKey: '/tmp/private'}, {state: 'PUBLISHED'}, {uploaderId: 'another'}, {isPublic: true}, {originalName: '../image.png'}, {originalName: 'image.html'}, {mimeType: 'image/tiff'}, {expectedBytes: 20971521}]) assert.throws(() => uploadCreateSchema.parse({...input, ...patch}));
});
