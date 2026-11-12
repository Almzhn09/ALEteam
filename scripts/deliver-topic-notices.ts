import {deliverTopicNotices} from '../src/server/discovery-personal';
import {db} from '../src/server/db';
try{console.log(JSON.stringify(await deliverTopicNotices()));}finally{await db.$disconnect();}
