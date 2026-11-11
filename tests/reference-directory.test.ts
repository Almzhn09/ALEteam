import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {referencePackage} from '../src/server/reference-import';
import {directoryDTO,directoryQuery} from '../src/server/reference-directory';
import {db} from '../src/server/db';
after(()=>db.$disconnect());
test('complete real reference package preserves 1705 literal fund groups and 1466 newspaper rows without archival documents',async()=>{
 const sets=await referencePackage();assert.deepEqual(sets.map(s=>s.records.length),[1552,153,1466]);const record=sets[0].records[0];assert.equal(record.number,'Р-1 ч.с.');assert.ok((record.payload as any).names.length>1);assert.equal(sets[0].source.asOf,null);assert.equal(sets[2].source.asOf,'2018-01-01');assert.equal(sets[2].records.at(-1)!.position,1465);
 const dto=directoryDTO({...record,raw:{private:'DO_NOT_EXPORT'},isPublic:true,datasetId:sets[0].id,dataset:{...sets[0],importHash:'test',isPublic:true,createdAt:new Date()}} as unknown as Parameters<typeof directoryDTO>[0]);assert.equal(dto.kind,'fund');assert.ok(!JSON.stringify(dto).includes('DO_NOT_EXPORT'));assert.equal(dto.source.holder,null);assert.equal(dto.source.branchId,null);
});
test('directory query preserves exact accounting identifiers and rejects caller paths and unbounded pages',()=>{
 assert.equal(directoryQuery.parse({number:'0005-а/ч.с.'}).number,'0005-а/ч.с.');assert.throws(()=>directoryQuery.parse({pageSize:100000}));assert.throws(()=>directoryQuery.parse({storageKey:'/tmp/private'}));
});
