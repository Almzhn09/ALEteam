import {createHash} from 'node:crypto';
import {db} from './db';
import {publicDocumentWhere} from './public-visibility';
import {fileResponse} from './catalog';
import {cmsAttachmentRefs} from './cms-attachments';
import {resolveMaterial} from './discovery-materials';
import type {MaterialKey} from '../contracts/discovery';
import type {AttachmentRef} from '../contracts/real-content';
export async function materialAttachments(key:MaterialKey,locale:'ru'|'kk'|'en'):Promise<AttachmentRef[]>{
 if(key.kind==='cms')return cmsAttachmentRefs(key.id,locale);
 const material=await resolveMaterial(key,locale,true);if(!material)return [];
 const files=await db.archiveFile.findMany({where:{documentId:key.id,isPublic:true,document:{...publicDocumentWhere,allowDigitalCopy:true}},orderBy:{id:'asc'},take:20});const refs:AttachmentRef[]=[];
 for(const file of files){try{const response=await fileResponse(new Request('http://attachment.invalid/'),file.id);const bytes=Buffer.from(await response.arrayBuffer());refs.push({id:file.id,material:key,locale:material.source.locale,revision:material.source.revision,name:file.name,mimeType:file.mimeType,bytes:bytes.length,variant:file.variant==='preview'?'preview':'master',parentId:file.parentFileId,href:'/api/files/'+file.id,textHref:'/api/files/'+file.id+'/text',downloadable:file.downloadable,sha256:createHash('sha256').update(bytes).digest('hex'),source:{label:file.name,version:material.source.revision}});}catch(error){if((error as {status?:number}).status!==404)throw error;}}
 return refs;
}
