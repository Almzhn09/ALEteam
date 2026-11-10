import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {db} from './db';
import {Prisma} from '../generated/prisma/index.js';
import {ApiError} from './http';
import {readStagedUpload} from './upload-storage';
import {isolatedProcessing} from './isolated-processing';
const resultSchema=z.object({passed:z.literal(true),parser:z.string().max(80),pages:z.number().int().min(1).max(100),fragments:z.array(z.object({page:z.number().int().min(1).max(100),text:z.string().max(12000)}).strict()).max(100),antivirus:z.literal('not-configured'),preview:z.object({mimeType:z.literal('image/png'),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().min(1).max(2*1024*1024),base64:z.string().max(3*1024*1024)}).strict()}).strict();
const root=()=>process.env.FILE_STORAGE_ROOT||'.local/files';
export async function processInspection(uploadId:string){
 const upload=await db.archiveUpload.findUnique({where:{id:uploadId}});if(!upload?.storageKey||!['QUARANTINED','APPROVED'].includes(upload.state))return {state:'unavailable'};
 const job=await db.uploadInspectionJob.upsert({where:{uploadId},create:{uploadId},update:{}});
 if(job.state==='RUNNING'&&job.attempts>=3&&job.leaseUntil&&job.leaseUntil<new Date()){await db.uploadInspectionJob.updateMany({where:{id:job.id,state:'RUNNING',leaseUntil:{lt:new Date()},attempts:{gte:3}},data:{state:'FAILED',failureCode:'PROCESSING_ATTEMPTS_EXHAUSTED',leaseToken:null,leaseUntil:null}});return {state:'FAILED'};}
 if(job.state==='PASSED')return {state:job.state};
 if(job.state==='FAILED')return {state:job.state};
 const token=randomUUID(),now=new Date();
 const claimed=await db.uploadInspectionJob.updateMany({where:{id:job.id,attempts:{lt:3},OR:[{state:'QUEUED'},{state:'RUNNING',leaseUntil:{lt:now}}]},data:{state:'RUNNING',leaseToken:token,leaseUntil:new Date(Date.now()+30000),attempts:{increment:1},failureCode:null}});
 if(!claimed.count)return {state:'RUNNING'};
 let previewKey:string|undefined;
 try{
  await readStagedUpload({...upload,storageKey:upload.storageKey},root());
  const base=await realpath(root()),source=await realpath(path.resolve(base,upload.storageKey));if(!source.startsWith(base+path.sep))throw Error('Unsafe source');
  const parsed=resultSchema.parse(await isolatedProcessing({mode:'inspect',path:source,expectedBytes:upload.expectedBytes,expectedSha256:upload.expectedSha256,mime:upload.mimeType}));
  const preview=Buffer.from(parsed.preview.base64,'base64');if(preview.length!==parsed.preview.bytes||createHash('sha256').update(preview).digest('hex')!==parsed.preview.sha256||!preview.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid derivative');
  await mkdir(path.join(base,'previews'),{recursive:true,mode:0o700});const folder=await realpath(path.join(base,'previews'));if(!folder.startsWith(base+path.sep))throw Error('Unsafe preview directory');
  previewKey='previews/'+randomUUID()+'.png';await writeFile(path.join(base,previewKey),preview,{flag:'wx',mode:0o600});
  const {preview:_,...safe}=parsed;
  await db.$transaction(async tx=>{
   const completed=await tx.uploadInspectionJob.updateMany({where:{id:job.id,leaseToken:token,state:'RUNNING'},data:{state:'PASSED',leaseToken:null,leaseUntil:null,result:safe,previewStorageKey:previewKey,previewSha256:parsed.preview.sha256,previewBytes:parsed.preview.bytes}});
   if(!completed.count)throw Error('Expired inspection lease');
   await tx.archiveUpload.updateMany({where:{id:upload.id,updatedAt:upload.updatedAt,state:{in:['QUARANTINED','APPROVED']}},data:{inspection:{method:parsed.parser,fullFormatParsing:true,antivirus:'not-configured',parserState:'PASSED',pages:parsed.pages,limitations:['No antivirus is configured.','Preview is a first-page derivative; master bytes are unchanged.']},updatedAt:upload.updatedAt}});
  });return {state:'PASSED'};
 }catch(error){
  if(previewKey)await unlink(path.resolve(root(),previewKey)).catch(()=>{});
  if(error instanceof ApiError&&error.status===503){await db.uploadInspectionJob.updateMany({where:{id:job.id,leaseToken:token,state:'RUNNING'},data:{state:'QUEUED',leaseToken:null,leaseUntil:null,attempts:{decrement:1}}});return {state:'QUEUED'};}
  await db.uploadInspectionJob.updateMany({where:{id:job.id,leaseToken:token,state:'RUNNING'},data:{state:'FAILED',leaseToken:null,leaseUntil:null,failureCode:error instanceof ApiError?error.code:'FILE_PROCESSING_FAILED'}});
  await db.archiveUpload.updateMany({where:{id:upload.id,updatedAt:upload.updatedAt,state:'QUARANTINED'},data:{inspection:{method:'isolated-format-parser',fullFormatParsing:false,antivirus:'not-configured',parserState:'FAILED'},updatedAt:upload.updatedAt}});
  return {state:'FAILED'};
 }
}
export async function ensureInspection(uploadId:string){
 const result=await processInspection(uploadId);
 if(['RUNNING','QUEUED'].includes(result.state))throw new ApiError(409,'INSPECTION_PENDING','Данные изменились. Обновите страницу и повторите.');
 if(result.state!=='PASSED')throw new ApiError(422,'FILE_PROCESSING_FAILED','Проверьте введённые данные.');
 return db.uploadInspectionJob.findUniqueOrThrow({where:{uploadId}});
}
export async function inspectionState(uploadId:string){const row=await db.uploadInspectionJob.findUnique({where:{uploadId}});return row?{state:row.state,attempts:row.attempts,failureCode:row.failureCode,result:row.result,previewFileId:row.previewFileId,updatedAt:row.updatedAt}:{state:'not_queued'};}
export async function retryInspection(uploadId:string){
 const row=await db.uploadInspectionJob.findUnique({where:{uploadId}});if(!row||row.state!=='FAILED'||row.attempts>=3)throw new ApiError(409,'INSPECTION_STATE','Данные изменились. Обновите страницу и повторите.');
 const changed=await db.uploadInspectionJob.updateMany({where:{uploadId,state:'FAILED',attempts:{lt:3}},data:{state:'QUEUED',failureCode:null,leaseToken:null,leaseUntil:null}});if(!changed.count)throw new ApiError(409,'INSPECTION_STATE','Данные изменились. Обновите страницу и повторите.');return {state:'QUEUED'};
}
