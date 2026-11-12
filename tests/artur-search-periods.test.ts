import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archiveSearchIntent} from '../src/server/archive-search-intent';
import {qualityRecommendations} from '../src/server/site-quality';
for (const q of ['Фото Өскемен 1960-х','Фотографии Усть-Каменогорска 1960-х годов','Photos of Oskemen in the 1960s','Өскеменнің 1960 жылдардағы фотосуреттері']) test('decade and aliases: '+q,()=>{
 const r=archiveSearchIntent(q);assert.equal(r.type,'PHOTO');assert.equal(r.placeId,'ust-kamenogorsk');assert.equal(r.yearFrom,1960);assert.equal(r.yearTo,1969);
});
for(const q of ['photos before 1960','фото до 1960','фотосурет 1960 жылға дейін'])test('strict upper bound: '+q,()=>{
 const r=archiveSearchIntent(q);assert.equal(r.yearFrom,undefined);assert.equal(r.yearTo,1959);
});
for(const q of ['photos after 1960','фото после 1960','фотосурет 1960 жылдан кейін'])test('strict lower bound: '+q,()=>{
 const r=archiveSearchIntent(q);assert.equal(r.yearFrom,1961);assert.equal(r.yearTo,undefined);
});
test('range is inclusive but reversed and conflicting periods require clarification',()=>{
 const r=archiveSearchIntent('фото 1960–1969');assert.equal(r.yearFrom,1960);assert.equal(r.yearTo,1969);
 for(const q of ['photos 1970–1960','photos 1960 1970 1980','photos before 1960 after 1950','photos 1960s 1975']){const r=archiveSearchIntent(q);assert.ok(r.clarification);assert.equal(r.yearFrom,undefined);assert.equal(r.yearTo,undefined);}
});
test('lookalikes and drawings do not silently become photos or known places',()=>{
 for(const q of ['photosynthesis 1960','surrealist Ust-Kamenogorskian','сурет','фотосинтез'])assert.equal(archiveSearchIntent(q).type,undefined);
 for(const q of ['Ust-Kamenogorskian','неусть-каменогорск'])assert.equal(archiveSearchIntent(q).placeId,undefined);
 assert.equal(archiveSearchIntent('document 119601').yearFrom,undefined);
 assert.throws(()=>archiveSearchIntent('x'.repeat(4001)));
});
const row={topicId:'catalog',periodStart:'2026-11-01',periodEnd:'2026-11-08',searches:20,emptyResults:8,stalePages:0};
test('privacy allowlist prevents identifiers disguised as topics',()=>{
 for(const topicId of ['john-smith','passport12345','test@example.com'])assert.throws(()=>qualityRecommendations([{...row,topicId}]));
});
test('dates must exist and duplicate counts cannot manufacture recommendations',()=>{
 for(const periodStart of ['2026-02-30','2026-1-1','not-a-date'])assert.throws(()=>qualityRecommendations([{...row,periodStart}]));
 assert.throws(()=>qualityRecommendations([row,row]));assert.equal(qualityRecommendations([]).length,0);
});
