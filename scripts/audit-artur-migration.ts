// Read-only local audit. Exit 0=valid, 1=validation failed, 2=usage/read error.
import {readFile} from 'node:fs/promises';
import {auditMigrationManifest,compareMigrationManifests} from '../src/server/migration-audit';
import {verifyMigrationFiles} from '../src/server/migration-files';
const readJson=async(path:string)=>JSON.parse(await readFile(path,'utf8')) as unknown;
try{
 const args=process.argv.slice(2);const flags=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!['--manifest','--compare','--files-root','--locations'].includes(args[i])||!args[i+1]||flags.has(args[i]))throw Error('usage');flags.set(args[i],args[i+1]);}
 const manifestPath=flags.get('--manifest');if(!manifestPath||flags.has('--files-root')!==flags.has('--locations'))throw Error('usage');
 const input=await readJson(manifestPath);const manifest=auditMigrationManifest(input);
 const comparison=flags.has('--compare')?compareMigrationManifests(input,await readJson(flags.get('--compare')!)):undefined;
 let fileCheck;
 if(flags.has('--files-root')){
  const locations=await readJson(flags.get('--locations')!);
  if(!locations||typeof locations!=='object'||Array.isArray(locations)||Object.values(locations).some(x=>typeof x!=='string'))throw Error('usage');
  fileCheck=await verifyMigrationFiles(input,flags.get('--files-root')!,locations as Record<string,string>);
 }
 const valid=manifest.valid&&(!comparison||comparison.equal)&&(!fileCheck||fileCheck.valid);
 console.log(JSON.stringify({valid,manifest,comparison,fileCheck,bytesVerified:fileCheck!==undefined},null,2));
 if(!valid)process.exitCode=1;
}catch{console.error('Audit could not run. Use --manifest FILE [--compare FILE] [--files-root DIRECTORY --locations FILE]. Check input files and JSON.');process.exitCode=2;}
