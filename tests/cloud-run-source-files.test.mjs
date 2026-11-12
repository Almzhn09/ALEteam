import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {restoreSourceFiles} from '../deploy/cloud-run/restore-source-files.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(fn){const root=await mkdtemp(path.join(tmpdir(),'ale-file-restore-test-')),source=path.join(root,'source'),target=path.join(root,'target');await mkdir(source);await mkdir(target);try{await fn({root,sourceRoot:source,targetRoot:target});}finally{await rm(root,{recursive:true,force:true});}}
async function sourceFile(sourceRoot,bytes){await mkdir(path.join(sourceRoot,'uploads'),{recursive:true});const key='uploads/'+randomUUID()+'.bin';await writeFile(path.join(sourceRoot,key),bytes);return key;}
function row(bytes){return {storageKey:'uploads/'+randomUUID()+'.bin',expectedSha256:sha(bytes),expectedBytes:bytes.length,previewKey:null,previewSha256:null,previewBytes:null};}
test('a new build restores unchanged original bytes at the persistent database upload path',()=>fixture(async f=>{
 const bytes=Buffer.from('%PDF-1.7 real source fixture'),attachment=row(bytes),image=Buffer.from([137,80,78,71,13,10,26,10,42]);const freshKey=await sourceFile(f.sourceRoot,bytes);await sourceFile(f.sourceRoot,image);
 attachment.previewKey='previews/'+randomUUID()+'.png';attachment.previewSha256=sha(image);attachment.previewBytes=image.length;
 const result=await restoreSourceFiles({...f,attachments:[attachment]});assert.notEqual(freshKey,attachment.storageKey);assert.equal(result.restored,2);assert.deepEqual(await readFile(path.join(f.targetRoot,attachment.storageKey)),bytes);assert.deepEqual(await readFile(path.join(f.targetRoot,attachment.previewKey)),image);
 const repeat=await restoreSourceFiles({...f,attachments:[attachment]});assert.equal(repeat.restored,0);assert.equal(repeat.alreadyPresent,2);
}));
test('unlisted files and unavailable hashes cannot be substituted for a missing original',()=>fixture(async f=>{
 const bytes=Buffer.from('unrelated source'),missing=row(Buffer.from('different bytes'));await sourceFile(f.sourceRoot,bytes);const r=await restoreSourceFiles({...f,attachments:[missing]});assert.equal(r.unavailable,1);assert.deepEqual(await readdir(f.targetRoot),[]);
}));
test('path traversal in stored keys is rejected',()=>fixture(async f=>{
 const bytes=Buffer.from('safe'),attachment={...row(bytes),storageKey:'../outside'};await sourceFile(f.sourceRoot,bytes);await assert.rejects(restoreSourceFiles({...f,attachments:[attachment]}),/INVALID_SOURCE_FILE_METADATA/);
}));
test('source symlinks are not followed',()=>fixture(async f=>{
 const bytes=Buffer.from('private outside snapshot'),outside=path.join(f.root,'private');await writeFile(outside,bytes);await symlink(outside,path.join(f.sourceRoot,'link'));const r=await restoreSourceFiles({...f,attachments:[row(bytes)]});assert.equal(r.unavailable,1);assert.equal(r.restored,0);
}));
test('an existing destination symlink or conflicting file is never overwritten',()=>fixture(async f=>{
 const bytes=Buffer.from('public source'),attachment=row(bytes);await sourceFile(f.sourceRoot,bytes);await mkdir(path.join(f.targetRoot,'uploads'));const outside=path.join(f.root,'outside');await writeFile(outside,bytes);await symlink(outside,path.join(f.targetRoot,attachment.storageKey));await assert.rejects(restoreSourceFiles({...f,attachments:[attachment]}),/SOURCE_FILE_STORAGE_CONFLICT/);assert.deepEqual(await readFile(outside),bytes);
}));
test('a symlink upload directory cannot redirect restoration outside private storage',()=>fixture(async f=>{
 const bytes=Buffer.from('source'),attachment=row(bytes),outside=path.join(f.root,'outside');await sourceFile(f.sourceRoot,bytes);await mkdir(outside);await symlink(outside,path.join(f.targetRoot,'uploads'));await assert.rejects(restoreSourceFiles({...f,attachments:[attachment]}),/UNSAFE_SOURCE_FILE_DIRECTORY/);assert.deepEqual(await readdir(outside),[]);
}));
