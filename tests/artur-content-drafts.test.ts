import {test} from 'node:test';
import assert from 'node:assert/strict';
import pack from '../data/artur/content-pack.json';
import {arturDraftPackage} from '../src/server/artur-content-drafts';
import {contentPayload} from '../src/server/cms';
test('draft package produces real CMS payloads in three languages without publication controls',()=>{
 const result=arturDraftPackage(pack);assert.equal(result.records.length,7);assert.equal(result.draftsOnly,true);
 for(const row of result.records){assert.ok(row.requiresReview);assert.equal(row.create.locale,'ru');assert.equal(row.create.branchId,null);for(const request of [row.create,...row.translations]){assert.equal(contentPayload.safeParse(request.payload).success,true);assert.equal('status' in request,false);assert.equal('reviewerId' in request,false);}assert.deepEqual(row.translations.map(x=>x.locale),['kk','en']);}
 const contact=result.records.find(r=>r.externalId==='archive-contact')!;assert.equal(contact.create.kind,'FAQ');assert.equal('latitude' in contact.create.payload,false);
});
test('unreviewed package cannot be silently promoted or accept duplicate identities',()=>{
 const promoted=structuredClone(pack);promoted.records[0].publicationAllowed=true;assert.throws(()=>arturDraftPackage(promoted));
 const duplicate=structuredClone(pack);duplicate.records.push(duplicate.records[0]);assert.throws(()=>arturDraftPackage(duplicate));
});
