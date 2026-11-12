// Restore bundled originals by their bytes, not the random upload paths of a new build.
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {readdir,readFile,realpath,mkdir,copyFile,lstat,chmod} from 'node:fs/promises';
import path from 'node:path';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const masterKey=/^uploads\/[a-f0-9-]{36}\.bin$/u;
const previewKey=/^previews\/[a-f0-9-]{36}\.png$/u;
const maxBytes=20*1024*1024;
export async function restoreSourceFiles({sourceRoot,targetRoot,attachments}){
 const source=await realpath(sourceRoot),target=await realpath(targetRoot),index=new Map();
 async function scan(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
   const file=path.join(folder,entry.name);
   if(entry.isDirectory())await scan(file);
   else if(entry.isFile()){
    const stat=await lstat(file);if(stat.size>maxBytes)continue;
    const bytes=await readFile(file);index.set(digest(bytes),{file,bytes:bytes.length});
   }
  }
 }
 await scan(source);let restored=0,alreadyPresent=0,unavailable=0;
 async function restore(key,sha256,bytes,pattern){
  if(!key)return;
  if(!pattern.test(key)||!Number.isSafeInteger(bytes)||bytes<1||bytes>maxBytes||!/^[a-f0-9]{64}$/u.test(sha256??''))throw Error('INVALID_SOURCE_FILE_METADATA');
  const original=index.get(sha256);if(!original||original.bytes!==bytes){unavailable++;return;}
  const destination=path.join(target,key);await mkdir(path.dirname(destination),{recursive:true,mode:0o700});
  if(!(await realpath(path.dirname(destination))).startsWith(target+path.sep))throw Error('UNSAFE_SOURCE_FILE_DIRECTORY');
  try{
   await copyFile(original.file,destination,constants.COPYFILE_EXCL);await chmod(destination,0o600);restored++;
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   const existing=await lstat(destination);if(!existing.isFile()||existing.isSymbolicLink()||existing.size!==bytes||digest(await readFile(destination))!==sha256)throw Error('SOURCE_FILE_STORAGE_CONFLICT');
   alreadyPresent++;
  }
 }
 for(const row of attachments){
  await restore(row.storageKey,row.expectedSha256,row.expectedBytes,masterKey);
  await restore(row.previewKey,row.previewSha256,row.previewBytes,previewKey);
 }
 return {restored,alreadyPresent,unavailable};
}
