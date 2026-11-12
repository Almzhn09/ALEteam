import {z} from 'zod';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {db} from './db';
import {ApiError,idSchema,json,queryParams,readJson,rateLimit} from './http';
import {staffContext,audit} from './staff';
import {resolveMaterial} from './discovery-materials';
import {stageUpload,readStagedUpload,removeStagedUpload,uploadMaxBytes} from './upload-storage';
import {isolatedProcessing} from './isolated-processing';
import {pagedFileFragments} from './authorized-file-text';
import type {AttachmentRef} from '../contracts/real-content';
import {Prisma,type CmsAttachment} from '../generated/prisma/index.js';
import type {UploadMime} from '../contracts/uploads';
export const docxMime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const mime=z.enum(['application/pdf','image/png','image/jpeg',docxMime]);
export const cmsAttachmentSchema=z.object({revisionId:idSchema,name:z.string().trim().min(1).max(180).refine(v=>!/[\x00-\x1f\x7f/\\]/.test(v)),mimeType:mime,expectedBytes:z.number().int().positive().max(uploadMaxBytes),expectedSha256:z.string().regex(/^[a-f0-9]{64}$/),rights:z.string().trim().min(1).max(1000),sourceNote:z.string().trim().min(1).max(1000),sourceLabel:z.string().trim().min(1).max(200),sourceVersion:z.string().trim().min(1).max(200)}).strict().refine(v=>v.mimeType===docxMime?/\.docx$/i.test(v.name):v.mimeType==='application/pdf'?/\.pdf$/i.test(v.name):v.mimeType==='image/png'?/\.png$/i.test(v.name):/\.jpe?g$/i.test(v.name));
const root=()=>process.env.FILE_STORAGE_ROOT||'.local/files';const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const parsedSchema=z.object({passed:z.literal(true),parser:z.string().max(100),pages:z.number().int().min(1).max(100).nullable(),paragraphs:z.number().optional(),fragments:z.array(z.object({text:z.string().max(12000),page:z.number().int().min(1).max(100).optional(),paragraph:z.number().int().positive().optional()})).max(1000),antivirus:z.literal('not-configured'),preview:z.object({mimeType:z.literal('image/png'),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().positive().max(2*1024*1024),base64:z.string().max(3*1024*1024)}).nullable(),ocr:z.object({used:z.boolean(),quality:z.enum(['unreviewed','reviewed','low','not_applicable']),engine:z.string().optional(),confidence:z.number().min(0).max(100).optional()}).optional()});
function privateDTO(row:CmsAttachment){const {storageKey:_,previewKey:__,receiveToken:___,parsed,...safe}=row;return {...safe,inspection:parsed?{parser:(parsed as any).parser,fullFormatParsing:true,antivirus:'not-configured'}:{fullFormatParsing:false,antivirus:'not-configured'}};}
async function authorized(request:Request,id:string,permission:string){const item=await db.cmsAttachment.findUnique({where:{id:idSchema.parse(id)},include:{revision:{include:{item:true}}}});if(!item)throw new ApiError(404,'NOT_FOUND','Файл не найден.');const c=await staffContext(request,permission,item.revision.item.branchId);return {item,c};}
function stale():never{throw new ApiError(409,'STALE_UPLOAD','Загрузка изменилась. Обновите данные.');}
export async function processCmsAttachment(id:string,options:{previewPage?:number}={}){
 const row=await db.cmsAttachment.findUniqueOrThrow({where:{id}});if(!row.storageKey||!['QUARANTINED','APPROVED'].includes(row.state))stale();if(row.parsed)return row;
 const bytes=await readStagedUpload({...row,storageKey:row.storageKey},root());const base=await realpath(root());const source=await realpath(path.join(base,row.storageKey));if(!source.startsWith(base+path.sep))throw Error('Unsafe storage');
 const parsed=parsedSchema.parse(await isolatedProcessing({mode:'inspect',path:source,expectedBytes:bytes.length,expectedSha256:row.expectedSha256,mime:row.mimeType,...options}));
 let previewKey:string|undefined;
 if(parsed.preview){const png=Buffer.from(parsed.preview.base64,'base64');if(png.length!==parsed.preview.bytes||sha(png)!==parsed.preview.sha256)throw Error('Derivative integrity failure');await mkdir(path.join(base,'previews'),{recursive:true,mode:0o700});const directory=await realpath(path.join(base,'previews'));if(!directory.startsWith(base+path.sep))throw Error('Unsafe storage');previewKey='previews/'+randomUUID()+'.png';await writeFile(path.join(base,previewKey),png,{flag:'wx',mode:0o600});}
 const {preview,...safe}=parsed;
 const changed=await db.cmsAttachment.updateMany({where:{id,updatedAt:row.updatedAt,state:{in:['QUARANTINED','APPROVED']},parsed:{equals:Prisma.DbNull}},data:{parsed:safe as unknown as Prisma.InputJsonValue,previewKey:previewKey??null,previewSha256:preview?.sha256??null,previewBytes:preview?.bytes??null,updatedAt:row.updatedAt}});
 if(!changed.count&&previewKey)await unlink(path.join(base,previewKey)).catch(()=>{});
 return db.cmsAttachment.findUniqueOrThrow({where:{id}});
}
export async function approveCmsAttachment(id:string,reviewerId:string,expectedUpdatedAt?:string){
 const row=await db.cmsAttachment.findUniqueOrThrow({where:{id}});if(row.uploaderId===reviewerId)throw new ApiError(403,'SELF_APPROVAL','Проверку должен выполнить другой сотрудник.');if(row.state!=='QUARANTINED'||expectedUpdatedAt&&row.updatedAt.toISOString()!==expectedUpdatedAt)stale();
 await processCmsAttachment(id);const changed=await db.cmsAttachment.updateMany({where:{id,state:'QUARANTINED',updatedAt:row.updatedAt},data:{state:'APPROVED',reviewerId,failureCode:null}});if(!changed.count)stale();return db.cmsAttachment.findUniqueOrThrow({where:{id}});
}
export async function publishCmsAttachment(id:string,actorId:string,expectedUpdatedAt?:string){
 const row=await db.cmsAttachment.findUniqueOrThrow({where:{id},include:{revision:true}});if(row.state!=='APPROVED'||!row.reviewerId||row.reviewerId===row.uploaderId||!row.parsed||!row.storageKey||expectedUpdatedAt&&row.updatedAt.toISOString()!==expectedUpdatedAt)stale();
 const material=await resolveMaterial({kind:'cms',id:row.revision.itemId},row.revision.locale as 'ru'|'kk'|'en',false);if(!material||material.eventRevision!==row.revisionId)throw new ApiError(409,'REVIEW_REQUIRED','Сначала необходима проверка редакции.');
 await readStagedUpload({...row,storageKey:row.storageKey},root());return db.$transaction(async tx=>{const changed=await tx.cmsAttachment.updateMany({where:{id,state:'APPROVED',updatedAt:row.updatedAt},data:{state:'PUBLISHED'}});if(!changed.count)stale();await audit(tx,actorId,'CMS_FILE_PUBLISHED',id);return tx.cmsAttachment.findUniqueOrThrow({where:{id}});});
}
export async function adminCmsAttachments(request:Request,itemId:string){
 const item=await db.contentItem.findUnique({where:{id:idSchema.parse(itemId)}});if(!item||['SETTING','ARCHIVE_DOCUMENT'].includes(item.kind))throw new ApiError(404,'NOT_FOUND','Материал не найден.');const c=await staffContext(request,request.method==='GET'?'content.read':'content.write',item.branchId);
 if(request.method==='GET'){z.object({}).strict().parse(queryParams(request));return json({items:(await db.cmsAttachment.findMany({where:{revision:{itemId}},orderBy:{id:'asc'}})).map(privateDTO)});}
 const p=cmsAttachmentSchema.parse(await readJson(request,8192));if(!await db.contentRevision.count({where:{id:p.revisionId,itemId,status:{in:['DRAFT','CHANGES_REQUESTED','PUBLISHED']}}}))stale();await rateLimit('cms-file:'+c.user.id,30,60);
 if(await db.cmsAttachment.count({where:{revisionId:p.revisionId,state:{notIn:['REJECTED','WITHDRAWN']}}})>=20)throw new ApiError(409,'UPLOAD_QUOTA','Данные изменились. Обновите страницу и повторите.');
 const row=await db.cmsAttachment.create({data:{...p,uploaderId:c.user.id}});return json({item:privateDTO(row)},201);
}
export async function adminCmsFile(request:Request,id:string,action:string){
 const permission=action==='review'?'content.review':action==='publish'||action==='withdraw'?'content.publish':request.method==='GET'?'content.read':'content.write';const {item,c}=await authorized(request,id,permission);await rateLimit('cms-file:'+c.user.id,60,60);
 if(request.method==='GET'){z.object({}).strict().parse(queryParams(request));if(action==='content'&&item.storageKey){const bytes=await readStagedUpload({...item,storageKey:item.storageKey},root());return new Response(new Uint8Array(bytes),{headers:{'Content-Type':item.mimeType,'Content-Disposition':'attachment; filename="review-source"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}return json({item:privateDTO(item)});}
 if(action==='content'){
  if(item.uploaderId!==c.user.id)throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');if(item.state!=='AWAITING_CONTENT'||request.headers.get('if-match')!=='"'+item.updatedAt.toISOString()+'"')stale();if(request.headers.get('content-type')?.split(';')[0]!==item.mimeType)throw new ApiError(415,'UPLOAD_CONTENT_TYPE','Передайте содержимое в заявленном формате файла.');
  const token=randomUUID();const claimed=await db.cmsAttachment.updateMany({where:{id,state:'AWAITING_CONTENT',updatedAt:item.updatedAt},data:{state:'RECEIVING',receiveToken:token}});if(!claimed.count)stale();
  let staged:Awaited<ReturnType<typeof stageUpload>>|undefined;
  try{staged=await stageUpload(request,{bytes:item.expectedBytes,sha256:item.expectedSha256,mime:item.mimeType as UploadMime},root());const changed=await db.cmsAttachment.updateMany({where:{id,state:'RECEIVING',receiveToken:token},data:{state:'QUARANTINED',receiveToken:null,storageKey:staged.storageKey}});if(!changed.count)stale();return json({item:privateDTO(await db.cmsAttachment.findUniqueOrThrow({where:{id}}))});}catch(error){if(staged)await removeStagedUpload(staged.storageKey,root());await db.cmsAttachment.updateMany({where:{id,state:'RECEIVING',receiveToken:token},data:{state:'FAILED',receiveToken:null,failureCode:error instanceof ApiError?error.code:'STORAGE_UNAVAILABLE'}});throw error;}
 }
 const p=z.object({expectedUpdatedAt:z.iso.datetime(),rightsConfirmed:z.boolean().optional(),decision:z.enum(['APPROVE','REJECT']).optional(),reason:z.string().trim().min(3).max(500)}).strict().parse(await readJson(request,2048));if(p.expectedUpdatedAt!==item.updatedAt.toISOString())stale();
 if(action==='review'){
  if(p.decision==='REJECT'){if(item.uploaderId===c.user.id)throw new ApiError(403,'SELF_APPROVAL','Проверку должен выполнить другой сотрудник.');const changed=await db.cmsAttachment.updateMany({where:{id,state:'QUARANTINED',updatedAt:item.updatedAt},data:{state:'REJECTED',reviewerId:c.user.id}});if(!changed.count)stale();}
  else{if(p.decision!=='APPROVE'||!p.rightsConfirmed)throw new ApiError(400,'UPLOAD_RIGHTS_REQUIRED','Подтвердите права на публикацию файла.');await approveCmsAttachment(id,c.user.id,p.expectedUpdatedAt);}
 }else if(action==='publish')await publishCmsAttachment(id,c.user.id,p.expectedUpdatedAt);
 else if(action==='withdraw')await db.cmsAttachment.updateMany({where:{id,updatedAt:item.updatedAt},data:{state:'WITHDRAWN'}});
 else if(action==='retry'){if(item.uploaderId!==c.user.id||!['FAILED','RECEIVING'].includes(item.state)||item.state==='RECEIVING'&&Date.now()-item.updatedAt.getTime()<120000)stale();await db.cmsAttachment.updateMany({where:{id,updatedAt:item.updatedAt,state:item.state},data:{state:'AWAITING_CONTENT',receiveToken:null,failureCode:null}});}
 else throw new ApiError(404,'NOT_FOUND','Материал не найден.');
 await db.auditEvent.create({data:{actorId:c.user.id,action:'CMS_FILE_'+action.toUpperCase(),entityId:id}});return json({item:privateDTO(await db.cmsAttachment.findUniqueOrThrow({where:{id}}))});
}
async function visible(id:string){
 const masterId=id.startsWith('preview-')?id.slice(8):id;const row=await db.cmsAttachment.findUnique({where:{id:idSchema.parse(masterId)},include:{revision:true}});if(!row||row.state!=='PUBLISHED'||!row.storageKey||!row.reviewerId||row.reviewerId===row.uploaderId)throw new ApiError(404,'NOT_FOUND','Файл не найден.');const material=await resolveMaterial({kind:'cms',id:row.revision.itemId},row.revision.locale as 'ru'|'kk'|'en',false);if(!material||material.eventRevision!==row.revisionId)throw new ApiError(404,'NOT_FOUND','Файл не найден.');return {row,material};
}
export async function cmsAttachmentRefs(itemId:string,locale:'ru'|'kk'|'en'):Promise<AttachmentRef[]>{
 const material=await resolveMaterial({kind:'cms',id:itemId},locale,true);if(!material)return [];
 const rows=await db.cmsAttachment.findMany({where:{revisionId:material.eventRevision,state:'PUBLISHED'},orderBy:{id:'asc'}});const items:AttachmentRef[]=[];
 for(const row of rows){if(!row.reviewerId||row.reviewerId===row.uploaderId)continue;const base={material:{kind:'cms' as const,id:itemId},locale:material.source.locale,revision:material.source.revision,name:row.name,mimeType:row.mimeType,bytes:row.expectedBytes,variant:'master' as const,parentId:null,href:'/api/material-files/'+row.id,textHref:'/api/material-files/'+row.id+'/text',downloadable:true,sha256:row.expectedSha256,source:{label:row.sourceLabel,version:row.sourceVersion,...((row.parsed as any)?.publicationPages?{page:(row.parsed as any).publicationPages[0]}:{})}};if(row.previewKey&&row.previewSha256&&row.previewBytes)items.push({...base,id:'preview-'+row.id,name:'preview.png',mimeType:'image/png',bytes:row.previewBytes,variant:'preview',parentId:row.id,href:'/api/material-files/preview-'+row.id,downloadable:false,sha256:row.previewSha256});items.push({...base,id:row.id});}return items;
}
export async function cmsFileResponse(request:Request,id:string){
 const p=z.object({download:z.literal('1').optional()}).strict().parse(queryParams(request));const {row}=await visible(id);let bytes=await readStagedUpload({...row,storageKey:row.storageKey!},root()),mime=row.mimeType;
 if(id.startsWith('preview-')){if(!row.previewKey||!row.previewSha256||p.download)throw new ApiError(404,'NOT_FOUND','Файл не найден.');const base=await realpath(root()),location=await realpath(path.join(base,row.previewKey));if(!location.startsWith(base+path.sep))throw new ApiError(404,'NOT_FOUND','Файл не найден.');bytes=await readFile(location);if(bytes.length!==row.previewBytes||sha(bytes)!==row.previewSha256)throw new ApiError(404,'NOT_FOUND','Файл не найден.');mime='image/png';}
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':mime,'Content-Length':String(bytes.length),'Content-Disposition':`${p.download||mime===docxMime?'attachment':'inline'}; filename="source-${id}.${mime===docxMime?'docx':mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}
export async function cmsFileText(id:string,page?:number,offset=0,reader=false){
 const {row}=await visible(id);await cmsFileResponse(new Request('http://text.invalid/'),id);
 if(reader&&row.mimeType===docxMime&&!id.startsWith('preview-')){
  const base=await realpath(root()),source=await realpath(path.join(base,row.storageKey!));if(!source.startsWith(base+path.sep))throw new ApiError(404,'NOT_FOUND','Файл не найден.');
  const result=z.object({passed:z.literal(true),parser:z.literal('openxml-docx-reader'),offset:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable(),totalCharacters:z.number().int().nonnegative().max(1000000),truncated:z.boolean(),fragments:z.array(z.object({paragraph:z.number().int().positive(),text:z.string().max(12000)})).max(1000)}).parse(await isolatedProcessing({mode:'read-docx',path:source,expectedBytes:row.expectedBytes,expectedSha256:row.expectedSha256,mime:docxMime,offset}));
  const fragments:{id:string;paragraph:number;page?:number;text:string}[]=result.fragments.map(f=>({...f,id:row.id+'-'+f.paragraph})),text=fragments.map(f=>f.text).join('\n');
  return {id,totalPages:null,publicationPages:null,text,fragments,offset:result.offset,nextOffset:result.nextOffset,totalCharacters:result.totalCharacters,truncated:result.truncated,sourceSha256:row.expectedSha256,textSha256:sha(text),isOcr:false,corrected:false,engine:result.parser,confidence:undefined,ocr:{used:false,quality:'not_applicable'}};
 }
 const parsed=row.parsed as any;if(!parsed?.fragments?.length||id.startsWith('preview-'))throw new ApiError(404,'NOT_FOUND','Распознанный текст пока недоступен.');
 const fragments=parsed.fragments.map((f:any,index:number)=>({...f,id:row.id+'-'+(index+1)})).filter((f:any)=>page!==undefined?f.page===page:!parsed.publicationPages||parsed.publicationPages.includes(f.page));if(!fragments.length)throw new ApiError(404,'NOT_FOUND','Распознанный текст пока недоступен.');const bounded=pagedFileFragments(fragments,offset);return {id,totalPages:parsed.pages,publicationPages:parsed.publicationPages??null,...bounded,sourceSha256:row.expectedSha256,textSha256:sha(bounded.text),isOcr:parsed.ocr?.used??false,corrected:parsed.ocr?.quality==='reviewed',engine:parsed.parser,ocr:parsed.ocr??{used:false,quality:'not_applicable'},...(parsed.ocr?.confidence!==undefined?{confidence:parsed.ocr.confidence}:{})};
}
