import { test } from 'node:test';
import assert from 'node:assert/strict';
import corpus from '../data/demo-corpus.json';
import scans from '../data/scans/manifest.json';
import { validateDemoCorpus } from '../src/server/demo-corpus';
test('demo corpus validates provenance and links all five raster sheets to their source texts', () => {
  const result = validateDemoCorpus(corpus, scans); assert.equal(result.documents.length, 20); assert.equal(result.scans.length, 5);
});
test('edited text and duplicate references fail before import', () => {
  const edited = structuredClone(corpus); edited[0].description += ' Изменение.';
  assert.throws(() => validateDemoCorpus(edited, scans), /INTEGRITY/);
  const duplicate = structuredClone(corpus); duplicate[1].reference = duplicate[0].reference;
  assert.throws(() => validateDemoCorpus(duplicate, scans), /DUPLICATE/);
});
test('unlicensed, real-source or mismatched image claims cannot enter the demo import', () => {
  const unlicensed = structuredClone(corpus); unlicensed[0].provenance.license = 'unknown';
  assert.throws(() => validateDemoCorpus(unlicensed, scans));
  const real = structuredClone(corpus); real[0].isDemo = false;
  assert.throws(() => validateDemoCorpus(real, scans));
  const mismatch = structuredClone(scans); mismatch[0].documentId = 'unknown';
  assert.throws(() => validateDemoCorpus(corpus, mismatch), /SOURCE/);
  const traversal = structuredClone(scans); traversal[0].storageKey = '../../secret.png';
  assert.throws(() => validateDemoCorpus(corpus, traversal));
});
