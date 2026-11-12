// Private source provenance. Originals remain immutable; reviewed manifest versions are retained.
import {mkdir,readdir,readFile,writeFile,realpath,lstat,rename,rm,open} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const storage=path.resolve(process.env.FILE_STORAGE_ROOT||'.local/files');
await mkdir(storage,{recursive:true,mode:0o700});const root=await realpath(storage);
// A second setup must not race the manifest switch. Never break another process's lock.
const lockPath=path.join(root,'.source-bundles.lock');const lock=await open(lockPath,'wx',0o600);
try {
 for(const name of ['archive-20261110','archive-public-20261111','archive-reference-20261110']){
  const source=path.resolve('sources',name),destination=path.join(root,'source-bundles',name);
  await mkdir(destination,{recursive:true,mode:0o700});const base=await realpath(destination);
  if(!base.startsWith(root+path.sep))throw Error('Unsafe source destination');
  let count=0;
  async function immutable(bytes,to){
   try{await writeFile(to,bytes,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
   const stat=await lstat(to);
   if(!stat.isFile()||stat.isSymbolicLink()||sha(await readFile(to))!==sha(bytes))throw Error('Private source bundle conflicts with immutable original');
  }
  async function visit(relative=''){
   for(const entry of await readdir(path.join(source,relative),{withFileTypes:true})){
    // Only the root manifest is versioned. Extracted text/OCR and all original bytes stay immutable.
    if(!relative&&['README.md','manifest.json'].includes(entry.name))continue;
    if(!relative&&entry.name==='.manifest-history')throw Error('Reserved source path');
    const next=path.join(relative,entry.name),from=path.join(source,next),to=path.join(base,next);
    if(entry.isSymbolicLink())throw Error('Source symlinks are not supported');
    if(entry.isDirectory()){
     await mkdir(to,{recursive:true,mode:0o700});const folder=await realpath(to);
     if(!folder.startsWith(base+path.sep))throw Error('Unsafe source destination');await visit(next);
    }else if(entry.isFile()){await immutable(await readFile(from),to);count++;}
   }
  }
  const sourceManifest=path.join(source,'manifest.json');
  if(!(await lstat(sourceManifest)).isFile())throw Error('Unsafe source manifest');
  const bytes=await readFile(sourceManifest);JSON.parse(bytes.toString('utf8'));
  // Check every immutable file before changing the active manifest.
  await visit();
  const history=path.join(base,'.manifest-history');await mkdir(history,{recursive:true,mode:0o700});
  if(await realpath(history)!==history)throw Error('Unsafe manifest history');
  const active=path.join(base,'manifest.json');let previous;
  try{
   const stat=await lstat(active);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe stored manifest');
   previous=await readFile(active);JSON.parse(previous.toString('utf8'));
  }catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous)await immutable(previous,path.join(history,sha(previous)+'.json'));
  await immutable(bytes,path.join(history,sha(bytes)+'.json'));
  if(!previous||sha(previous)!==sha(bytes)){
   const temporary=path.join(base,'.manifest-'+randomUUID()+'.tmp');
   try{await writeFile(temporary,bytes,{flag:'wx',mode:0o600});await rename(temporary,active);}
   finally{await rm(temporary,{force:true});}
  }
  console.log(JSON.stringify({privateSourceBundle:name,filesVerified:count+1,manifestSha256:sha(bytes),manifestChanged:Boolean(previous&&sha(previous)!==sha(bytes)),publicFilesCreated:0}));
 }
}finally{await lock.close();await rm(lockPath);}
