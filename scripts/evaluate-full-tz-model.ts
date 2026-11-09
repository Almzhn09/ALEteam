// Offline before/after diagnostic only. Does not replace the deployed model or call any API.
import {readFile,writeFile} from 'node:fs/promises';
import {generateLocalQuery} from '../src/server/local-model';
const artifact=JSON.parse(await readFile('training/full-tz/models/query-model.json','utf8'));
const cases:[string,string][]=[
 ['I am looking for library readers','библиотека'], ['Please tell me about the school classroom','школа'],
 ['I need the railway station timetable','станция'], ['Where is the digital exhibition?','цифровые выставки'],
 ['I want to see archive news','новости архива'], ['Can you describe archive branches?','филиалы архива'],
 ['I need to understand editorial review','редакционная проверка'], ['How do I get saved documents?','избранное'],
 ['What are the comment rules?','правила комментариев'], ['Please explain source verification','проверка источников'],
 ['I want text recognition','распознавание текста'], ['Would you show the museum exhibits?','музей'],
 ['Мені мұрағат филиалдары туралы айтып берші','филиалы архива'], ['Цифрлық көрме қайда?','цифровые выставки'],
 ['Мұрағат жаңалықтары бар ма?','новости архива'], ['Жарияланымды тексеру қалай болады?','редакционная проверка'],
 ['Расскажите, где филиалы архива','филиалы архива'], ['Какая цифровая выставка доступна?','цифровые выставки'],
 ['Как читать новости архива?','новости архива'], ['Нужно согласование публикации','редакционная проверка'],
];
const train=(await readFile('training/full-tz/data/router-train.jsonl','utf8')).trim().split('\n').map(s=>JSON.parse(s).question.toLowerCase().trim());
const rows=cases.map(([question,expected])=>{
 if(train.includes(question.toLowerCase().trim()))throw Error('Evaluation overlaps exact train question');
 const before=generateLocalQuery(question),after=generateLocalQuery(question,artifact);
 return {question,expected,before:before.query,after:after.query,beforePassed:before.query===expected,afterPassed:after.query===expected};
});
const result={scope:'Author-written offline query routing; known aliases, no DB/CMS/UI, not an independent language benchmark',total:rows.length,beforePassed:rows.filter(r=>r.beforePassed).length,afterPassed:rows.filter(r=>r.afterPassed).length,rows};
await writeFile('training/full-tz/comparison.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,rows:undefined}));
