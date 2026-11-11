import {execFile} from 'node:child_process';
import path from 'node:path';
import {ApiError} from './http';
let inFlight=0;
export const DEFAULT_FILE_PROCESSING_TIMEOUT_MS=120_000;
export function fileProcessingTimeout(raw=process.env.FILE_PROCESSING_TIMEOUT_MS):number{
 if(raw===undefined||raw.trim()==='')return DEFAULT_FILE_PROCESSING_TIMEOUT_MS;
 const value=Number(raw);
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<1000||value>300_000)throw Error('FILE_PROCESSING_TIMEOUT_MS must be an integer from 1000 to 300000');
 return value;
}
export function isolatedProcessing(input:unknown):Promise<unknown>{
 let timeout:number;try{timeout=fileProcessingTimeout();}catch(error){return Promise.reject(error);}
 if(inFlight>=2)return Promise.reject(new ApiError(503,'PROCESSING_BUSY','Сервис временно недоступен.'));
 inFlight++;
 return new Promise((resolve,reject)=>{
  const child=execFile(process.execPath,['--max-old-space-size=128',path.resolve('scripts/isolated-file-worker.mjs')],{
   timeout,killSignal:'SIGKILL',maxBuffer:17*1024*1024,
   env:{NODE_ENV:'production',PATH:process.env.PATH??'/usr/bin:/bin',UV_THREADPOOL_SIZE:'1',NODE_NO_WARNINGS:'1'},
  },(error,stdout)=>{
   inFlight--;
   if(error){reject(new ApiError(422,error.killed?'PROCESSING_TIMEOUT':'FILE_PROCESSING_FAILED','Проверьте введённые данные.'));return;}
   try{const result=JSON.parse(stdout);if(result.passed===false)throw Error();resolve(result);}catch{reject(new ApiError(422,'FILE_PROCESSING_FAILED','Проверьте введённые данные.'));}
  });
  child.stdin?.on('error',()=>{});child.stdin?.end(JSON.stringify(input));
 });
}
