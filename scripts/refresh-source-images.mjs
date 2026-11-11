// Retrieve complete official originals; never repair missing pixels or relax decoding.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function downloadVerifiedImage(url,{maxBytes=20*1024*1024,timeoutMs=60000}={}){
 const response=await fetch(url,{signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok||!response.body)throw Error('SOURCE_IMAGE_HTTP_'+response.status);
 const chunks=[];let total=0;
 for await(const chunk of response.body){total+=chunk.length;if(total>maxBytes)throw Error('SOURCE_IMAGE_SIZE_LIMIT');chunks.push(Buffer.from(chunk));}
 const bytes=Buffer.concat(chunks),declared=response.headers.get('content-length');
 if(!response.headers.get('content-encoding')&&declared!==null&&Number(declared)!==bytes.length)throw Error('SOURCE_IMAGE_INCOMPLETE_TRANSFER');
 const options={failOn:'error',limitInputPixels:16_000_000};
 const metadata=await sharp(bytes,options).metadata();
 if(!['jpeg','png'].includes(metadata.format)||!metadata.width||!metadata.height)throw Error('SOURCE_IMAGE_FORMAT');
 await sharp(bytes,options).raw().toBuffer();
 return {bytes,sha256:digest(bytes),width:metadata.width,height:metadata.height,format:metadata.format,downloadUrl:response.url};
}

export async function refreshSourceImages(){
 const manifestPath='sources/archive-visual-20261111/manifest.json';
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const pending=manifest.images.filter(image=>image.origin==='official_archive_site'&&image.decoderValidation?.status==='incomplete_source');
 // Every download must verify before any active manifest entry changes.
 const replacements=await Promise.all(pending.map(async image=>{
  const url=new URL(image.sourceImageUrl);
  if(!['http:','https:'].includes(url.protocol)||url.hostname!=='e-arhiv.vko.gov.kz')throw Error('UNEXPECTED_SOURCE_HOST');
  const original=await readFile(image.path);if(digest(original)!==image.sha256||original.length!==image.bytes)throw Error('SOURCE_IMAGE_ORIGINAL_CHANGED');
  return {image,verified:await downloadVerifiedImage(url)};
 }));
 for(const {image,verified}of replacements){
  if(!/^[a-z0-9-]+$/.test(image.id))throw Error('UNSAFE_SOURCE_IMAGE_ID');
  const target='sources/archive-visual-20261111/originals/'+image.id+'-'+verified.sha256+(verified.format==='jpeg'?'.jpg':'.png');
  try{await writeFile(target,verified.bytes,{flag:'wx',mode:0o644});}catch(error){if(error.code!=='EEXIST'||digest(await readFile(target))!==verified.sha256)throw error;}
  image.previousIncomplete={path:image.path,sha256:image.sha256,bytes:image.bytes};
  Object.assign(image,{path:target,sha256:verified.sha256,bytes:verified.bytes.length,width:verified.width,height:verified.height,downloadUrl:verified.downloadUrl,downloadedAt:new Date().toISOString(),decoderValidation:{checked:new Date().toISOString(),status:'complete_decode',tool:'sharp strict JPEG/PNG full decode'}});
 }
 if(replacements.length){
  const temporary=manifestPath+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});await rename(temporary,manifestPath);
 }
 console.log(JSON.stringify({verifiedImages:replacements.map(({image})=>({id:image.id,path:image.path,bytes:image.bytes,sha256:image.sha256})),incompleteOriginalsPreserved:true}));
 return replacements.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await refreshSourceImages();
