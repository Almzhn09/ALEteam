import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db} from './db';
import {fileResponse} from './catalog';
import {recognizedText} from './ocr';
import {ApiError,json} from './http';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const parsedSchema=z.object({parser:z.string(),fragments:z.array(z.object({page:z.number().int().positive(),text:z.string().max(12000)}))});
export async function authorizedFileText(id:string){
 // Every read checks current card, branch, file rights and source bytes, including legacy OCR.
 const source=await fileResponse(new Request('http://text.invalid/'),id),bytes=Buffer.from(await source.arrayBuffer()),sourceSha256=hash(bytes);
 try{
  const legacy=await recognizedText(new Request('http://text.invalid/'),id);const {item}=await legacy.json();
  const text=String(item.text).slice(0,12000);return {...item,text,textSha256:hash(text),fragments:[{id,text,start:0,end:text.length}]};
 }catch(error){if(!(error instanceof ApiError)||error.status!==404)throw error;}
 const job=await db.uploadInspectionJob.findFirst({where:{state:'PASSED',upload:{fileId:id,state:'PUBLISHED',expectedSha256:sourceSha256}}});
 if(!job)throw new ApiError(404,'NOT_FOUND','Распознанный текст пока недоступен.');
 const parsed=parsedSchema.safeParse(job.result);if(!parsed.success||!parsed.data.fragments.length)throw new ApiError(404,'NOT_FOUND','Распознанный текст пока недоступен.');
 let start=0;const fragments=parsed.data.fragments.map((fragment,index)=>{const result={id:id+'-'+(index+1),page:fragment.page,text:fragment.text,start,end:start+fragment.text.length};start+=fragment.text.length+1;return result;});
 const text=fragments.map(f=>f.text).join('\n');
 return {id,text,textSha256:hash(text),sourceSha256,isOcr:false,corrected:false,engine:parsed.data.parser,fragments};
}
export async function fileText(request:Request,id:string){z.object({}).strict().parse(Object.fromEntries(new URL(request.url).searchParams));return json({item:await authorizedFileText(id)});}
