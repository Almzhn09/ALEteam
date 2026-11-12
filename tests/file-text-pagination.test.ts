import {test} from 'node:test';import assert from 'node:assert/strict';
import {boundedFileFragments,pagedFileFragments} from '../src/server/authorized-file-text';
test('the default reader page keeps current bounded excerpts and citation offsets',()=>{
 const source=[{id:'a',paragraph:1,text:'Первый абзац'},{id:'b',paragraph:2,text:'Второй абзац'}],old=boundedFileFragments(source,18),page=pagedFileFragments(source,0,18);assert.equal(page.text,old.text);assert.deepEqual(page.fragments,old.fragments);assert.ok(page.nextOffset!==null);assert.equal(page.totalCharacters,source.map(x=>x.text).join('\n').length);
});
test('a long paragraph can be read to the end instead of silently losing everything after the first 12000 characters',()=>{
 const text='А'.repeat(31003),source=[{id:'a',paragraph:1,text}];let offset=0,result='',pages=0;while(true){const page=pagedFileFragments(source,offset);result+=page.fragments.map(f=>f.text).join('');pages++;if(page.nextOffset===null)break;assert.ok(page.nextOffset>offset);offset=page.nextOffset;assert.ok(pages<5);}assert.equal(result,text);assert.equal(pages,3);
});
test('pagination preserves every paragraph character across fragment boundaries',()=>{
 const source=[{id:'a',text:'a'.repeat(7)},{id:'b',text:'b'.repeat(13)},{id:'c',text:'c'.repeat(5)}];const collected=new Map<string,string>();let offset=0;for(let i=0;i<20;i++){const page=pagedFileFragments(source,offset,8);for(const f of page.fragments)collected.set(f.id,(collected.get(f.id)??'')+f.text);if(page.nextOffset===null)break;assert.ok(page.nextOffset>offset);offset=page.nextOffset;}for(const f of source)assert.equal(collected.get(f.id),f.text);assert.deepEqual(pagedFileFragments(source,999).fragments,[]);
});
