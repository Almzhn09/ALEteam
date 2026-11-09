import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {archiveSearchIntent} from '../src/server/archive-search-intent';
import {cmsCorpus, type CmsSource} from '../src/server/cms-corpus';
import {qualityRecommendations} from '../src/server/site-quality';
for(const q of ['Фотографии Усть-Каменогорска 1960-х','Photos of Ust-Kamenogorsk in the 1960s','Өскеменнің 1960 жылдардағы фотосуреттері'])test('TZ-A07: '+q,()=>{
 const r=archiveSearchIntent(q);assert.equal(r.type,'PHOTO');assert.equal(r.placeId,'ust-kamenogorsk');assert.equal(r.yearFrom,1960);assert.equal(r.yearTo,1969);
});
test('unknown places not invented and years are bounded',()=>{
 assert.equal(archiveSearchIntent('photos from Atlantis').placeId,undefined);
 assert.equal(archiveSearchIntent('code 119601').yearFrom,undefined);
 assert.ok(archiveSearchIntent('anything').clarification);
});
const base:CmsSource={id:'demo-1',kind:'document',language:'en',status:'PUBLISHED',translationStatus:'APPROVED',metadataPublic:true,assistantAllowed:true,revision:1,title:'Demo',publicText:'Approved public abstract only',isDemo:true};
test('CMS corpus defaults to no publication for unapproved fields or languages',()=>{
 for(const patch of [{status:'DRAFT'},{status:'ARCHIVED'},{translationStatus:'DRAFT'},{metadataPublic:false},{assistantAllowed:false},{language:'ru'}])assert.equal(cmsCorpus([{...base,...patch} as CmsSource],'en').length,0);
});
test('withdrawals are visible immediately; private fields never projected',()=>{
 const records=[{...base,privateText:'DO_NOT_LEAK',filePath:'/private/master.tiff'}];
 assert.equal(cmsCorpus(records,'en').length,1);
 assert.ok(!JSON.stringify(cmsCorpus(records,'en')).includes('DO_NOT_LEAK'));
 records[0].status='ARCHIVED';assert.equal(cmsCorpus(records,'en').length,0);
});
test('ambiguous identity rejected',()=>{
 assert.throws(()=>cmsCorpus([base,base],'en'));assert.throws(()=>cmsCorpus([{...base,id:'../private'}],'en'));
});
const aggregate={topicId:'catalog',periodStart:'2026-11-01',periodEnd:'2026-11-08',searches:20,emptyResults:8,stalePages:2};
test('quality report explains period, owner and rule, not fictitious model inference',()=>{
 const r=qualityRecommendations([aggregate]);assert.equal(r.length,2);assert.equal(r[0].basis,'8/20 searches had no results');assert.equal(r[0].method,'aggregate-rule');assert.ok(r[0].requiresHumanReview);
});
test('small analytics groups suppressed and impossible data rejected',()=>{
 assert.equal(qualityRecommendations([{...aggregate,searches:4,emptyResults:2}]).length,0);
 assert.throws(()=>qualityRecommendations([{...aggregate,emptyResults:21}]));
 assert.throws(()=>qualityRecommendations([{...aggregate,topicId:'person@example.com'}]));
});
test('content pack has three labelled drafts and blocks official publication',async()=>{
 const data=JSON.parse(await readFile('data/artur/content-pack.json','utf8'));
 assert.ok(data.records.length>=7);assert.ok(data.missing.length>=7);
 for(const r of data.records){assert.equal(r.publicationAllowed,false);assert.ok(r.rights);assert.ok(r.checkedAt);for(const lang of ['ru','kk','en']){assert.equal(r.translations[lang].status,'DRAFT');assert.equal(r.translations[lang].reviewer,null);assert.ok(r.translations[lang].text);}}
});
