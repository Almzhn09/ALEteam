import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../data/artur/import-fixture.json';
import {catalogImportSchema, importManifestDigest, importDocumentHash, importStructureIssues} from '../src/server/catalog-import-schema';
const parsed=()=>catalogImportSchema.parse(structuredClone(fixture));
test('import manifest preserves original numbers, languages, explicit demo status and missing translations',()=>{
 const data=parsed();assert.deepEqual(importStructureIssues(data),[]);assert.equal(data.funds[0].number,'0007');assert.equal(data.cases[0].number,'0003/А');
 assert.equal(data.documents[0].sourceId,'000009');assert.equal(data.documents[0].metadata.originalLanguage,'kk');assert.deepEqual(data.documents[1].translations,{});
});
test('batch digest ignores top-level row order but not accounting strings, relationships or translated text',()=>{
 const data=parsed(),ordered=parsed();ordered.documents.reverse();ordered.funds.reverse();ordered.inventories.reverse();ordered.cases.reverse();
 assert.equal(importManifestDigest(data),importManifestDigest(ordered));ordered.funds[0].number='8';assert.notEqual(importManifestDigest(data),importManifestDigest(ordered));
 const changed=parsed();changed.documents[0].translations.en!.description+=' changed';assert.notEqual(importDocumentHash(data,data.documents[0]),importDocumentHash(changed,changed.documents[0]));
});
test('missing parents, duplicate source/reference and wrong-fund case references cannot pass planning',()=>{
 const wrong=parsed();wrong.documents[0].caseKey='case-b';assert.ok(importStructureIssues(wrong).some(i=>i.code==='wrong-fund'));
 const missing=parsed();missing.inventories[0].fundKey='absent';assert.ok(importStructureIssues(missing).some(i=>i.code==='missing-parent'));
 const duplicate=parsed();duplicate.documents.push(structuredClone(duplicate.documents[0]));const codes=importStructureIssues(duplicate).map(i=>i.code);assert.ok(codes.includes('duplicate-source'));assert.ok(codes.includes('duplicate-reference'));
 const number=parsed();number.cases.push({...number.cases[0],key:'another'});assert.ok(importStructureIssues(number).some(i=>i.code==='duplicate-number-in-parent'));
});
test('staff identities, publication states, direct case IDs, private notes and file paths cannot be smuggled into imports',()=>{
 for(const patch of [{status:'PUBLISHED'},{authorId:'other'},{storageKey:'/etc/passwd'}])assert.throws(()=>catalogImportSchema.parse({...fixture,...patch}));
 for(const patch of [{caseId:'direct-db-id'},{internalNotes:'private'},{isPublic:true},{sourceUrl:'file:///etc/passwd'}]){const data=structuredClone(fixture);Object.assign(data.documents[0].metadata,patch);assert.throws(()=>catalogImportSchema.parse(data));}
 const data=structuredClone(fixture);Object.assign(data.documents[0].translations.en!,{year:2020});assert.throws(()=>catalogImportSchema.parse(data));
 assert.throws(()=>catalogImportSchema.parse({...fixture,funds:[{...fixture.funds[0],number:7}]}));
});
test('official import needs provenance, invalid periods and trimmed accounting identifiers are rejected',()=>{
 const data=parsed();data.isDemo=false;data.documents[0].metadata.sourceNote=null;data.documents[0].translations.en!.sourceNote=null;assert.ok(importStructureIssues(data).some(i=>i.code==='source-required'));
 assert.throws(()=>catalogImportSchema.parse({...fixture,funds:[{...fixture.funds[0],number:' 0007'}]}));
 const dates=structuredClone(fixture);dates.documents[0].metadata.year=1970;assert.throws(()=>catalogImportSchema.parse(dates));
});
