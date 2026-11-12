import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveCmsItem,type CmsItemWithRevisions} from '../src/server/discovery-materials';import {cmsSnapshotMatchesFilters} from '../src/server/material-search';
function row(locale='ru',status='PUBLISHED',reviewerId:string|null='reviewer'){return {id:'revision-'+locale,locale,status,reviewerId,authorId:'author',updatedAt:new Date('2026-11-12T00:00:00Z'),payload:{title:'Архив Өскемен',body:'Сведения об Усть-Каменогорске',rights:'Открытая публикация',category:'История',yearFrom:1940,yearTo:1945,tags:['город']}};}
function item(revisions=[row()]){return {id:'cms-1',slug:'source-page',kind:'PAGE',branchId:'branch-1',isDemo:false,revisions} as unknown as CmsItemWithRevisions;}
test('batch snapshot retains approved source edition and excludes draft/self-approved revisions',()=>{
 const source=item([row(),row('en','DRAFT'),row('kk','PUBLISHED','author')]);const snap=resolveCmsItem(source,'en',true);assert.ok(snap);assert.equal(snap.source.locale,'ru');assert.deepEqual(snap.material.availableLocales,['ru']);assert.equal(resolveCmsItem(source,'en',false),undefined);assert.equal(resolveCmsItem(item([row('ru','ARCHIVED')]),'ru',true),undefined);
});
test('batch filtering retains dates, branch, kind, categories, tags and exact literal behavior',()=>{
 const source=item();const snap=resolveCmsItem(source,'ru')!;
 assert.ok(cmsSnapshotMatchesFilters(source,snap,{q:'Оскемен',yearFrom:1944,yearTo:1944,branchId:'branch-1'}));
 for(const filters of [{yearFrom:1946},{yearTo:1939},{branchId:'another'},{contentKind:'NEWS'},{category:'Другой'},{tag:'нет'},{type:'PHOTO'},{reference:'0007'},{q:'Oskemen',nameMode:'literal'}])assert.equal(cmsSnapshotMatchesFilters(source,snap,filters),false,JSON.stringify(filters));
});
