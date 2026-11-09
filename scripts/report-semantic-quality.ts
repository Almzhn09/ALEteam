// Summarize a completed run; never treat a partial/zero-case run as a passing benchmark.
import {readFile,writeFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile('tests/fixtures/semantic-catalog.json','utf8'));
const result=JSON.parse(await readFile('.local/semantic-catalog/evaluation.json','utf8'));
type Row={id:string;locale:string;expected:string[];beforeExact:boolean;afterExact:boolean;beforeTop3:string[];afterTop3:string[]};
const rows=result.rows as Row[];
const ids=new Set(rows.map(r=>r.id));
if(rows.length!==fixture.cases.length||ids.size!==rows.length||fixture.cases.some((c:{id:string})=>!ids.has(c.id))||rows.some(r=>!Array.isArray(r.beforeTop3)||!Array.isArray(r.afterTop3)))throw Error('Acceptance run incomplete; rerun test:semantic');
const positive=rows.filter(r=>r.expected.length>0);
function stats(key:'before'|'after'){
 const exact=key==='before'?'beforeExact':'afterExact',top=key==='before'?'beforeTop3':'afterTop3';
 return {exactSets:rows.filter(r=>r[exact]).length,total:rows.length,positiveExactSets:positive.filter(r=>r[exact]).length,positiveTotal:positive.length,
  meanRecallAt3:positive.reduce((sum,r)=>sum+r.expected.filter(id=>r[top].includes(id)).length/r.expected.length,0)/positive.length,
  byLocale:Object.fromEntries(['ru','kk','en'].map(locale=>{const group=rows.filter(r=>r.locale===locale);return [locale,{exactSets:group.filter(r=>r[exact]).length,total:group.length}];}))};
}
const report={scope:'Author-written synthetic end-to-end acceptance: legacy RU retrieval versus translated public catalog + hybrid planner, same current database. This is not an independent model accuracy benchmark.',before:stats('before'),after:stats('after'),original25:{beforeExact:rows.slice(0,25).filter(r=>r.beforeExact).length,afterExact:rows.slice(0,25).filter(r=>r.afterExact).length,total:25},rows};
await writeFile('.local/semantic-catalog/quality.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before:report.before,after:report.after}));
if(rows.some(r=>!r.afterExact))process.exitCode=1;
