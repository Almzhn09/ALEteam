import {z} from 'zod';
import {db} from './db';
import {searchQueryVariants} from './search-names';
import {Prisma,type ReferenceEntry,type ReferenceDataset} from '../generated/prisma/index.js';
import {json,queryParams,idSchema,ApiError} from './http';
import type {FundDirectoryEntry,NewspaperEntry,RegistrySource} from '../contracts/real-content';
export const directoryQuery=z.object({q:z.string().trim().max(200).default(''),nameMode:z.enum(['literal','expanded']).default('expanded'),sourceId:idSchema.optional(),number:z.string().max(100).optional(),page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20),sort:z.enum(['source','title']).default('source')}).strict();
export function directoryWhere(kind:'fund'|'newspaper',p:{q:string;sourceId?:string;number?:string;nameMode?:'literal'|'expanded'}):Prisma.ReferenceEntryWhereInput{return {isPublic:true,dataset:{kind,isPublic:true,...(p.sourceId?{id:p.sourceId}:{})},...(p.number!==undefined?{number:p.number}:{}),...(p.q.trim()?{OR:searchQueryVariants(p.q,p.nameMode).map(query=>({AND:query.split(/\s+/).filter(Boolean).map(term=>({searchText:{contains:term,mode:'insensitive' as const}}))}))}:{})};}
export function directoryDTO(row:ReferenceEntry&{dataset:ReferenceDataset}):FundDirectoryEntry|NewspaperEntry{
 const source={id:row.dataset.id,title:row.dataset.title,...row.dataset.source as Omit<RegistrySource,'id'|'title'>};
 if(row.dataset.kind==='fund'){const p=row.payload as {names:FundDirectoryEntry['names']};return {kind:'fund',id:row.id,number:row.number!,names:p.names,renameStatus:'source_rows',source,href:'/api/directories/funds/'+row.id};}
 const p=row.payload as {publisherOriginal:string;volumesOriginal:string;yearsOriginal:string;notes:string;sourceRow:number};return {kind:'newspaper',id:row.id,title:row.title,...p,source,href:'/api/directories/newspapers/'+row.id};
}
export async function directory(request:Request,kind:'fund'|'newspaper',id?:string,exportAll=false){
 const p=directoryQuery.parse(queryParams(request)),where=directoryWhere(kind,p);
 if(id){const row=await db.referenceEntry.findFirst({where:{...where,id:idSchema.parse(id)},include:{dataset:true}});if(!row)throw new ApiError(404,'NOT_FOUND','Материал не найден.');return json({item:directoryDTO(row)});}
 const orderBy:Prisma.ReferenceEntryOrderByWithRelationInput[]=p.sort==='source'?[{datasetId:'asc'},{position:'asc'},{id:'asc'}]:[{title:'asc'},{id:'asc'}];
 const [total,rows]=await db.$transaction([db.referenceEntry.count({where}),db.referenceEntry.findMany({where,include:{dataset:true},orderBy,skip:exportAll?0:(p.page-1)*p.pageSize,take:exportAll?10001:p.pageSize})],{isolationLevel:'RepeatableRead'});
 if(exportAll&&total>10000)throw new ApiError(503,'EXPORT_LIMIT','Сервис временно недоступен.');
 return json({items:rows.map(directoryDTO),total,...(!exportAll?{page:p.page,pageSize:p.pageSize}:{}),...(exportAll?{format:'public-directory-v1',exported:rows.length}:{}),kind,sourceVersions:[...new Map(rows.map(r=>[r.dataset.id,directoryDTO(r).source])).values()]});
}
