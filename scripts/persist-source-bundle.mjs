// Immutable private source provenance, included in the existing files-volume backup.
import {mkdir,readdir,readFile,copyFile,realpath,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
for(const name of ['archive-20261110','archive-public-20261111','archive-reference-20261110']){
const source=path.resolve('sources',name),storage=path.resolve(process.env.FILE_STORAGE_ROOT||'.local/files');
await mkdir(storage,{recursive:true,mode:0o700});const root=await realpath(storage);
const destination=path.join(root,'source-bundles',name);await mkdir(destination,{recursive:true,mode:0o700});
const base=await realpath(destination);if(!base.startsWith(root+path.sep))throw Error('Unsafe source destination');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');let count=0;
async function visit(relative=''){
 for(const entry of await readdir(path.join(source,relative),{withFileTypes:true})){
  // Editorial guidance changes independently of immutable originals and their provenance.
  // An older backup may retain its README; it is not part of the source manifest.
  if(!relative&&entry.name==='README.md')continue;
  const next=path.join(relative,entry.name),from=path.join(source,next),to=path.join(base,next);
  if(entry.isSymbolicLink())throw Error('Source symlinks are not supported');
  if(entry.isDirectory()){await mkdir(to,{recursive:true,mode:0o700});const folder=await realpath(to);if(!folder.startsWith(base+path.sep))throw Error('Unsafe source destination');await visit(next);}
  else if(entry.isFile()){
   const bytes=await readFile(from);
   try{await copyFile(from,to,constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
   const stat=await lstat(to);if(!stat.isFile()||stat.isSymbolicLink()||sha(await readFile(to))!==sha(bytes))throw Error('Private source bundle conflicts with immutable original');count++;
  }
 }
}
await visit();console.log(JSON.stringify({privateSourceBundle:name,filesVerified:count,publicFilesCreated:0}));

}
