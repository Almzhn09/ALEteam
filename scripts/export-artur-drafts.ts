import {readFile,writeFile} from 'node:fs/promises';
import {arturDraftPackage} from '../src/server/artur-content-drafts';
const result=arturDraftPackage(JSON.parse(await readFile('data/artur/content-pack.json','utf8')));
await writeFile('data/artur/cms-draft-package.json',JSON.stringify(result,null,2)+'\n');
console.log(`Prepared ${result.records.length} CMS items / ${result.records.length*3} language drafts. No API calls or publication performed.`);
