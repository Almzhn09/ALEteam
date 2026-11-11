import {mkdir,writeFile} from 'node:fs/promises';
import {db} from '../src/server/db';
import {importRealContent} from '../src/server/real-content-import';
import {backupBeforeRealImport} from '../src/server/real-content-backup';
import {syntheticWithdrawal} from '../src/server/retire-synthetic';
import {publishSourceImages} from '../src/server/source-images';
const apply=process.argv.includes('--apply'),report=process.argv.find(a=>a.startsWith('--report='))?.slice(9)??'.local/real-content/'+(apply?'applied':'preview')+'.json';
try{
 const backup=apply?await backupBeforeRealImport():null;
 const result=await importRealContent(!apply);const cleanup=await syntheticWithdrawal(!apply);
 const photos=await publishSourceImages(apply);
 await mkdir('.local/real-content',{recursive:true,mode:0o700});await writeFile(report,JSON.stringify({version:1,...result,cleanup,backup,photos},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({apply,report,pages:result.pages.length,files:'attachments'in result?result.attachments?.length:result.files?.length,imageAttachments:photos.items.length,blockedImages:photos.blocked,directories:result.directories.total,sourceDigest:result.digest,retiredFixtures:cleanup.documentIds.length}));
}finally{await db.$disconnect();}
