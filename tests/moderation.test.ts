import { test } from 'node:test';
import assert from 'node:assert/strict';
import cases from './fixtures/moderation-cases.json';
import { moderateText, MODERATION_VERSION } from '../src/server/moderation';

for (const item of cases) test(`moderation corpus ${item.id}`, () => {
  const original = item.text;
  const result = moderateText(item.text);
  assert.equal(result.status, item.expected);
  assert.equal(result.version, MODERATION_VERSION);
  assert.equal(item.text, original);
});
test('obvious profanity cannot bypass local filter through a clean external result', async () => {
  const { moderate } = await import('../src/server/services');
  process.env.MODERATION_SERVICE_URL = 'http://127.0.0.1:1';
  try { assert.equal((await moderate('нахуй')).status, 'REJECTED'); }
  finally { delete process.env.MODERATION_SERVICE_URL; }
});
