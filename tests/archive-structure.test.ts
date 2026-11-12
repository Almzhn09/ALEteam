import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archiveStructure} from '../src/lib/archive-structure';
test('source structure keeps all seven departments and named leaders once, without layout-table duplicates',()=>{
 const body=readFileSync('sources/archive-20261110/text/S07--Структура.docx.txt','utf8');const result=archiveStructure(body);assert.ok(result);assert.equal(result.departments.length,7);assert.equal(result.leadership.length,3);assert.equal(result.departments.filter(d=>d.title==='Отдел финансовой и кадровой работы').length,1);
 const text=JSON.stringify(result);for(const email of body.match(/[\w.]+@[\w.]+/g)??[])assert.ok(text.includes(email));assert.ok(text.includes('Отдел экспертизы ценности документов'));assert.ok(!text.includes(' | '));
});
test('an unfamiliar edited structure keeps the generic source renderer rather than dropping content',()=>{
 assert.equal(archiveStructure('Unrecognised structure\nDepartment: source text'),null);assert.equal(archiveStructure('Директор - Имя\nНеизвестная строка\nОтдел архивов:\nРуководитель'),null);
});
