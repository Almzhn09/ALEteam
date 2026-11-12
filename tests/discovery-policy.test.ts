import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {checkedExplanation} from '../src/server/discovery-explanation';
import type {AuthorizedText} from '../src/contracts/discovery';
import {db} from '../src/server/db';
import {boundedFileFragments} from '../src/server/authorized-file-text';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
after(()=>db.$disconnect());
const input:AuthorizedText={source:{kind:'document',id:'source-1',locale:'ru',revision:'a'.repeat(64),title:'Synthetic source',href:'/api/files/scan-1/ocr'},fingerprint:'b'.repeat(64),sourceSha256:'c'.repeat(64),textSha256:'d'.repeat(64),fragments:[{id:'fragment-1',text:'Original synthetic evidence.',start:10,end:38}],ocr:{used:true,quality:'reviewed'}};
const result={status:'ready',mode:'extractive',sourceRevision:'untrusted',summary:'Original synthetic evidence.',terms:[],citations:[{fragmentId:'fragment-1',quote:'synthetic evidence',source:{href:'javascript:alert(1)',fragment:{page:999}}}],limitations:[]};
test('explanation citation reconstructs source URL/version and real offsets; never accepts an invented page',()=>{
 const safe=checkedExplanation(result,input);assert.equal(safe.sourceRevision,input.fingerprint);assert.equal(safe.citations[0].source.href,input.source.href);assert.equal(safe.citations[0].source.fragment?.start,19);assert.equal(safe.citations[0].source.fragment?.page,undefined);
});
test('explanation rejects invented quotations and fragment identifiers',()=>{
 assert.throws(()=>checkedExplanation({...result,citations:[{...result.citations[0],quote:'Invented history'}]},input));
 assert.throws(()=>checkedExplanation({...result,citations:[{...result.citations[0],fragmentId:'private-file'}]},input));
 assert.throws(()=>checkedExplanation({...result,terms:[{term:'term',explanation:'definition',fragmentIds:['missing']}]},input));
});
test('low-quality text cannot be promoted to a ready explanation',()=>{
 const safe=checkedExplanation(result,{...input,ocr:{...input.ocr,quality:'low'}});assert.equal(safe.status,'low_quality');assert.deepEqual(safe.citations,[]);
});
test('large parsed PDFs respect the combined text budget with true page numbers and offsets',()=>{
 const bounded=boundedFileFragments([{id:'p1',page:7,text:'А'.repeat(8000)},{id:'p2',page:8,text:'Б'.repeat(8000)},{id:'p3',page:9,text:'В'.repeat(8000)}]);
 assert.equal(bounded.text.length,12000);assert.equal(bounded.truncated,true);assert.equal(bounded.fragments.length,2);assert.equal(bounded.fragments[1].page,8);assert.equal(bounded.fragments[1].start,8001);
 for(const fragment of bounded.fragments)assert.equal(bounded.text.slice(fragment.start,fragment.end),fragment.text);
 assert.equal(boundedFileFragments([{id:'p',text:'Full source.'}]).truncated,false);
});
test('source bundle upgrades tolerate editorial README changes while rejecting changed originals',async()=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'archive-source-bundle-'));
 try{
  const source=path.join(temporary,'sources/archive-20261110'),storage=path.join(temporary,'private');await mkdir(path.join(source,'originals'),{recursive:true});
  await writeFile(path.join(source,'manifest.json'),'{}');await writeFile(path.join(source,'originals/source.txt'),'immutable source');await writeFile(path.join(source,'README.md'),'Initial editorial notes');
  const command=()=>execFileSync(process.execPath,[path.resolve('scripts/persist-source-bundle.mjs')],{cwd:temporary,env:{...process.env,FILE_STORAGE_ROOT:storage},stdio:'pipe'});
  for(const extra of ['archive-public-20261111','archive-reference-20261110']){await mkdir(path.join(temporary,'sources',extra),{recursive:true});await writeFile(path.join(temporary,'sources',extra,'manifest.json'),'{}');}
  command();await writeFile(path.join(source,'README.md'),'Corrected editorial notes');command();assert.equal(await readFile(path.join(storage,'source-bundles/archive-20261110/originals/source.txt'),'utf8'),'immutable source');
  // An expanded publication allowlist is metadata, not a replacement of an original.
  const manifest=path.join(source,'manifest.json'),stored=path.join(storage,'source-bundles/archive-20261110');
  await writeFile(manifest,'{"records":["new authorized source"]}');await writeFile(path.join(source,'originals/extra.txt'),'additional original');command();command();
  assert.equal(await readFile(path.join(stored,'manifest.json'),'utf8'),await readFile(manifest,'utf8'));
  const versions=await Promise.all((await readdir(path.join(stored,'.manifest-history'))).map(name=>readFile(path.join(stored,'.manifest-history',name),'utf8')));
  assert.deepEqual(versions.sort(),['{}','{"records":["new authorized source"]}'].sort());
  await writeFile(manifest,'{"records":["must not activate on conflict"]}');
  await writeFile(path.join(source,'originals/source.txt'),'unexpected replacement');assert.throws(command);assert.equal(await readFile(path.join(storage,'source-bundles/archive-20261110/originals/source.txt'),'utf8'),'immutable source');
  assert.equal(await readFile(path.join(stored,'manifest.json'),'utf8'),'{"records":["new authorized source"]}');
  await writeFile(path.join(source,'originals/source.txt'),'immutable source');
  await rm(path.join(stored,'manifest.json'));await writeFile(path.join(temporary,'outside.json'),'{}');await symlink(path.join(temporary,'outside.json'),path.join(stored,'manifest.json'));
  assert.throws(command);assert.equal(await readFile(path.join(temporary,'outside.json'),'utf8'),'{}');
 }finally{await rm(temporary,{recursive:true,force:true});}
});
