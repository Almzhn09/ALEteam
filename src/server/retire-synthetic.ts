import {db} from './db';
import {Prisma} from '../generated/prisma/index.js';
import {readFile} from 'node:fs/promises';
/** Addressed withdrawal, never a database reset; user records and fixture bytes remain recoverable. */
export async function syntheticWithdrawal(preview=true){
 const corpus=JSON.parse(await readFile('data/demo-corpus.json','utf8'));
 const ids=(corpus.documents??corpus).map((d:{id:string})=>d.id);
 const docs=await db.document.findMany({where:{id:{in:ids},isDemo:true,isPublic:true},select:{id:true,contentItemId:true}});
 const pack=JSON.parse(await readFile('data/artur/cms-draft-package.json','utf8'));
 const slugs=(pack.records??pack.items??[]).map((r:any)=>r.slug??r.request?.slug??r.create?.slug).filter(Boolean);
 const cms=await db.contentItem.findMany({where:{isDemo:true,slug:{in:slugs}},select:{id:true}});
 const documentIds=docs.map(d=>d.id),itemIds=[...docs.flatMap(d=>d.contentItemId?[d.contentItemId]:[]),...cms.map(c=>c.id)];
 const facts=(await db.discoveryFact.findMany({where:{status:{in:['DRAFT','VERIFIED']}},select:{id:true,sources:true}})).filter(row=>(row.sources as any[]).some(s=>s.kind==='document'?documentIds.includes(s.id):itemIds.includes(s.id)));
 const factIds=facts.map(f=>f.id);
 const dependent=await db.discoveryFact.findMany({where:{OR:[{parentId:{in:factIds}},...factIds.flatMap(id=>[{kind:'EDITORIAL',data:{path:['topicId'],equals:id}},{kind:'EDITORIAL',data:{path:['placeId'],equals:id}}])]},select:{id:true}});
 const withdrawnFacts=[...new Set([...factIds,...dependent.map(d=>d.id)])];
 if(!preview&&(documentIds.length||itemIds.length||withdrawnFacts.length))await db.$transaction(async tx=>{
  await tx.document.updateMany({where:{id:{in:documentIds},isDemo:true},data:{isPublic:false,allowDigitalCopy:false}});
  await tx.contentRevision.updateMany({where:{itemId:{in:itemIds},status:'PUBLISHED'},data:{status:'ARCHIVED'}});
  await tx.discoveryFact.updateMany({where:{id:{in:withdrawnFacts}},data:{status:'WITHDRAWN'}});
  for(const pref of await tx.discoveryPreference.findMany()){const topicIds=pref.topicIds.filter(id=>!withdrawnFacts.includes(id));if(topicIds.length!==pref.topicIds.length)await tx.discoveryPreference.update({where:{userId:pref.userId},data:{topicIds}});}
  for(const sub of await tx.topicSubscription.findMany({where:{active:true}})){const spec=sub.spec as {topicId?:string;placeId?:string};if(withdrawnFacts.includes(spec.topicId??'')||withdrawnFacts.includes(spec.placeId??''))await tx.topicSubscription.update({where:{id:sub.id},data:{active:false}});}
  await tx.auditEvent.create({data:{actorId:'ale-source-importer-v2',action:'SYNTHETIC_FIXTURES_WITHDRAWN',entityId:'known-source-fixtures-v1'}});
 });
 return {preview,documentIds,itemIds,factIds:withdrawnFacts,deletedUsers:0,deletedComments:0,deletedRealRecords:0,mode:'addressed-public-withdrawal; original rows and user data retained'};
}
