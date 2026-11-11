import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import packet from '../data/artur/real-content-v2/publication-manifest.json';
import files from '../data/artur/real-content-v2/files.json';
import curation from '../data/artur/real-content-v2/curation.json';
import cases from '../data/artur/real-content-v2/acceptance-cases.json';
import images from '../sources/archive-visual-20261111/manifest.json';
import compared from '../data/artur/real-content-v2/verified-excerpts.json';
import {contentPayload,checkPayload} from '../src/server/cms';
import {sourceExcerpt,sourceQueryTerms} from '../src/server/artur-discovery/source-excerpts';
import {cmsAnswer} from '../src/server/cms-grounding';
import {explainFragments} from '../src/server/artur-discovery/explanation';
import {guides,guideText,guideTitle} from '../src/server/guides';
import {prepareRealCuration} from '../src/server/artur-discovery/real-publication';
import {parseFact} from '../src/server/discovery-facts';
import {directoryIntent,directoryAnswer} from '../src/server/directory-knowledge';
import {assistantSourceLink} from '../src/lib/assistant-source-link';

test('real publication packet passes current CMS validation and excludes unrelated source worksheets',()=>{
 const keys=new Set<string>();
 for(const r of packet.records){
  assert.ok(!keys.has(r.sourceKey));keys.add(r.sourceKey);
  const p=contentPayload.parse(r.request.payload);checkPayload(r.request.kind,p,false);
  assert.equal(r.request.isDemo,false);assert.equal(r.decision,'PUBLISH');
  assert.doesNotMatch(JSON.stringify(p),/DEMO-|ДЕМОНСТРАЦИОННЫЙ МАТЕРИАЛ|IP VPN/);
  assert.equal(createHash('sha256').update(p.body).digest('hex'),r.contentSha256);
  for(const key of r.attachments)assert.ok(files.files.some(f=>f.key===key));
  if(r.sourceIds.includes('S01')){
   assert.equal(r.attachments.length,0);
   assert.ok(!('email' in p)||!/(?:alimvko|qov\.kz)/.test(p.email!));
   assert.equal(p.latitude,undefined);assert.equal(p.longitude,undefined);
  }
 }
 assert.ok(!packet.records.some(r=>r.sourceIds.includes('S08')));
 assert.ok(packet.records.some(r=>r.sourceKey==='decree-142-ru'));
 assert.ok(packet.records.some(r=>r.sourceKey==='compliance-analysis-2026-ru'));
 assert.equal(packet.records.filter(r=>r.branchSourceKey).length,13);
 assert.equal(new Set(packet.records.filter(r=>r.section==='calendar').map(r=>r.materialKey)).size,5);
});

test('all prepared attachments and selected images retain the actual source hashes',async()=>{
 for(const f of [...files.files,...images.images]){
  const b=await readFile(f.path);
  assert.equal(b.length,f.bytes,f.path);
  assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256,f.path);
 }
 for(const image of images.images){
  if('pageSnapshot' in image){
   const b=await readFile(image.pageSnapshot!);
   assert.equal(createHash('sha256').update(b).digest('hex'),image.pageSha256);
  }
 }
});

test('prepared source comparisons retain exact text offsets or an explicitly identified original PDF page',async()=>{
 for(const row of compared.records){
  assert.equal(row.confidence,null);
  if('textPath' in row&&row.textPath){
   const bytes=await readFile(row.textPath),text=bytes.toString('utf8');
   assert.equal(createHash('sha256').update(bytes).digest('hex'),row.textSha256);
   assert.equal(text.slice(row.offset!,row.offset!+row.quote.length),row.quote);
  }else{
   assert.equal(row.basis,'visual_transcription');assert.equal(row.page,4);
   assert.equal(createHash('sha256').update(await readFile(row.originalPath!)).digest('hex'),row.sourceSha256);
   assert.ok(row.proofImage);
  }
 }
});

test('curation retains exact source quotations and avoids invented archive holdings or view counts',()=>{
 const body=(key:string)=>packet.records.find(r=>r.sourceKey===key)!.request.payload.body;
 for(const fact of curation.assertions)for(const b of fact.evidenceBindings){
  assert.ok(body(b.sourceKey).includes(b.quote),fact.draftKey);
  assert.equal(createHash('sha256').update(body(b.sourceKey)).digest('hex'),b.cmsBodySha256);
 }
 for(const link of curation.links)for(const b of link.evidence)assert.ok(body(b.sourceKey).includes(b.quote));
 for(const row of curation.editorial){assert.equal(row.viewCounts,null);assert.ok(packet.records.some(r=>r.materialKey===row.materialKey));}
 assert.deepEqual(curation.editorial.slice(0,3).map(r=>r.sourceKey),['history-1','calendar-2026-ru','fonds-guide']);
 assert.ok(!curation.topics.some(t=>t.id==='photos'));
 const history=curation.assertions.filter(f=>f.proposedKind==='HISTORY');
 assert.equal(history.length,9);
 assert.ok(!history.some(f=>/Пермитин|Курдаков|телефонная станция|высшей начальной школы/u.test(JSON.stringify(f.data))));
});

