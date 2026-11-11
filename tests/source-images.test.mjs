import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {downloadVerifiedImage} from '../scripts/refresh-source-images.mjs';

test('source downloads require a complete strictly decodable image, retain all bytes and bound resource use',async()=>{
 const good=await readFile('sources/archive-visual-20261111/originals/archive-next-generation-ridder.jpg');
 const incomplete=await readFile('sources/archive-visual-20261111/originals/open-day-altay.jpg');
 const server=createServer((request,response)=>{
  response.setHeader('Connection','close');
  if(request.url==='/hang')return;
  if(request.url==='/missing'){response.writeHead(404);response.end();return;}
  response.setHeader('Content-Type','image/jpeg');
  response.setHeader('Content-Length',request.url==='/short'?good.length:request.url==='/bad'?incomplete.length:good.length);
  response.end(['/bad','/short'].includes(request.url)?incomplete:good);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const result=await downloadVerifiedImage(base+'/good');assert.deepEqual(result.bytes,good);assert.equal(result.sha256,createHash('sha256').update(good).digest('hex'));assert.equal(result.width,960);assert.equal(result.height,1280);
  await assert.rejects(()=>downloadVerifiedImage(base+'/bad'));
  await assert.rejects(()=>downloadVerifiedImage(base+'/short'));
  await assert.rejects(()=>downloadVerifiedImage(base+'/good',{maxBytes:1000}),/SOURCE_IMAGE_SIZE_LIMIT/);
  await assert.rejects(()=>downloadVerifiedImage(base+'/missing'),/SOURCE_IMAGE_HTTP_404/);
  await assert.rejects(()=>downloadVerifiedImage(base+'/hang',{timeoutMs:50}));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
