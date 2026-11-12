import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {generateLocalQuery} from '../src/server/local-model';
const path='training/full-tz/';
const report=JSON.parse(await readFile(path+'report.json','utf8'));
const artifact=JSON.parse(await readFile(path+'models/query-model.json','utf8'));
test('candidate artifact integrity and random initialization are recorded',async()=>{
 assert.equal(artifact.pretrained,false);assert.equal(artifact.featureVersion,'english-scaffold-v1');
 assert.equal(createHash('sha256').update(await readFile(path+'models/query-model.json')).digest('hex'),report.artifactSha256);
 assert.ok(report.initialWeightsSha256);assert.equal(report.seed,2026);
});
test('actual split files are hashed and share no exact questions',async()=>{
 const seen=new Set<string>();
 for(const split of ['train','validation','test']){
  const raw=await readFile(path+`data/router-${split}.jsonl`,'utf8');
  assert.equal(createHash('sha256').update(raw).digest('hex'),report.datasetSha256[split]);
  for(const row of raw.trim().split('\n').map(s=>JSON.parse(s))){const key=row.question.toLowerCase().replace(/\s+/gu,' ').trim();assert.ok(!seen.has(key),key);seen.add(key);}
 }
});
test('candidate JavaScript matches every held-out Python prediction',()=>{
 for(const c of report.evaluation.test.cases){const r=generateLocalQuery(c.question,artifact);assert.equal(r.query,c.prediction,c.question);assert.ok(Math.abs(r.confidence-c.confidence)<0.0001,c.question);}
});
