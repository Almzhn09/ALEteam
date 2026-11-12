import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../data/artur/migration-fixture.json';
import {auditMigrationManifest,compareMigrationManifests} from '../src/server/migration-audit';
const copy=()=>structuredClone(fixture);
test('synthetic manifest preserves leading zeros, original language and closed master',()=>{
 const r=auditMigrationManifest(fixture);assert.equal(r.valid,true);assert.equal(r.counts?.documents,1);
 assert.equal(fixture.documents[0].number,'000009');assert.equal(fixture.documents[0].originalLanguage,'kk');
});
test('order-independent roundtrip includes reference strings and all relationships',()=>{
 const data=copy();data.branches.reverse();assert.equal(compareMigrationManifests(fixture,data).equal,true);
 data.funds[0].number='7';assert.equal(compareMigrationManifests(fixture,data).equal,false);
});
test('changed parent or file hash cannot pass roundtrip',()=>{
 const data=copy();data.documents[0].caseId='fixture-case-b';assert.equal(auditMigrationManifest(data).valid,true);assert.equal(compareMigrationManifests(fixture,data).equal,false);
 const changed=copy();changed.files[0].sha256='1'.repeat(64);assert.equal(compareMigrationManifests(fixture,changed).equal,false);
});
test('duplicate identity, same-parent reference and source are conflicts',()=>{
 const id=copy();id.documents.push({...id.documents[0]});assert.ok(auditMigrationManifest(id).issues.some(x=>x.code==='duplicate-id'));
 const number=copy();number.cases.push({...number.cases[0],id:'fixture-case-duplicate'});assert.ok(auditMigrationManifest(number).issues.some(x=>x.code==='duplicate-number-in-parent'));
 const source=copy();source.documents.push({...source.documents[0],id:'fixture-doc-duplicate',number:'000010'});assert.ok(auditMigrationManifest(source).issues.some(x=>x.code==='duplicate-source'));
});
test('missing parents and numeric references are rejected',()=>{
 const data=copy();data.documents[0].caseId='missing';assert.equal(auditMigrationManifest(data).valid,false);
 assert.equal(auditMigrationManifest({...fixture,funds:[{...fixture.funds[0],number:7}]}).valid,false);
});
test('restricted card may be public while copy remains inaccessible',()=>{
 const data=copy();data.files[0].public=true;
 assert.ok(auditMigrationManifest(data).issues.some(x=>x.code==='unauthorized-copy'));
 data.documents[0].copyPublic=true;assert.equal(auditMigrationManifest(data).valid,true);
 data.documents[0].rightsConfirmed=false;assert.equal(auditMigrationManifest(data).valid,false);
});
test('invalid mime, hash, period and unknown private fields fail validation',()=>{
 for(const patch of [{mime:'text/html'},{sha256:'bad'}, {bytes:-1}]){const data=copy();Object.assign(data.files[0],patch);assert.equal(auditMigrationManifest(data).valid,false);}
 const dates=copy();dates.documents[0].yearFrom=1970;assert.ok(auditMigrationManifest(dates).issues.some(x=>x.code==='invalid-period'));
 assert.equal(auditMigrationManifest({...fixture,password:'not-a-manifest-field'}).valid,false);
});
