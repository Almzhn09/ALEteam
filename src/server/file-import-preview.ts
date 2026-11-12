import {z} from 'zod';
import {db} from './db';
import {Prisma} from '../generated/prisma/index.js';
import {ApiError,idSchema,json,readJson,queryParams,rateLimit} from './http';
import {staffContext,audit} from './staff';
import {allows} from './staff-policy';
import {isolatedProcessing} from './isolated-processing';
import {digest} from './discovery-utils';
import {catalogImportSchema,type CatalogImportManifest} from './catalog-import-schema';
import {stageCatalogImport} from './catalog-imports';
import type {FilePreviewSheet,FilePreviewCell} from '../contracts/file-import';
const binding=z.object({column:z.number().int().min(1).max(50),representation:z.enum(['display','raw','excel-year']).default('display')}).strict();
const fields=z.enum(['sourceId','fundKey','caseKey','number','name','stableId','title','description','reference','year','yearTo','type','rights','sourceUrl','sourceNote','authorName','organization','locality','storageLocation','accessConditions','category','originalLanguage','leafCount']);
const mappingSchema=z.object({sheet:z.string().min(1).max(100),startRow:z.number().int().min(1).max(10000),mode:z.enum(['funds','documents']),columns:z.partialRecord(fields,binding),defaults:z.record(z.string().max(80),z.unknown()).default({}),catalog:z.unknown().optional()}).strict();
const inputSchema=z.object({branchId:idSchema,sourceNamespace:idSchema,format:z.enum(['csv','xlsx','xlsb']),base64:z.string().min(4).max(2800000).regex(/^[A-Za-z0-9+/]*={0,2}$/),mapping:mappingSchema}).strict();
function invalid(code:string):never{throw new ApiError(400,code,'Проверьте введённые данные.');}
function mapped(cell:FilePreviewCell|null|undefined,representation:string){
 if(!cell)return null;if(cell.type==='e')throw Error('CELL_ERROR_REQUIRES_REVIEW');if(cell.formula)throw Error('FORMULA_REQUIRES_REVIEW');if(cell.dateIssue)throw Error(cell.dateIssue);
 if(representation==='excel-year'){if(!cell.dateCandidate)throw Error('EXCEL_DATE_REQUIRED');return cell.dateCandidate.year;}
 return representation==='raw'?cell.raw:cell.display;
}
export function mapSpreadsheet(sheets:FilePreviewSheet[],mapping:z.infer<typeof mappingSchema>,branchId:string,sourceNamespace:string){
 const sheet=sheets.find(s=>s.name===mapping.sheet);if(!sheet)invalid('SHEET_NOT_FOUND');
 const errors:{row:number;code:string}[]=[],warnings:{row:number;code:string}[]=[],mappedRows:{row:number;values:Record<string,unknown>}[]=[],seen=new Map<string,{name:unknown;row:number}>(),sourceIds=new Set<string>();
 for(const row of sheet.rows.filter(r=>r.row>=mapping.startRow)){
  try{const values:Record<string,unknown>={...mapping.defaults};for(const [field,b]of Object.entries(mapping.columns))values[field]=mapped(row.cells[b.column-1],b.representation);
   if(mapping.mode==='funds'){
    if(typeof values.number!=='string'||!values.number.trim()||typeof values.name!=='string'||!values.name.trim())throw Error('FUND_NUMBER_AND_NAME_REQUIRED');
    const previous=seen.get(values.number);if(previous)warnings.push({row:row.row,code:previous.name===values.name?'REPEATED_FUND_ROW':'POSSIBLE_HISTORICAL_RENAME_REQUIRES_REVIEW'});else seen.set(values.number,{name:values.name,row:row.row});
    if(!values.stableId)warnings.push({row:row.row,code:'STABLE_SOURCE_ID_REQUIRED_FOR_MIGRATION'});
   }else{
    if(typeof values.sourceId!=='string'||!values.sourceId.trim())throw Error('STABLE_SOURCE_ID_REQUIRED');if(sourceIds.has(values.sourceId))throw Error('DUPLICATE_SOURCE_ID');sourceIds.add(values.sourceId);
    for(const field of ['year','yearTo','leafCount'])if(values[field]!==null&&values[field]!==undefined){if(!/^\d+$/.test(String(values[field])))throw Error('INTEGER_REQUIRED');values[field]=Number(values[field]);}
   }
   mappedRows.push({row:row.row,values});
  }catch(error){errors.push({row:row.row,code:error instanceof Error?error.message:'INVALID_ROW'});}
 }
 let manifest:CatalogImportManifest|null=null;
 if(mapping.mode==='documents'&&!errors.length){
  if(mappedRows.length>100)errors.push({row:0,code:'BATCH_LIMIT_100'});
  else{
   const documents=mappedRows.map(({values})=>{const {sourceId,fundKey,caseKey,...metadata}=values;return {sourceId,fundKey,caseKey:caseKey??null,metadata:{...metadata,allowDigitalCopy:false},translations:{}};});
   const base=mapping.catalog&&typeof mapping.catalog==='object'?mapping.catalog:{};
   const result=catalogImportSchema.safeParse({...base,version:1,branchId,sourceNamespace,documents});
   if(result.success)manifest=result.data;else for(const issue of result.error.issues.slice(0,100))errors.push({row:typeof issue.path[1]==='number'?mappedRows[issue.path[1]]?.row??0:0,code:'CATALOG_'+issue.code.toUpperCase()+'_'+issue.path.map(String).join('.')});
  }
 }
 return {mode:mapping.mode,sheet:sheet.name,nonEmptyRows:sheet.nonEmptyRows,mappedRows,errors,warnings,manifest,stagingAvailable:!!manifest,limitations:mapping.mode==='funds'?['Preview only. Fund rows do not provide inventories, cases or documents.','A changed name is a review candidate, not an inferred rename.']:['No publication or file import. Existing catalog validator runs again at staging.']};
}
function previewDTO(item:{originalBytes:unknown;result:unknown},page=1,pageSize=50){
 const {originalBytes:_,...dto}=item;const result=item.result as {mappedRows:unknown[];errors:unknown[];warnings:unknown[];source:{sheets:FilePreviewSheet[]}};const skip=(page-1)*pageSize;
 return {...dto,result:{...result,mappedRows:result.mappedRows.slice(skip,skip+pageSize),errorCount:result.errors.length,warningCount:result.warnings.length,errors:result.errors.slice(skip,skip+pageSize),warnings:result.warnings.slice(skip,skip+pageSize),source:{...result.source,sheets:result.source.sheets.map(sheet=>({...sheet,rows:sheet.rows.slice(skip,skip+pageSize)}))}},page,pageSize};
}
async function contextFor(request:Request,branchId:string,write:boolean){const context=await staffContext(request,'catalog.read',branchId);if(write&&!allows(context.grants,'catalog.write',branchId))throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');return context;}
export async function filePreviews(request:Request,id?:string,action?:string){
 if(id){
  idSchema.parse(id);const item=await db.fileImportPreview.findUnique({where:{id}});if(!item)throw new ApiError(404,'NOT_FOUND','Импорт не найден.');const context=await contextFor(request,item.branchId,request.method!=='GET');
  if(request.method!=='GET'&&item.authorId!==context.user.id)throw new ApiError(403,'FORBIDDEN','Недостаточно прав сотрудника.');
  if(request.method==='GET'){const p=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(50)}).strict().parse(queryParams(request));return json({item:previewDTO(item,p.page,p.pageSize)});}
  z.object({}).strict().parse(await readJson(request,1024));
  if(request.method==='DELETE'){if(item.catalogBatchId)throw new ApiError(409,'PREVIEW_STAGED','Данные изменились. Обновите страницу и повторите.');await db.fileImportPreview.delete({where:{id}});return json({deleted:true});}
  if(action!=='stage')invalid('INVALID_ACTION');
  const result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "FileImportPreview" WHERE id=${id} FOR UPDATE`;
   const current=await tx.fileImportPreview.findUniqueOrThrow({where:{id}});
   if(current.catalogBatchId)return {batch:await tx.catalogImport.findUniqueOrThrow({where:{id:current.catalogBatchId}}),repeated:true};
   const manifest=(current.result as {manifest?:unknown}).manifest;if(!manifest)throw new ApiError(409,'MAPPING_REQUIRED','Данные изменились. Обновите страницу и повторите.');
   const batch=await stageCatalogImport(tx,catalogImportSchema.parse(manifest),context.user.id);
   await tx.fileImportPreview.update({where:{id},data:{catalogBatchId:batch.id}});return {batch,repeated:false};
  },{timeout:30000});
  return json({item:{id:result.batch.id,state:result.batch.state,digest:result.batch.digest,report:result.batch.report,updatedAt:result.batch.updatedAt},repeated:result.repeated});
 }
 const input=inputSchema.parse(await readJson(request,3*1024*1024));const context=await contextFor(request,input.branchId,true);
 await rateLimit(`file-preview:${context.user.id}`,10,60);
 if(!await db.archiveBranch.count({where:{id:input.branchId}}))throw new ApiError(404,'NOT_FOUND','Филиал не найден.');
 if(await db.fileImportPreview.count({where:{authorId:context.user.id,catalogBatchId:null}})>=20)throw new ApiError(409,'PREVIEW_QUOTA','Данные изменились. Обновите страницу и повторите.');
 const bytes=Buffer.from(input.base64,'base64');if(bytes.length>2*1024*1024||bytes.toString('base64')!==input.base64)invalid('INVALID_FILE_BYTES');
 const parsed=await isolatedProcessing({mode:'spreadsheet',format:input.format,base64:input.base64}) as {sheets:FilePreviewSheet[];sourceSha256:string};
 const result=mapSpreadsheet(parsed.sheets,input.mapping,input.branchId,input.sourceNamespace);
 const stored=await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032108)`;if(await tx.fileImportPreview.count({where:{authorId:context.user.id,catalogBatchId:null}})>=20)throw new ApiError(409,'PREVIEW_QUOTA','Данные изменились. Обновите страницу и повторите.');const item=await tx.fileImportPreview.create({data:{branchId:input.branchId,authorId:context.user.id,sourceNamespace:input.sourceNamespace,format:input.format,sourceHash:parsed.sourceSha256,originalBytes:bytes,mapping:input.mapping as Prisma.InputJsonObject,result:{...result,source:parsed,mappingHash:digest(input.mapping)} as unknown as Prisma.InputJsonObject}});await audit(tx,context.user.id,'FILE_IMPORT_PREVIEW_CREATED',item.id);return item;});
 return json({item:previewDTO(stored)},201);
}
