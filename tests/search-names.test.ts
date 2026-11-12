import {test} from 'node:test';import assert from 'node:assert/strict';
import {searchQueryVariants,matchesSearchText} from '../src/server/search-names';
test('source-backed city names share results across orthography, spacing and hyphens',()=>{
 const queries=['Өскемен','Оскемен','Усть-Каменогорск','Усть - Каменогорск','УСТЬ — КАМЕНОГОРСК','Ust Kamenogorsk','Oskemen'];
 for(const q of queries){assert.ok(matchesSearchText('Усть-Каменогорский городской совет Усть-Каменогорск',q),q);assert.ok(matchesSearchText('Өскемен қаласы',q),q);}
});
test('expanded names retain the other query terms and literal mode stays exact',()=>{
 assert.ok(matchesSearchText('фотографии Усть-Каменогорска','фотографии Өскемен'));
 assert.equal(matchesSearchText('Усть-Каменогорск','фотографии Өскемен'),false);
 assert.equal(matchesSearchText('Усть-Каменогорск','Өскемен','literal'),false);
 assert.deepEqual(searchQueryVariants('0007 Р-1 ч.с.','literal'),['0007 Р-1 ч.с.']);
 assert.deepEqual(searchQueryVariants('0007 Р-1 ч.с.'),['0007 Р-1 ч.с.']);
});
test('ambiguous regional names are not automatically expanded into a city',()=>{
 assert.deepEqual(searchQueryVariants('Алтай'),['Алтай']);assert.equal(matchesSearchText('Зыряновск','Алтай'),false);
});

import {directoryWhere} from '../src/server/reference-directory';
test('registry expansion retains visibility, exact identifiers and source constraints; empty query is unfiltered',()=>{
 const where=directoryWhere('fund',{q:'Өскемен',number:'0007',sourceId:'source-1'});assert.equal(where.isPublic,true);assert.equal(where.number,'0007');assert.deepEqual(where.dataset,{kind:'fund',isPublic:true,id:'source-1'});assert.ok(Array.isArray(where.OR)&&where.OR.length>1);assert.equal(directoryWhere('fund',{q:''}).OR,undefined);
});
