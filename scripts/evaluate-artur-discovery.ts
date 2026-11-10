import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {semanticConversationPlan} from '../src/server/semantic-catalog-plan';
import type {ContentLocale} from '../src/contracts/cms';
import fixtures from '../data/artur/discovery/acceptance-queries.json';
const training=new Set<string>();
for(const prefix of ['training/data','training/full-tz/data'])for(const split of ['train','validation','test']){
 const text=await readFile(`${prefix}/router-${split}.jsonl`,'utf8');for(const line of text.split('\n').filter(Boolean))training.add(JSON.parse(line).question.normalize('NFKC').toLowerCase().trim());
}
const rows=fixtures.cases.map(c=>{
 const plan=semanticConversationPlan(c.question,('history' in c?c.history:[]) as {role:'user';content:string}[],c.locale as ContentLocale);
 const failures:string[]=[];
 if(c.clarification!==undefined&&plan.clarification!==c.clarification)failures.push('clarification');
 if(c.clarification===undefined&&plan.clarification)failures.push('unexpected-clarification');
 for(const [key,value] of Object.entries(c.expected??{}))if((plan.filters as Record<string,unknown>)[key]!== (value===null?undefined:value))failures.push(key);
 if(c.place&&!plan.nameExpansion?.entityIds.includes(c.place))failures.push('place');
 const overlap=training.has(c.question.normalize('NFKC').toLowerCase().trim());if(overlap)failures.push('overlaps-training-or-prior-evaluation');
 return {id:c.id,locale:c.locale,question:c.question,expected:c.expected??{clarification:c.clarification},actual:{filters:plan.filters,clarification:plan.clarification??null,placeIds:plan.nameExpansion?.entityIds??[]},exactOverlapWithExistingDatasets:overlap,passed:failures.length===0,failures};
});
await mkdir('.local/artur-discovery',{recursive:true});
const sourceSha256:Record<string,string>={};for(const file of ['src/server/semantic-catalog-plan.ts','src/server/archive-search-intent.ts','src/server/artur-discovery/names.ts','src/server/artur-discovery/research.ts','data/artur/semantic-dictionary.json','data/artur/discovery/acceptance-queries.json'])sourceSha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const report={version:1,scope:fixtures.scope,modelWeightsChanged:false,newModelTrained:false,trainingOrExistingEvaluationOverlap:rows.filter(r=>r.exactOverlapWithExistingDatasets).length,passed:rows.filter(r=>r.passed).length,total:rows.length,sourceSha256,rows};
await writeFile('.local/artur-discovery/planner-evaluation.json',JSON.stringify(report,null,2)+'\n');
console.log(`Source-inspired planning holdout: ${report.passed}/${report.total}; exact dataset overlap ${report.trainingOrExistingEvaluationOverlap}. No neural accuracy/public-corpus recall claim.`);
for(const row of rows.filter(r=>!r.passed))console.log(row.id,row.failures.join(', '));
if(report.passed!==report.total)process.exitCode=1;
