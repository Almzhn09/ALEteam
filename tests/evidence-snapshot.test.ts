import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveEvidence,resolveCmsItem,type CmsItemWithRevisions} from '../src/server/discovery-materials';
const item={id:'source-1',slug:'public-source',kind:'PAGE',branchId:null,isDemo:false,revisions:[{id:'revision-1',locale:'ru',status:'PUBLISHED',authorId:'author',reviewerId:'reviewer',updatedAt:new Date('2026-11-12T00:00:00Z'),payload:{title:'Проверенный источник',body:'Исходный текст',rights:'Публикация разрешена'}}]} as unknown as CmsItemWithRevisions;
test('a request-local evidence reader accepts only exact current published revisions',async()=>{
 const snapshot=resolveCmsItem(item,'ru')!;
 assert.deepEqual(await resolveEvidence([snapshot.source],undefined,async()=>snapshot),[snapshot.source]);
 const changed=resolveCmsItem({...item,revisions:[{...item.revisions[0],payload:{...(item.revisions[0].payload as object),body:'Изменённый текст'}}]},'ru')!;
 assert.equal(await resolveEvidence([snapshot.source],undefined,async()=>changed),undefined);
 assert.equal(await resolveEvidence([snapshot.source],undefined,async()=>undefined),undefined);
});
test('batched evidence cannot admit draft, withdrawn, missing-review or self-approved sources',async()=>{
 const source=resolveCmsItem(item,'ru')!.source;
 for(const patch of [{status:'DRAFT'},{status:'ARCHIVED'},{reviewerId:null},{reviewerId:'author'}]){
  const current=resolveCmsItem({...item,revisions:[{...item.revisions[0],...patch}]} as CmsItemWithRevisions,'ru');
  assert.equal(current,undefined);assert.equal(await resolveEvidence([source],undefined,async()=>current),undefined);
 }
 assert.equal(await resolveEvidence([],undefined,async()=>undefined),undefined);
});
