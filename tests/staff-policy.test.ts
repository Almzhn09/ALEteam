import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {allows,scopedBranches} from '../src/server/staff-policy';
import {contentPayload} from '../src/server/cms';
import {db} from '../src/server/db';
after(()=>db.$disconnect());
test('scoped staff permission never implies global or another branch',()=>{
 const grants=[{permission:'content.write',branchId:'a'}];
 assert.equal(allows(grants,'content.write','a'),true);assert.equal(allows(grants,'content.write','b'),false);assert.equal(allows(grants,'content.write',null),false);assert.equal(allows(grants,'content.write'),false);
});
test('combining assignments does not copy a permission to the wrong branch',()=>{
 const grants=[{permission:'content.write',branchId:'a'},{permission:'content.read',branchId:'b'}];
 assert.equal(allows(grants,'content.write','b'),false);assert.deepEqual(scopedBranches(grants,'content.write'),['a']);
});
test('global grants cover branches; legacy roles by themselves grant nothing',()=>{
 assert.equal(allows([{permission:'content.read',branchId:null}],'content.read','any'),true);assert.equal(scopedBranches([{permission:'content.read',branchId:null}],'content.read'),null);assert.equal(allows([],'content.read','a'),false);
});
test('payload rejects client authority fields, credential URLs and invalid periods',()=>{
 const p={title:'Материал',body:'Описание',rights:'CC0'};
 assert.throws(()=>contentPayload.parse({...p,isPublic:true}));assert.throws(()=>contentPayload.parse({...p,sourceUrl:'https://user:password@example.test/'}));assert.throws(()=>contentPayload.parse({...p,yearFrom:2000,yearTo:1900}));assert.throws(()=>contentPayload.parse({...p,apiKey:'secret'}));
});
