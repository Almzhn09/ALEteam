// Offline, read-only file verification. Never expose this filesystem adapter as a public API.
import {open,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {auditMigrationManifest,migrationManifestSchema} from './migration-audit';
export async function verifyMigrationFiles(input:unknown,root:string,locations:Record<string,string>,maxBytes=128*1024*1024){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Invalid file limit');
 const manifest=auditMigrationManifest(input);
 if(!manifest.valid)return {valid:false,manifest,files:[]};
 const data=migrationManifestSchema.parse(input),base=await realpath(root);
 if(Object.keys(locations).some(id=>!data.files.some(f=>f.id===id)))throw new Error('Unknown file location');
 const files: {id:string;valid:boolean;reason:string}[]=[];
 for(const file of data.files){
  let handle:Awaited<ReturnType<typeof open>>|undefined;
  try{
   const location=locations[file.id];
   if(typeof location!=='string'||!location||isAbsolute(location)||location.split(/[\\/]/u).includes('..'))throw new Error('path');
   const path=await realpath(resolve(base,location)),within=relative(base,path);
   if(!within||within==='..'||within.startsWith('..'+sep)||isAbsolute(within))throw new Error('path');
   handle=await open(path,'r');const info=await handle.stat();
   if(!info.isFile()||info.size>maxBytes||info.size!==file.bytes)throw new Error('size');
   const header=Buffer.alloc(16);const read=await handle.read(header,0,16,0);const magic=header.subarray(0,read.bytesRead);
   const mime=magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png'
    :magic.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg'
    :magic.subarray(0,5).toString()==='%PDF-'?'application/pdf'
    :['49492a00','4d4d002a','49492b00','4d4d002b'].includes(magic.subarray(0,4).toString('hex'))?'image/tiff'
    :magic.subarray(0,4).toString()==='RIFF'&&magic.subarray(8,12).toString()==='WEBP'?'image/webp':undefined;
   if(mime!==file.mime)throw new Error('mime');
   const digest=createHash('sha256');let bytes=0;
   for await(const chunk of handle.createReadStream({autoClose:false})){bytes+=chunk.length;if(bytes>maxBytes)throw new Error('size');digest.update(chunk);}
   if(bytes!==file.bytes||digest.digest('hex')!==file.sha256)throw new Error('checksum');
   files.push({id:file.id,valid:true,reason:'verified'});
  }catch(error){
   const code=error instanceof Error&&['path','size','checksum','mime'].includes(error.message)?error.message:'unavailable';
   files.push({id:file.id,valid:false,reason:code});
  }finally{await handle?.close();}
 }
 return {valid:files.every(f=>f.valid),manifest,files};
}