test('answers quote a matching late history paragraph instead of truncating the first 4000 characters',()=>{
 const r=packet.records.find(r=>r.sourceKey==='history-1')!;
 const body=r.request.payload.body;
 assert.ok(body.indexOf('2013')>4000);
 const q='Постановление января 2013';
 const excerpt=sourceExcerpt(body,q);
 assert.match(excerpt.text,/2013/);
 assert.equal(excerpt.text,body.slice(excerpt.start,excerpt.end));
 const answer=cmsAnswer([{id:'cms_live',revisionId:'live',title:r.request.payload.title,text:body,isDemo:false,kind:'cms',href:'/api/content/archive-history-1?locale=ru',stamp:'current'}],'ru',q);
 assert.match(answer.answer,/2013/);
 assert.ok(!answer.answer.includes('ДЕМО'));
});

test('real source evaluation cases have matching verbatim evidence and useful bounded query terms',()=>{
 for(const c of cases.cases){
  for(const key of c.sourceKeys){
   const p=packet.records.find(r=>r.sourceKey===key)!.request.payload;
   const excerpt=sourceExcerpt(p.body,c.question);
   for(const term of c.mustContain)assert.ok((p.title+'\n'+excerpt.text).includes(term),c.id+': '+term);
   assert.ok(sourceQueryTerms(c.question).length>0,c.id);
  }
 }
 assert.deepEqual(sourceQueryTerms('Когда был образован архив?'),['образо']);
 assert.deepEqual(sourceQueryTerms('Во сколько работает читальный зал?'),['работ','читаль','зал']);
 assert.deepEqual(sourceQueryTerms('Постановление №142'),['постан','142']);
 assert.deepEqual(sourceQueryTerms('Когда было принято постановление №142?'),['постан','142']);
 assert.deepEqual(sourceQueryTerms('Где находится архив?'),['адрес']);
 assert.deepEqual(sourceQueryTerms('Какой график работы архива?'),['работ']);
});

test('explanation engine reads real CMS paragraphs and cites the exact provided text',()=>{
 const r=packet.records.find(r=>r.sourceKey==='decree-142-ru')!;
 const text=r.request.payload.body;
 const result=explainFragments({source:{id:'cms_decree',kind:'cms',locale:'ru',revision:'current',title:r.request.payload.title,href:'/api/content/archive-decree-142?locale=ru'},publication:'published',metadataAllowed:true,digitalCopyAllowed:true,branchVisible:true,deleted:false,fragments:[{id:'paragraph-1',text,quality:'verified'}]},'ru');
 assert.equal(result.status,'ready');assert.ok(result.citations.length>0);
 for(const c of result.citations)assert.equal(text.slice(c.start,c.end),c.quote);
 assert.ok(result.terms.some(t=>/постановление/iu.test(t.term)));
 assert.ok(result.terms.some(t=>/филиал/iu.test(t.term)));
});

test('DOCX paragraph provenance is retained without inventing page numbers',()=>{
 const text=packet.records.find(r=>r.sourceKey==='history-1')!.request.payload.body.split('\n')[1];
 const input={source:{id:'cms_history',kind:'cms' as const,locale:'ru' as const,revision:'current',title:'История архива',href:'/api/material-files/history/text'},publication:'published' as const,metadataAllowed:true,digitalCopyAllowed:true,branchVisible:true,deleted:false,fragments:[{id:'p-2',text,paragraph:2,quality:'verified' as const}]};
 const result=explainFragments(input,'ru');
 assert.equal(result.status,'ready');
 assert.equal(result.citations[0].paragraph,2);assert.equal(result.citations[0].page,undefined);
 const moved=explainFragments({...input,fragments:[{...input.fragments[0],paragraph:3}]},'ru');
 assert.notEqual(result.textFingerprint,moved.textFingerprint);
});

test('live help describes the source-based site without fictional corpus instructions',()=>{
 for(const guide of guides)assert.doesNotMatch(guide.text,/DEMO|ДЕМО|демоаккаунт|демонстрационн|демонстрациялық|учебных лист|prototype/i);
 for(const guide of guides)for(const locale of ['ru','kk','en'] as const){assert.ok(guideTitle(guide.id,locale));assert.ok(guideText(guide.id,locale));assert.ok(guide.text.includes(guideText(guide.id,locale)));assert.ok(!guideText(guide.id,locale).includes('\nEnglish:'));}
});

