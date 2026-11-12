import {setTimeout as delay} from 'node:timers/promises';
import {db} from '../src/server/db';
import {processInspection} from '../src/server/upload-inspection';
import {deliverTopicNotices} from '../src/server/discovery-personal';
let stopped=false;process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
try{
 while(!stopped){
  try{
   await db.uploadInspectionJob.updateMany({where:{state:'RUNNING',leaseUntil:{lt:new Date()},attempts:{gte:3}},data:{state:'FAILED',failureCode:'PROCESSING_ATTEMPTS_EXHAUSTED',leaseToken:null,leaseUntil:null}});
   const jobs=await db.uploadInspectionJob.findMany({where:{attempts:{lt:3},OR:[{state:'QUEUED'},{state:'RUNNING',leaseUntil:{lt:new Date()}}]},orderBy:{id:'asc'},take:20});
   let passed=0;for(const job of jobs){if(stopped)break;if((await processInspection(job.uploadId)).state==='PASSED')passed++;}
   const notices=await deliverTopicNotices();console.log(JSON.stringify({inspected:jobs.length,passed,...notices}));
  }catch{console.error(JSON.stringify({error:'ARCHIVE_JOB_BATCH_FAILED'}));}
  for(let i=0;i<15&&!stopped;i++)await delay(1000);
 }
}finally{await db.$disconnect();}
