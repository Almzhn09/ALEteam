import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {fileProcessingTimeout,isolatedProcessing} from '../src/server/isolated-processing';

test('worker budgets default to 120 seconds and reject unbounded or malformed configuration',()=>{
 assert.equal(fileProcessingTimeout(''),120000);assert.equal(fileProcessingTimeout('1000'),1000);assert.equal(fileProcessingTimeout('300000'),300000);
 for(const value of ['0','999','300001','-1','1.5','Infinity','NaN','1e5',' 20000'])assert.throws(()=>fileProcessingTimeout(value),/FILE_PROCESSING_TIMEOUT_MS/);
});

test('configured deadlines kill the real child, release capacity and retain the two-worker bound',async()=>{
 const previous=process.env.FILE_PROCESSING_TIMEOUT_MS,execute=childProcess.execFile;let delay=1500;
 // Substitute only the worker's body. The real execFile deadline and SIGKILL are exercised.
 mock.method(childProcess,'execFile',(...args:any[])=>{
  assert.equal(args[0],process.execPath);assert.equal(args[1][0],'--max-old-space-size=128');
  assert.ok(args[2].timeout>0);assert.equal(args[2].killSignal,'SIGKILL');
  return execute(process.execPath,['-e',`setTimeout(()=>process.stdout.write('{"passed":true}'),${delay})`],args[2],args[3]);
 });syncBuiltinESMExports();
 try{
  process.env.FILE_PROCESSING_TIMEOUT_MS='1000';
  await assert.rejects(()=>isolatedProcessing({}),e=>(e as {code?:string}).code==='PROCESSING_TIMEOUT');
  delete process.env.FILE_PROCESSING_TIMEOUT_MS;
  assert.deepEqual(await isolatedProcessing({}),{passed:true});
  delay=150;const first=isolatedProcessing({}),second=isolatedProcessing({});
  await assert.rejects(()=>isolatedProcessing({}),e=>(e as {code?:string}).code==='PROCESSING_BUSY');
  await Promise.all([first,second]);assert.deepEqual(await isolatedProcessing({}),{passed:true});
  process.env.FILE_PROCESSING_TIMEOUT_MS='0';await assert.rejects(()=>isolatedProcessing({}),/FILE_PROCESSING_TIMEOUT_MS/);
 }finally{
  if(previous===undefined)delete process.env.FILE_PROCESSING_TIMEOUT_MS;else process.env.FILE_PROCESSING_TIMEOUT_MS=previous;
  mock.restoreAll();syncBuiltinESMExports();
 }
});
