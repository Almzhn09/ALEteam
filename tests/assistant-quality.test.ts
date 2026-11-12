import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import fixture from '../data/artur/quality-aggregate-example.json';
import {aggregateQualityReport} from '../src/server/aggregate-quality-report';
import {corpusHealthReport, type HealthItem} from '../src/server/corpus-health';

test('aggregate report distinguishes measured zero, suppressed groups and absent measurements', () => {
  const result = aggregateQualityReport(fixture);
  assert.equal(result.sourceType, 'synthetic');
  assert.equal(result.policyApprovalVerified, false);
  assert.equal(result.measurements.find(m => m.topicId === 'exhibitions')?.status, 'measured');
  assert.ok(result.unmeasuredTopics.includes('news'));
  const suppressed = result.measurements.find(m => m.topicId === 'favorites')!;
  assert.equal(suppressed.status, 'suppressed');
  assert.ok(!('searches' in suppressed));
  assert.equal(result.recommendations.length, 2);
  assert.equal(result.recommendations[0].basis, '8/20 searches had no results');
  assert.equal(result.recommendations[0].periodEnd, '2026-11-08');
  assert.equal(result.recommendations[0].owner, 'Артур');
  assert.equal(result.recommendations[0].method, 'aggregate-rule');
});
test('suppressed counts cannot be guessed from a hash of the raw input', () => {
  const changed = structuredClone(fixture);
  changed.rows[2].searches = 4; changed.rows[2].emptyResults = 1;
  assert.equal(aggregateQualityReport(changed).reportSha256, aggregateQualityReport(fixture).reportSha256);
});
test('raw queries, identifiers, unsupported topics, impossible and unfinished windows fail', () => {
  for (const patch of [{query: 'do-not-output@example.test'}, {userId: 'private'}, {topicId: 'private'},
    {emptyResults: 21}, {searches: -1}, {periodStart: '2026-11-08', periodEnd: '2026-11-01'},
    {periodEnd: '2026-11-10'}, {periodStart: '2026-02-30'}]) {
    const data = structuredClone(fixture); Object.assign(data.rows[0], patch);
    assert.throws(() => aggregateQualityReport(data));
  }
  assert.throws(() => aggregateQualityReport({...fixture, visitorEmail: 'private'}));
});
test('overlapping topic windows and duplicate measurements cannot masquerade as more evidence', () => {
  const data = structuredClone(fixture);
  data.rows.push({...data.rows[0], periodStart: '2026-11-04'});
  assert.throws(() => aggregateQualityReport(data));
  const adjacent = structuredClone(fixture);
  adjacent.rows.push({...adjacent.rows[0], periodStart: '2026-11-08', periodEnd: '2026-11-09'});
  assert.equal(aggregateQualityReport(adjacent).measurements.length, 4);
});
test('empty feed means no measurements, never invented zero traffic', () => {
  const report = aggregateQualityReport({...fixture, rows: []});
  assert.deepEqual(report.measurements, []); assert.deepEqual(report.recommendations, []);
  assert.equal(report.unmeasuredTopics.length, 10);
});
const now = new Date('2026-11-10T00:00:00Z');
const options = {now, reviewAfterDays: 180, branchIds: ['branch-a']};
const published = (locale: string, valid = true, date = '2026-11-09'): HealthItem['publications'][number] => ({locale, valid, updatedAt: new Date(date)});
test('corpus health measures published language coverage, age and restrictions without visitor facts', () => {
  const report = corpusHealthReport([{isDemo: true, restrictedCopy: false, publications: [published('ru', true, '2020-01-01'), published('kk')]}],
    [{isDemo: false, restrictedCopy: true, publications: [published('ru'), published('en')]}], options);
  assert.equal(report.content.items, 1); assert.equal(report.content.reviewDueItems, 1);
  assert.deepEqual(report.content.locales.en, {published: 0, missing: 1});
  assert.deepEqual(report.catalog.locales.kk, {published: 0, missing: 1});
  assert.equal(report.catalog.restrictedCopies, 1);
  assert.deepEqual(report.traffic, {status: 'not-connected', searches: null, emptyResults: null});
  assert.ok(report.recommendations.every(r => r.requiresHumanReview && r.method === 'corpus-rule'));
});
test('unreviewed, unknown and duplicate language publications are integrity findings, not valid coverage', () => {
  const r = corpusHealthReport([{isDemo: true, restrictedCopy: false,
    publications: [published('ru', false), published('private'), published('en'), published('en')]}],
    [{isDemo: false, restrictedCopy: false, publications: []}], options);
  assert.equal(r.content.items, 1); assert.equal(r.content.invalidPublications, 3);
  assert.equal(r.content.locales.ru.published, 0); assert.equal(r.content.locales.en.published, 1);
  assert.equal(r.catalog.items, 0); assert.equal(r.catalog.invalidPublications, 1);
  assert.throws(() => corpusHealthReport([], [], {...options, reviewAfterDays: 0}));
});
test('offline report CLI refuses unknown fields without logging them and never overwrites a file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'assistant-quality-'));
  try {
    const input = join(dir, 'input.json'), output = join(dir, 'report.json');
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/report-assistant-quality.ts', '--input', input, '--output', output], {encoding: 'utf8'});
    await writeFile(input, JSON.stringify(fixture)); assert.equal(run().status, 0);
    const before = await readFile(output, 'utf8'); assert.equal(run().status, 2);
    assert.equal(await readFile(output, 'utf8'), before);
    await writeFile(input, JSON.stringify({...fixture, secret: 'NEVER_OUTPUT_PRIVATE_VALUE'}));
    const failed = run(); assert.equal(failed.status, 2); assert.ok(!(failed.stdout + failed.stderr).includes('NEVER_OUTPUT_PRIVATE_VALUE'));
  } finally {await rm(dir, {recursive: true, force: true});}
});
