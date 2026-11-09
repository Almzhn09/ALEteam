import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualityTopicForQuestion} from '../src/server/quality-topic';
import {qualityRecommendations} from '../src/server/site-quality';
for(const [q,topic] of [
 ['Расскажите, где филиалы архива','archive-branches'],
 ['Мені мұрағат филиалдары туралы айтып берші','archive-branches'],
 ['Can you describe archive branches?','archive-branches'],
 ['Какая цифровая выставка доступна?','exhibitions'],
 ['Цифрлық көрме қайда?','exhibitions'],
 ['Where is the digital exhibition?','exhibitions'],
 ['How do I get saved documents?','favorites'],
] as const)test('local learned topic: '+q,()=>assert.equal(qualityTopicForQuestion(q),topic));
test('only allowlisted topic leaves the classifier; identifiers and unsupported themes do not',()=>{
 for(const q of ['My password is private','test@example.com','API_KEY=do-not-store','call 123456789','Mars colony','', 'x'.repeat(1001)])assert.equal(qualityTopicForQuestion(q),undefined);
});
test('learned topic may be counted, statistical recommendation still explains its own rule',()=>{
 const topic=qualityTopicForQuestion('Where is the digital exhibition?');assert.equal(topic,'exhibitions');
 const result=qualityRecommendations([{topicId:topic!,periodStart:'2026-11-01',periodEnd:'2026-11-08',searches:10,emptyResults:4,stalePages:0}]);
 assert.equal(result[0].method,'aggregate-rule');assert.equal(result[0].basis,'4/10 searches had no results');
 assert.ok(!JSON.stringify(result).includes('Where is'));
});
