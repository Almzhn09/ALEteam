import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {checkedExplanation} from '../src/server/discovery-explanation';
import type {AuthorizedText} from '../src/contracts/discovery';
import {db} from '../src/server/db';
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
