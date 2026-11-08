import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { recognitionMetrics } from '../src/server/ocr-quality';
import { rankSimilar } from '../src/server/similarity';
import { db } from '../src/server/db';
import corpus from '../data/demo-corpus.json';
import results from '../data/ocr/results.json';
after(() => db.$disconnect());
test('recognition error rates count substitutions, insertions and deletions in Unicode text', () => {
  assert.equal(recognitionMetrics('Қор\nжәне құжат', 'қор және құжат').cer, 0);
  const altered = recognitionMetrics('abc def', 'axc de');
  assert.equal(altered.characterErrors, 2); assert.equal(altered.referenceCharacters, 7);
  assert.equal(altered.wordErrors, 2); assert.equal(altered.wer, 1);
});
test('OCR artifacts contain real uncorrected recognition of all seven source sheets', async () => {
  assert.equal(results.records.length, 7);
  for (const record of results.records) {
    assert.equal(createHash('sha256').update(await readFile(record.sourcePath)).digest('hex'), record.sourceSha256);
    assert.equal(createHash('sha256').update(record.text).digest('hex'), record.textSha256);
    assert.ok(record.text.length > 100); assert.equal(record.historicalScan, false);
    assert.ok(record.metrics.cer > 0 && record.metrics.cer < 0.25);
  }
});
test('similarity prefers same-topic texts, never returns the target and has deterministic ties', () => {
  const actual = rankSimilar(corpus[0], corpus, 3);
  assert.deepEqual(new Set(actual.map(r => r.id)), new Set(['demo-doc-06', 'demo-doc-11', 'demo-doc-16']));
  assert.ok(actual.every(r => r.id !== corpus[0].id && r.score <= 1 && r.commonTerms.length > 0));
  assert.deepEqual(actual, rankSimilar(corpus[0], [...corpus].reverse(), 3));
});
test('empty or unrelated records produce no similarity recommendations', () => {
  const base = { id: 'one', title: 'Телескоп', description: 'Астрономия галактика', type: 'PHOTO', fundId: 'fund' };
  assert.deepEqual(rankSimilar(base, []), []);
  assert.deepEqual(rankSimilar(base, [{ ...base, id: 'two', title: 'Кітапхана', description: 'Оқырман кітап' }]), []);
});
