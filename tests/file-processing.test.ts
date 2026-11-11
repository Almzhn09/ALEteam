import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as XLSX from '@e965/xlsx';
const worker=(input:unknown)=>JSON.parse(execFileSync(process.execPath,['--max-old-space-size=128','scripts/isolated-file-worker.mjs'],{input:JSON.stringify(input),env:{NODE_ENV:'production',PATH:process.env.PATH},maxBuffer:17*1024*1024,timeout:25000}).toString());
function rejected(input:unknown){try{worker(input);assert.fail('Untrusted content was accepted');}catch(error){const result=JSON.parse((error as {stdout:Buffer}).stdout.toString());assert.equal(result.passed,false);return result;}}
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('CSV/XLSX/XLSB preserve zeros, literal suffixes, formula flags and the Excel leap-day ambiguity',()=>{
 const plain=Buffer.from('id,number\n0007,0005-а\n');assert.equal(worker({mode:'spreadsheet',format:'csv',base64:plain.toString('base64')}).sheets[0].rows[1].cells[1].raw,'0005-а');
 for(const format of ['csv','xlsx','xlsb'] as const){
  const sheet=XLSX.utils.aoa_to_sheet([['id','number','date','formula'],['0007','0005-а',60,1],['0008','005-б',61,2]]);sheet.C2.z='yyyy-mm-dd';sheet.C3.z='yyyy-mm-dd';sheet.D2.f='1+0';const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'Data');const bytes=XLSX.write(wb,{bookType:format,type:'buffer'});
  const r=worker({mode:'spreadsheet',format,base64:bytes.toString('base64')});const rows=r.sheets[0].rows;
  assert.equal(rows[1].cells[0].raw,'0007');assert.equal(rows[1].cells[1].raw,'0005-а');assert.equal(r.sourceSha256,hash(bytes));
  if(format!=='csv'){assert.equal(rows[1].cells[2].dateIssue,'EXCEL_1900_LEAP_DAY');assert.deepEqual(rows[2].cells[2].dateCandidate,{year:1900,month:3,day:1});if(format==='xlsx')assert.equal(rows[1].cells[3].formula,'1+0');}
 }
});
test('both real S09 XLSB sources parse with their recorded physical nonempty-row counts',()=>{
 for(const [file,count]of [['S09-link-2.xlsb',3755],['S09-link-3.xlsb',318]] as const){const bytes=readFileSync('sources/archive-20261110/linked/'+file);const r=worker({mode:'spreadsheet',format:'xlsb',base64:bytes.toString('base64')});assert.equal(r.sheets.reduce((n:number,s:{nonEmptyRows:number})=>n+s.nonEmptyRows,0),count);}
});
test('format mismatch and invalid UTF-8 are rejected without guessing encoding',()=>{
 rejected({mode:'spreadsheet',format:'csv',base64:Buffer.from([255,254,0,0]).toString('base64')});
 rejected({mode:'spreadsheet',format:'xlsx',base64:Buffer.from('id,title\n01,Original').toString('base64')});
});
function pdfWithJavaScript(){
 const objects=['<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream','<< /S /JavaScript /JS (app.alert\\(1\\)) >>'];
 let text='%PDF-1.7\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(text);text+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(text);
}
test('full image decode rejects signature-only corruption and PDF JavaScript is never accepted',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'ale-parser-'));try{
  const fake=Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3]);const active=pdfWithJavaScript();
  for(const [name,bytes,mime]of [['fake.png',fake,'image/png'],['active.pdf',active,'application/pdf']] as const){const file=path.join(folder,name);writeFileSync(file,bytes);const failure=rejected({mode:'inspect',path:file,expectedBytes:bytes.length,expectedSha256:hash(bytes),mime});if(name==='active.pdf')assert.equal(failure.error,'ACTIVE_CONTENT');}
  const original=readFileSync('data/scans/demo-doc-01.png');const file=path.join(folder,'original.png');writeFileSync(file,original);const r=worker({mode:'inspect',path:file,expectedBytes:original.length,expectedSha256:hash(original),mime:'image/png'});assert.equal(r.passed,true);assert.equal(r.antivirus,'not-configured');assert.equal(hash(readFileSync(file)),hash(original));assert.equal(hash(Buffer.from(r.preview.base64,'base64')),r.preview.sha256);
 }finally{rmSync(folder,{recursive:true,force:true});}
});

test('real DOCX uses original paragraphs; malformed XML, active objects and DTD declarations are rejected',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'ale-docx-'));const {zipSync,strToU8}=await import('fflate');
 try{
  const original=readFileSync('sources/archive-20261110/originals/История архива.docx'),file=path.join(folder,'source.docx');writeFileSync(file,original);
  const result=worker({mode:'inspect',path:file,expectedBytes:original.length,expectedSha256:hash(original),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});assert.equal(result.parser,'openxml-docx');assert.equal(result.pages,null);assert.ok(result.fragments[0].paragraph===1);assert.ok(result.fragments.some((f:{text:string})=>f.text.includes('архив')));assert.equal(hash(readFileSync(file)),hash(original));
  for(const xml of ['<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><w:document/>','<w:document><unclosed>']){const data=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8(xml)});writeFileSync(file,data);rejected({mode:'inspect',path:file,expectedBytes:data.length,expectedSha256:hash(data),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});}
 }finally{rmSync(folder,{recursive:true,force:true});}
});
