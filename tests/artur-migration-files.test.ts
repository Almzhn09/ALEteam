import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import fixture from '../data/artur/migration-fixture.json';
import scans from '../data/scans/manifest.json';
import {verifyMigrationFiles} from '../src/server/migration-files';
function manifest(bytes:Buffer){const data=structuredClone(fixture);data.files[0].mime='application/pdf';data.files[0].bytes=bytes.length;data.files[0].sha256=createHash('sha256').update(bytes).digest('hex');return data;}
test('verify every existing original demo scan against its recorded hash',async()=>{
 const data=structuredClone(fixture);data.files=scans.map(f=>({id:f.id,documentId:'fixture-doc-a',kind:'PREVIEW',sha256:f.sha256,bytes:f.size,mime:'image/png',public:false}));
 const r=await verifyMigrationFiles(data,'data/scans',Object.fromEntries(scans.map(f=>[f.id,f.storageKey])));
 assert.equal(r.valid,true);assert.equal(r.files.length,5);
});
test('checks actual bytes, missing files, limits and symlinks without leaking paths',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'artur-files-'));const outside=await mkdtemp(join(tmpdir(),'artur-outside-'));
 try{
  const bytes=Buffer.from('%PDF-1.4\noriginal synthetic sheet');const data=manifest(bytes);
  await writeFile(join(dir,'sheet.bin'),bytes);
  assert.equal((await verifyMigrationFiles(data,dir,{'fixture-master':'sheet.bin'})).valid,true);
  const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]=33;await writeFile(join(dir,'sheet.bin'),corrupt);
  assert.equal((await verifyMigrationFiles(data,dir,{'fixture-master':'sheet.bin'})).files[0].reason,'checksum');
  for(const path of ['../secret','/etc/passwd','missing.bin'])assert.equal((await verifyMigrationFiles(data,dir,{'fixture-master':path})).valid,false);
  await writeFile(join(outside,'outside.bin'),bytes);await symlink(join(outside,'outside.bin'),join(dir,'link.bin'));
  const r=await verifyMigrationFiles(data,dir,{'fixture-master':'link.bin'});assert.equal(r.valid,false);assert.ok(!JSON.stringify(r).includes(outside));
  assert.equal((await verifyMigrationFiles(data,dir,{'fixture-master':'sheet.bin'},1)).files[0].reason,'size');
  const mislabeled=structuredClone(data);mislabeled.files[0].mime='image/jpeg';
  assert.equal((await verifyMigrationFiles(mislabeled,dir,{'fixture-master':'sheet.bin'})).files[0].reason,'mime');
  await assert.rejects(()=>verifyMigrationFiles(data,dir,{'unknown':'sheet.bin'}));
  await assert.rejects(()=>verifyMigrationFiles(data,dir,{},0));
 }finally{await rm(dir,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
