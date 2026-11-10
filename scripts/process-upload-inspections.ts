import {db} from '../src/server/db';
import {processInspection} from '../src/server/upload-inspection';
try{
 await db.uploadInspectionJob.updateMany({where:{state:'RUNNING',leaseUntil:{lt:new Date()},attempts:{gte:3}},data:{state:'FAILED',failureCode:'PROCESSING_ATTEMPTS_EXHAUSTED',leaseToken:null,leaseUntil:null}});
 const rows=await db.uploadInspectionJob.findMany({where:{attempts:{lt:3},OR:[{state:'QUEUED'},{state:'RUNNING',leaseUntil:{lt:new Date()}}]},orderBy:{id:'asc'},take:20});
 const results=[];for(const row of rows)results.push(await processInspection(row.uploadId));console.log(JSON.stringify({processed:results.length,passed:results.filter(r=>r.state==='PASSED').length,failed:results.filter(r=>r.state==='FAILED').length}));
}finally{await db.$disconnect();}