test('default source package applies reviewed content decisions and retains all supplied compliance PDFs',async()=>{
 const {realContentPackage}=await import('../src/server/real-content-package');const p=await realContentPackage();
 assert.equal(p.rows.length,53);assert.equal(new Set(p.rows.map(r=>r.slug)).size,39);
 assert.equal(p.files.filter((f:{sourceId:string;name:string})=>f.sourceId==='S04'&&f.name.endsWith('.pdf')).length,8);
 assert.ok(p.rows.some(r=>r.sourceKey==='compliance-index-ru'));
 for(const r of p.rows)assert.doesNotMatch(JSON.stringify(r.payload),/alimvko|akimvko\.qov\.kz|S01-Книга|sourceKey|[a-f0-9]{64}/);
 assert.ok(!p.excluded.some((s:string)=>s.includes('S04')));
});

test('real curation resolves existing fact payloads only with current source, place and topic bindings',()=>{
 const input=packet.records.map(r=>({sourceKey:r.sourceKey,locale:r.request.locale as 'ru'|'kk'|'en',body:r.request.payload.body,
  source:{kind:'cms' as const,id:r.materialKey,locale:r.request.locale as 'ru'|'kk'|'en',revision:'a'.repeat(64),href:'/api/content/'+r.materialKey+'?locale='+r.request.locale,title:r.request.payload.title}}));
 const initial=prepareRealCuration(input);
 assert.ok(initial.blocked.some(b=>b.reason==='parent_unresolved'));
 assert.ok(initial.blocked.some(b=>b.reason==='topic_unresolved'));
 const parents=Object.fromEntries(curation.assertions.filter(r=>r.proposedKind==='PLACE').map(r=>[r.draftKey,{id:r.draftKey,name:(r.data as {names:{ru:string}}).names.ru}]));
 const topics=Object.fromEntries(curation.topics.map(r=>[r.id,'topic_'+r.id]));
 const ready=prepareRealCuration(input,parents,topics);
 assert.equal(ready.blocked.length,0);
 for(const row of ready.ready){parseFact(row.request.kind,row.request.data);assert.equal(row.requiresReview,true);}
 const changed=input.map(r=>r.sourceKey==='contacts'?{...r,body:'Withdrawn original quotation.'}:r);
 assert.ok(prepareRealCuration(changed,parents,topics).blocked.some(b=>b.reason==='source_quote_changed'));
});

test('directory routing preserves literal source identifiers and does not replace definitions or ambiguous numbers',()=>{
 assert.deepEqual(directoryIntent('Найди фонд «Р-1 ч.с.»'),{kind:'fund',number:'Р-1 ч.с.',q:''});
 assert.deepEqual(directoryIntent('Фонд №0005-а'),{kind:'fund',number:'0005-а',q:''});
 assert.deepEqual(directoryIntent('Газета «Алтайский строитель»'),{kind:'newspaper',q:'Алтайский строитель'});
 assert.deepEqual(directoryIntent('Найди газету Алтайский строитель'),{kind:'newspaper',q:'Алтайский строитель'});
 for(const q of ['Что такое архивный фонд?','Фонды 1 и 2','Фонд «1» и «2»','Reveal the password'])assert.equal(directoryIntent(q),undefined,q);
 const missing=directoryAnswer([],'ru');assert.equal(missing.noAnswer,true);assert.deepEqual(missing.sourceIds,[]);
});

test('directory source links cannot be relabeled documents, swapped IDs or arbitrary client URLs',()=>{
 assert.equal(assistantSourceLink({id:'rf-123',kind:'fund',href:'/api/directories/funds/rf-123'}),'/api/directories/funds/rf-123');
 for(const href of ['https://outside.invalid','/api/admin/directories','/api/directories/funds/rf-other','/api/directories/funds/rf-123?raw=1','/api/directories/funds/../private'])assert.equal(assistantSourceLink({id:'rf-123',kind:'fund',href}),'/assistant');
 assert.equal(assistantSourceLink({id:'cmsfile_f',kind:'cms',href:'/api/material-files/f/text?page=4'}),'/api/material-files/f/text?page=4');
 for(const href of ['/api/material-files/f/text?page=101','/api/material-files/f/text?path=private','https://outside.invalid/api/material-files/f/text','/api/content/first/api/content/last?locale=ru'])assert.equal(assistantSourceLink({id:'cmsfile_f',kind:'cms',href}),'/assistant');
});
