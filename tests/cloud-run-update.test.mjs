import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('../deploy/cloud-run/update.sh',import.meta.url));
async function run(configured,input=''){
 const folder=await mkdtemp(path.join(tmpdir(),'ale-update-test-'));const log=path.join(folder,'calls.jsonl');
 try{
  await writeFile(path.join(folder,'gcloud'),`#!/usr/bin/env python3
import json,os,sys
args=sys.argv[1:]
with open(os.environ['ALE_TEST_CALLS'],'a') as f: f.write(json.dumps(args)+'\\n')
if args[:3]==['run','services','describe']:
 if '--format=json' in args:
  variables=[{'name':'DATABASE_URL','valueFrom':{'secretKeyRef':{'name':'database-secret','key':'1'}}}] if os.environ['ALE_TEST_CONFIGURED']=='1' else []
  print(json.dumps({'spec':{'template':{'spec':{'containers':[{'env':variables}]}}}}))
 elif any('serviceAccountName' in a for a in args): print('archive@example.iam.gserviceaccount.com')
 else: print('https://archive.example.test')
elif args[:3]==['secrets','versions','add']: print('projects/test/secrets/database-secret/versions/2')
`,{mode:0o700});
  const result=spawnSync('bash',[script],{encoding:'utf8',input,env:{...process.env,PATH:folder+':'+process.env.PATH,ALE_TEST_CALLS:log,ALE_TEST_CONFIGURED:configured?'1':'0'}});
  const calls=(await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
  return {result,calls};
 }finally{await rm(folder,{recursive:true,force:true});}
}
test('updating an existing database preserves environment and secrets and updates only the archive service',async()=>{
 const {result,calls}=await run(true);assert.equal(result.status,0,result.stderr);
 assert.equal(calls.filter(a=>a[0]==='builds').length,1);
 const update=calls.find(a=>a.slice(0,3).join(' ')==='run services update');assert.ok(update.includes('ale-archive-preview'));assert.ok(update.includes('--project=saq-qurylys'));assert.ok(update.some(a=>a.startsWith('--image=')));
 assert.ok(!update.some(a=>/env|secrets/.test(a)));assert.ok(!calls.some(a=>a[0]==='secrets'));
});
test('a service without a database requests a direct URL and connects it using a secret, without Node',async()=>{
 const url='postgresql://reader:fake-password@ep-example.neon.tech/archive?sslmode=require';const {result,calls}=await run(false,url+'\n');assert.equal(result.status,0,result.stderr);
 assert.equal(calls.filter(a=>a[0]==='builds').length,1);const update=calls.find(a=>a.slice(0,3).join(' ')==='run services update');assert.ok(update.some(a=>a==='--update-secrets=DATABASE_URL=ale-archive-database-url:2'));
 assert.ok(!(result.stdout+result.stderr+JSON.stringify(calls)).includes('fake-password'));
});
test('an invalid pooled URL is rejected before building or changing secrets',async()=>{
 const {result,calls}=await run(false,'postgresql://reader:fake-password@ep-example-pooler.neon.tech/archive?sslmode=require\n');assert.notEqual(result.status,0);assert.ok(!calls.some(a=>['builds','secrets'].includes(a[0])));
});
