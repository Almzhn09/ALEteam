import {z} from 'zod';
import {db} from './db';
import {resolveMaterial} from './discovery-materials';
import {localeSchema,conflict,unavailable,digest} from './discovery-utils';
import {json,readJson,idSchema,rateLimit} from './http';
import {authorizedFileText} from './authorized-file-text';
import {discoveryEngines} from './discovery-engine-registry';
import type {AuthorizedText,Explanation} from '../contracts/discovery';
const outputSchema=z.object({status:z.enum(['ready','no_text','low_quality','unsupported']),mode:z.enum(['extractive','glossary','grounded']).nullable(),sourceRevision:z.string().nullable(),summary:z.string().max(5000).optional(),terms:z.array(z.object({term:z.string().max(120),explanation:z.string().max(1000),fragmentIds:z.array(z.string().max(80)).max(10)}).strict()).max(20),citations:z.array(z.object({fragmentId:z.string().max(80),quote:z.string().min(1).max(2000),source:z.unknown()}).strict()).max(20),limitations:z.array(z.string().max(500)).max(20)}).strict();
export function checkedExplanation(value:unknown,input:AuthorizedText):Explanation{
 const result=outputSchema.parse(value);
 if(input.ocr.quality==='low')return {status:'low_quality',mode:null,sourceRevision:input.fingerprint,terms:[],citations:[],limitations:['Readable source quality is insufficient.']};
 if(result.status==='ready'&&(!result.summary||!result.citations.length))conflict('UNSUPPORTED_EXPLANATION');
 for(const term of result.terms)if(!term.fragmentIds.length||term.fragmentIds.some(id=>!input.fragments.some(f=>f.id===id)))conflict('INVALID_CITATION');
 const citations=result.citations.map(citation=>{
  const fragment=input.fragments.find(f=>f.id===citation.fragmentId);if(!fragment||!citation.quote.trim()||!fragment.text.includes(citation.quote))conflict('INVALID_CITATION');
  const start=(fragment.start??0)+fragment.text.indexOf(citation.quote);
  return {...citation,source:{...input.source,fragment:{id:fragment.id,...(fragment.page!==undefined?{page:fragment.page}:{}),start,end:start+citation.quote.length}}};
 });
 return {...result,sourceRevision:input.fingerprint,citations};
}
export async function explanation(request:Request,id:string){
 idSchema.parse(id);const p=z.object({locale:localeSchema,sourceRevision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict().parse(await readJson(request,2048));
 await rateLimit('discovery-explanation',60,60);
 const material=await resolveMaterial({kind:'document',id},p.locale,true);if(!material)unavailable();
 const card=await db.document.findUniqueOrThrow({where:{id},select:{allowDigitalCopy:true}});if(!card.allowDigitalCopy)unavailable();
 const files=await db.archiveFile.findMany({where:{documentId:id,isPublic:true},select:{id:true},orderBy:{id:'asc'},take:5});
 let input:AuthorizedText|undefined;let selectedFileId:string|undefined;let truncated=false;
 for(const file of files){
  try{
   const item=await authorizedFileText(file.id);
   const text=String(item.text).slice(0,12000);if(!text.trim())continue;
   const fingerprint=digest([material.source.revision,file.id,item.sourceSha256,item.textSha256]);
   const source={...material.source,revision:fingerprint,href:`/api/files/${encodeURIComponent(file.id)}/text`,fragment:{id:file.id}};
   input={source,fingerprint,sourceSha256:item.sourceSha256,textSha256:item.textSha256,fragments:item.fragments,ocr:{used:item.isOcr,quality:item.isOcr?(item.corrected?'reviewed':'unreviewed'):'not_applicable',engine:item.engine,...('confidence' in item&&typeof item.confidence==='number'?{confidence:item.confidence}:{})}};selectedFileId=file.id;truncated=item.truncated;break;
  }catch(error){if((error as {status?:number}).status!==404)throw error;}
 }
 const revision=input?.fingerprint??material.source.revision;
 if(p.sourceRevision&&p.sourceRevision!==revision)conflict('SOURCE_CHANGED');
 const base={mode:null,sourceRevision:revision,terms:[],citations:[],limitations:[]} as const;
 if(!input)return json({...base,status:'no_text',limitations:['No approved readable file text is available.']});
 if(!discoveryEngines.explainFragments)return json({...base,status:'unsupported',limitations:['COL-A03 engine is not connected. OCR, if used, requires independent review.']});
 const output=checkedExplanation(discoveryEngines.explainFragments(input,{locale:p.locale,now:new Date().toISOString()}),input);
 output.ocr=input.ocr;
 if(truncated)output.limitations.push({ru:'Использованы первые 12 000 символов разрешённого текста; это выдержки из части документа.',kk:'Рұқсат етілген мәтіннің алғашқы 12 000 таңбасы пайдаланылды; үзінділер құжаттың бір бөлігіне қатысты.',en:'Only the first 12,000 characters of authorized text were used; the excerpts cover part of the document.'}[p.locale]);
 const current=await resolveMaterial({kind:'document',id},material.source.locale,false);if(!current||current.source.revision!==material.source.revision)unavailable();
 const text=await authorizedFileText(selectedFileId!);
 if(text.sourceSha256!==input.sourceSha256||text.textSha256!==input.textSha256)unavailable();
 return json(output);
}
