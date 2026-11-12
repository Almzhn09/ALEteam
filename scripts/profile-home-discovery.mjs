// Read-only profile of the public home recommendation handler; no credentials in output.
import {PrismaClient} from '../src/generated/prisma/index.js';
import {PrismaPg} from '@prisma/adapter-pg';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
let ormCalls=0;const raw=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
globalThis.archiveDb=raw.$extends({query:{$allOperations:async({args,query})=>{ormCalls++;return query(args);}}});
try{
 const {home}=await import('../src/server/discovery-home.ts');const samples=[];
 for(let i=0;i<4;i++){ormCalls=0;const start=performance.now(),response=await home(new Request('http://internal.invalid/api/discovery/home?locale=ru&limit=3')),body=await response.json();samples.push({ms:Math.round((performance.now()-start)*100)/100,ormCalls,ids:body.recommended.items.map(i=>i.id),mode:body.recommended.mode});}
 const out=process.argv[2]??'.local/home-profile.json';await mkdir(path.dirname(out),{recursive:true});const result={scope:'Local real corpus, read-only anonymous recommendations',counter:'Prisma top-level operations, not individual SQL statements',samples};await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await raw.$disconnect();}
