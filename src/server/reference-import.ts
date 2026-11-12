import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {db} from './db';
import {Prisma} from '../generated/prisma/index.js';
import {canonicalHash} from './catalog-import-schema';
import {ApiError,json,readJson,queryParams} from './http';
import {staffContext,audit} from './staff';
import {z} from 'zod';
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
export async function referencePackage(){
 const funds=JSON.parse(await readFile('data/artur/discovery/fund-history-drafts.json','utf8'));
 const papers=JSON.parse(await readFile('data/artur/discovery/newspaper-holdings-drafts.json','utf8'));
 const linked=JSON.parse(await readFile('sources/archive-20261110/linked-fetch.json','utf8'));
 const sets=[];
 for(const [i,dataset]of funds.datasets.entries()){
  const original=linked.find((r:{path:string})=>r.path===`linked/S09-link-${i+2}.xlsb`);if(!original)throw Error('SOURCE_MISSING');
  const bytes=await readFile('sources/archive-20261110/'+original.path);if(sha(bytes)!==original.sha256)throw Error('SOURCE_HASH_CHANGED');
  const id='s09-funds-'+(i===0?'general':'party');const source={edition:'Имя файла: 2018; подпись ссылки: 2026',asOf:null,notes:'Дата актуальности фондового перечня не установлена. Различия названий сохранены как строки источника.',sha256:original.sha256,holder:null,branchId:null};
  const records=dataset.records.map((r:{sourceKey:string;number:string;names:{name:string;periodOriginal?:string;sourceRow:number}[]},position:number)=>({id:'rf-'+sha(id+':'+r.sourceKey).slice(0,28),sourceKey:r.sourceKey,position,number:r.number,title:r.names[0].name,payload:{names:r.names.map(n=>({name:n.name,periodOriginal:n.periodOriginal??null,sourceRow:n.sourceRow}))},raw:r,searchText:[r.number,...r.names.flatMap(n=>[n.name,n.periodOriginal??''])].join('\n')}));
  sets.push({id,kind:'fund',title:i===0?'Фонды Государственного архива ВКО':'Партийные фонды',sourceSha256:original.sha256,source,records,report:{sourceRows:dataset.source.nonemptyRows,missingNumberRows:dataset.source.rowsMissingNumber,groups:records.length,holderUnmapped:true}});
 }
 const original=linked.find((r:{path:string})=>r.path==='linked/S09-link-1.docx');if(!original)throw Error('SOURCE_MISSING');const bytes=await readFile('sources/archive-20261110/'+original.path);if(sha(bytes)!==original.sha256)throw Error('SOURCE_HASH_CHANGED');
 const id='s09-newspapers';const rows=papers.tables.flatMap((t:{rows:unknown[]})=>t.rows).filter((r:{classification:string})=>r.classification!=='header');
 const records=rows.map((r:{physicalRow:number;cells:{text:string}[]},position:number)=>{const cells=r.cells.map(c=>c.text);return {id:'rn-'+sha(id+':'+r.physicalRow).slice(0,28),sourceKey:'table-1-row-'+r.physicalRow,position,number:null,title:cells[1],searchText:cells.slice(1).join('\n'),payload:{publisherOriginal:cells[2],volumesOriginal:cells[3],yearsOriginal:cells[4],notes:cells[5],sourceRow:r.physicalRow},raw:r};});
 sets.push({id,kind:'newspaper',title:'Перечень хранения газет',sourceSha256:original.sha256,source:{edition:'Снимок перечня на 01.01.2018',asOf:'2018-01-01',notes:'Подпись ссылки: 2026. Годы в файле: 1935–2017, в подписи ссылки: 1935–2011. Строки не являются отдельными оцифрованными выпусками.',sha256:original.sha256,holder:null,branchId:null},records,report:{sourceRows:1468,headerRows:2,holdingsRows:records.length,holderUnmapped:true}});
 if(sets[0].records.length!==1552||sets[1].records.length!==153||records.length!==1466)throw Error('SOURCE_COUNTS_CHANGED');
 return sets;
}
export async function importReferencePackage(actorId:string,dryRun=true){
 const sets=await referencePackage();const report=[];
 for(const set of sets){const hash=canonicalHash(set),existing=await db.referenceDataset.findUnique({where:{id:set.id}});if(existing&&existing.importHash!==hash)throw new ApiError(409,'SOURCE_IMPORT_CONFLICT','Данные изменились. Обновите страницу и повторите.');
  if(!dryRun&&!existing)await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(782032109)`;const again=await tx.referenceDataset.findUnique({where:{id:set.id}});if(again){if(again.importHash!==hash)throw new ApiError(409,'SOURCE_IMPORT_CONFLICT','Данные изменились. Обновите страницу и повторите.');return;}
   await tx.referenceDataset.create({data:{id:set.id,kind:set.kind,title:set.title,sourceSha256:set.sourceSha256,importHash:hash,source:set.source as Prisma.InputJsonObject,isPublic:true}});
   for(let index=0;index<set.records.length;index+=200)await tx.referenceEntry.createMany({data:set.records.slice(index,index+200).map((r:any)=>({...r,datasetId:set.id,payload:r.payload as Prisma.InputJsonValue,raw:r.raw as Prisma.InputJsonValue,isPublic:true}))});
   await audit(tx,actorId,'REFERENCE_DATASET_IMPORTED',set.id);
  },{timeout:60000});
  report.push({id:set.id,kind:set.kind,count:set.records.length,state:existing?'unchanged':dryRun?'create':'imported',...set.report});
 }
 return {dryRun,sets:report,total:report.reduce((n,r)=>n+r.count,0)};
}
export async function adminDirectories(request:Request,id?:string){
 const c=await staffContext(request,request.method==='GET'?'catalog.read':'catalog.write',null);
 if(request.method==='GET'){z.object({}).strict().parse(queryParams(request));return json({items:await db.referenceDataset.findMany({include:{_count:{select:{entries:true}}},orderBy:{id:'asc'}})});}
 if(id){await staffContext(request,'content.publish',null);const p=z.object({isPublic:z.boolean(),expectedVisible:z.boolean()}).strict().parse(await readJson(request,1024));const changed=await db.$transaction(async tx=>{const changed=await tx.referenceDataset.updateMany({where:{id,isPublic:p.expectedVisible},data:{isPublic:p.isPublic}});if(!changed.count)throw new ApiError(409,'STALE_DATASET','Данные изменились. Обновите страницу и повторите.');await audit(tx,c.user.id,p.isPublic?'REFERENCE_DATASET_PUBLISHED':'REFERENCE_DATASET_WITHDRAWN',id);return changed.count;});return json({changed});}
 const p=z.object({package:z.literal('archive-20261110'),dryRun:z.boolean().default(true)}).strict().parse(await readJson(request,1024));if(!p.dryRun)await staffContext(request,'content.publish',null);return json(await importReferencePackage(c.user.id,p.dryRun));
}
