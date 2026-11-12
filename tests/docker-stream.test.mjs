// No Docker daemon is used: a temporary executable supplies only fixed test bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspect} from 'node:util';
import {dockerStream} from '../deploy/docker.mjs';

test('Docker stream retains bounded stderr privately and preserves successful file streaming',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ale-docker-stream-'));
 try{
  const executable=path.join(root,'docker');
  await writeFile(executable,`#!${process.execPath}\nif(process.argv[2]==='fail'){process.stderr.write('x'.repeat(100000)+'\\nNO_SPACE_TEST_SENTINEL\\n',()=>process.exit(7));}else{process.stdin.pipe(process.stdout);}\n`);
  await chmod(executable,0o700);
  const env={...process.env,PATH:root+path.delimiter+process.env.PATH};
  const input=path.join(root,'input.bin'),output=path.join(root,'output.bin'),failed=path.join(root,'failed.bin');
  const source=Buffer.from('source-original\0with-binary-bytes');await writeFile(input,source);
  await dockerStream(['copy'],{input,output,env});assert.deepEqual(await readFile(output),source);
  let caught;
  try{await dockerStream(['fail'],{output:failed,env});}catch(error){caught=error;}
  assert.ok(caught);assert.equal(caught.message,'Docker operation failed (7)');assert.equal(caught.status,7);
  assert.equal(caught.stderrTruncated,true);assert.ok(Buffer.isBuffer(caught.stderr));assert.equal(caught.stderr.length,64*1024);
  assert.ok(caught.stderr.toString().endsWith('NO_SPACE_TEST_SENTINEL\n'));
  assert.equal(inspect(caught).includes('NO_SPACE_TEST_SENTINEL'),false,'Ordinary Error inspection must not print private Docker stderr');
  assert.equal(Object.keys(caught).includes('stderr'),false);
  await assert.rejects(readFile(failed),{code:'ENOENT'},'A failed streamed output must be removed');
 }finally{await rm(root,{recursive:true,force:true});}
});
