import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {checkedReferenceOriginal,referenceOriginalSpec} from '../scripts/publish-reference-originals';
test('R01 price list uses the exact 15-page official PDF already present in sources',async()=>{
 const bytes=await readFile('sources/archive-reference-20261110/originals/R01-prices.pdf');const source=checkedReferenceOriginal(bytes);assert.equal(source.id,'R01');assert.equal(source.pages,15);assert.equal(source.bytes,1636084);assert.equal(referenceOriginalSpec.slug,'archive-paid-services-info');
});
test('truncated and modified reference originals cannot be published',async()=>{
 const bytes=await readFile('sources/archive-reference-20261110/originals/R01-prices.pdf');assert.throws(()=>checkedReferenceOriginal(bytes.subarray(0,100)),/SOURCE_CHANGED/);const changed=Buffer.from(bytes);changed[changed.length-1]^=1;assert.throws(()=>checkedReferenceOriginal(changed),/SOURCE_CHANGED/);
});
