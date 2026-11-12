import {test} from 'node:test';import assert from 'node:assert/strict';
import {publicSearchQuery,publicSearchAnswer,type PublicSearchPassage} from '../src/server/public-search-knowledge';
import {semanticCatalogPlan} from '../src/server/semantic-catalog-plan';
test('generic city document requests retain their place and use the public material corpus',()=>{
 for(const city of ['Усть-Каменогорск','Өскемен','Оскемен','Усть - Каменогорск']){const p=semanticCatalogPlan('покажи документы про '+city,'ru');assert.equal(p.handled,true,city);assert.ok(publicSearchQuery(p)?.includes('Усть-Каменогорск'),city);}
});
test('fallback never discards exact accounting or unsupported document-type constraints',()=>{
 for(const q of ['Найди фото Өскемен','Найди документ шифр Р-1/0007','Покажи документы фонд 0007'])assert.equal(publicSearchQuery(semanticCatalogPlan(q,'ru')),undefined,q);
 const p=semanticCatalogPlan('Покажи документы про Алтай','ru');assert.equal(p.clarification,'place');assert.equal(publicSearchQuery(p),undefined);
});
test('answer distinguishes holdings and CMS from scans and retains actual source identifiers',()=>{
 const passages:PublicSearchPassage[]=[{id:'rf-real',recordId:'rf-real',kind:'fund',title:'Р-1 — Городской совет',href:'/api/directories/funds/rf-real',locale:'ru',fingerprint:'actual',text:'Наименование из источника'}];
 const a=publicSearchAnswer(passages,'ru');assert.equal(a.noAnswer,false);assert.deepEqual(a.sourceIds,['rf-real']);assert.ok(a.answer.includes('Справочник фондов'));assert.ok(a.answer.includes('не означает наличие скана'));assert.ok(!a.answer.includes('1000 документов'));
});
