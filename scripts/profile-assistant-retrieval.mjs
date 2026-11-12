// Read-only local profiling. Requires DATABASE_URL; never prints it or source contents.
import {PrismaClient} from '../src/generated/prisma/index.js';
import {PrismaPg} from '@prisma/adapter-pg';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
let ormCalls=0;
const raw=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
globalThis.archiveDb=raw.$extends({query:{$allOperations:async({args,query})=>{ormCalls++;return query(args);}}});
const {semanticConversationPlan}=await import('../src/server/semantic-catalog-plan.ts');
const {retrieveSemanticCatalog}=await import('../src/server/semantic-catalog.ts');
try{
 const plan=semanticConversationPlan('покажи документы про Усть-Каменогорск',[],'ru',true),samples=[];
 for(let i=0;i<4;i++){
  ormCalls=0;const start=performance.now(),sources=await retrieveSemanticCatalog(plan);
  samples.push({ms:Math.round((performance.now()-start)*100)/100,ormCalls,sourceIds:sources.map(s=>s.id)});
 }
 const out=process.argv[2]??'.local/assistant-speed/current.json';await mkdir(path.dirname(out),{recursive:true});
 const report={scope:'Read-only local real corpus; catalog retrieval stage only',counter:'Top-level Prisma operations, not individual SQL statements',samples};
 await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await raw.$disconnect();}
