import { writeFile } from 'node:fs/promises';
import cases from '../tests/fixtures/site-dialog.json';
import { answerSiteDialog } from '../src/server/site-dialog';
import { db } from '../src/server/db';
try {
 const results=[];
 for(const c of cases){
  const history:{role:'user'|'assistant';content:string}[]=[];let answer;
  for(const question of c.turns){answer=await answerSiteDialog(question,history.slice(-6));history.push({role:'user',content:question},{role:'assistant',content:answer.answer.slice(0,1000)});}
  const passed=!!answer&&(c.noAnswer?answer.noAnswer:answer.sourceIds.includes(c.source!)&&answer.answer.includes(c.contains!));
  results.push({id:c.id,passed,answer:answer?.answer,sourceIds:answer?.sourceIds});
 }
 await writeFile('training/dialog-evaluation.json',JSON.stringify({total:results.length,passed:results.filter(r=>r.passed).length,cases:results},null,2)+'\n');
 console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,failed:results.filter(r=>!r.passed).map(r=>r.id)}));
 if(results.some(r=>!r.passed))process.exitCode=1;
}finally{await db.$disconnect();}
