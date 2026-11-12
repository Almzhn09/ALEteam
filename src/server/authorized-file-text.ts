import {createHash} from 'node:crypto';
import {z} from 'zod';
import {db} from './db';
import {fileResponse} from './catalog';
import {recognizedText} from './ocr';
import {ApiError,json} from './http';
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const parsedSchema=z.object({parser:z.string(),fragments:z.array(z.object({page:z.number().int().positive(),text:z.string().max(12000)}))});
export function boundedFileFragments(fragments:{id:string;page?:number;paragraph?:number;text:string}[],limit=12000){
 let used=0;const result:{id:string;page?:number;paragraph?:number;text:string;start:number;end:number}[]=[];
 for(const fragment of fragments){
  if(used>=limit)break;
  const text=fragment.text.slice(0,limit-used);result.push({...fragment,text,start:used,end:used+text.length});used+=text.length+1;
 }
 const text=result.map(f=>f.text).join('\n');
 return {text,fragments:result,truncated:fragments.map(f=>f.text).join('\n').length>text.length};
}
/** Bounded reader pages; the default window preserves the assistant's existing excerpts. */
export function pagedFileFragments(fragments:{id:string;page?:number;paragraph?:number;text:string}[],offset=0,limit=12000){
 const available:typeof fragments=[];const positions=new Map<string,{start:number;end:number}>();let cursor=0;
 for(const fragment of fragments){
  const start=cursor,end=start+fragment.text.length;cursor=end+1;
  if(offset===0||end>offset||fragment.text.length===0&&start>=offset){
   const skip=Math.max(0,offset-start);available.push({...fragment,text:fragment.text.slice(skip)});positions.set(fragment.id,{start:start+skip,end});
  }
 }
 const totalCharacters=Math.max(0,cursor-1),bounded=boundedFileFragments(available,limit),last=bounded.fragments.at(-1);let nextOffset:number|null=null;
 if(last){const position=positions.get(last.id)!;const end=position.start+last.text.length;const next=end<position.end?end:end+1;if(next<totalCharacters)nextOffset=next;}
 return {...bounded,truncated:offset>0||nextOffset!==null,offset,nextOffset,totalCharacters};
}
export async function authorizedFileText(id:string){
 // Every read checks current card, branch, file rights and source bytes, including legacy OCR.
 const source=await fileResponse(new Request('http://text.invalid/'),id),bytes=Buffer.from(await source.arrayBuffer()),sourceSha256=hash(bytes);
 try{
  const legacy=await recognizedText(new Request('http://text.invalid/'),id);const {item}=await legacy.json();
  const bounded=boundedFileFragments([{id,text:String(item.text)}]);return {...item,...bounded,textSha256:hash(bounded.text)};
 }catch(error){if(!(error instanceof ApiError)||error.status!==404)throw error;}
 const job=await db.uploadInspectionJob.findFirst({where:{state:'PASSED',upload:{fileId:id,state:'PUBLISHED',expectedSha256:sourceSha256}}});
 if(!job)throw new ApiError(404,'NOT_FOUND','Распознанный текст пока недоступен.');
 const parsed=parsedSchema.safeParse(job.result);if(!parsed.success||!parsed.data.fragments.length)throw new ApiError(404,'NOT_FOUND','Распознанный текст пока недоступен.');
 const bounded=boundedFileFragments(parsed.data.fragments.map((fragment,index)=>({...fragment,id:id+'-'+(index+1)})));
 return {id,...bounded,textSha256:hash(bounded.text),sourceSha256,isOcr:false,corrected:false,engine:parsed.data.parser};
}
export async function fileText(request:Request,id:string){z.object({}).strict().parse(Object.fromEntries(new URL(request.url).searchParams));return json({item:await authorizedFileText(id)});}
