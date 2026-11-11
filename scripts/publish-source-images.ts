import {db} from '../src/server/db';
import {publishSourceImages} from '../src/server/source-images';
try{
 const result=await publishSourceImages(process.argv.includes('--apply'));
 console.log(JSON.stringify(result,null,2));
 if(result.blocked.length)process.exitCode=2;
}finally{await db.$disconnect();}
