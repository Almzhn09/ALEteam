import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generateLocalQuery } from '../src/server/local-model';
import report from '../training/report.json';
test('artifact comes from the recorded from-scratch training run', async () => {
 assert.equal(report.pretrained, false);
 assert.ok(report.parameters > 100000);
 const model=JSON.parse(await readFile('training/models/query-model.json','utf8'));
 assert.equal(Object.values(model.weights).reduce((sum:number,value)=>sum+(value as number[][]).flat().length,0),report.parameters);
 assert.equal(createHash('sha256').update(await readFile('training/models/query-model.json')).digest('hex'), report.artifactSha256);
 assert.ok(report.history[0].trainLoss > report.history.at(-1)!.trainLoss);
});
test('JavaScript autoregressive inference matches Python on all held-out test examples', () => {
 for(const c of report.evaluation.test.cases) {
  const result=generateLocalQuery(c.question);
  assert.equal(result.query, c.prediction, c.question);
  assert.ok(Math.abs(result.confidence-c.confidence)<0.0001);
 }
});
test('model handles Kazakh and produces multiple query tokens', () => {
 assert.equal(generateLocalQuery('Мұрағат қоры деген не?').query,'архивный фонд');
 assert.equal(generateLocalQuery('Оқушылар 1965').query,'школа');
 assert.equal(generateLocalQuery('Свидетельство о рождении Иванова').query,'нет ответа');
});

test('Unicode features match the Python training pipeline including non-BMP characters', async () => {
 const {questionFeatures}=await import('../src/server/local-model');
 const rows=JSON.parse(await readFile('training/feature-parity.json','utf8')) as {question:string;features:number[]}[];
 for(const row of rows){const actual=questionFeatures(row.question);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-row.features[i])<1e-12);}
});
