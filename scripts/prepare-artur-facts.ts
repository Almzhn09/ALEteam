import {readFile,writeFile} from 'node:fs/promises';
import {prepareDiscoveryFacts} from '../src/server/artur-discovery/publication';
const args=process.argv.slice(2);const get=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const source=get('--sources'),places=get('--places'),output=get('--out');
if(!source||!output)throw Error('Usage: node --import tsx scripts/prepare-artur-facts.ts --sources <current-public-source-bindings.json> [--places <public-places-by-draft-key.json>] --out <draft-requests.json>');
const result=prepareDiscoveryFacts(JSON.parse(await readFile(source,'utf8')),places?JSON.parse(await readFile(places,'utf8')):{});
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(`Prepared ${result.ready.length} DRAFT requests; ${result.blocked.length} blocked by missing sources/parents/changed quotations. No HTTP calls or publication.`);
