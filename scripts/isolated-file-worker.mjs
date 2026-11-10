// Trusted worker program. Untrusted bytes are data; no macros/formulas/PDF JavaScript execute.
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readFile,stat} from 'node:fs/promises';
const MAX_BYTES=20*1024*1024;
let bytes=0,parts=[];
for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>MAX_BYTES*1.4+4096)process.exit(2);parts.push(chunk);}
console.log=console.warn=console.error=()=>{};
const hash=data=>createHash('sha256').update(data).digest('hex');
function fail(code){throw Object.assign(new Error(),{safeCode:code});}
async function inspect(input){
 const metadata=await stat(input.path);if(metadata.size!==input.expectedBytes||metadata.size>MAX_BYTES)fail('SOURCE_CHANGED');
 const data=await readFile(input.path);if(hash(data)!==input.expectedSha256)fail('SOURCE_CHANGED');
 const sharp=(await import('sharp')).default;sharp.concurrency(1);sharp.cache(false);
 let preview,fragments=[],pages=1,parser;
 if(input.mime==='application/pdf'){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const {createCanvas}=await import('@napi-rs/canvas');
  class CanvasFactory{
   create(width,height){if(width<1||height<1||width*height>16_000_000)fail('FORMAT_LIMIT');const canvas=createCanvas(width,height);return{canvas,context:canvas.getContext('2d')};}
   reset(target,width,height){if(width*height>16_000_000)fail('FORMAT_LIMIT');target.canvas.width=width;target.canvas.height=height;}
   destroy(target){target.canvas.width=0;target.canvas.height=0;target.canvas=null;target.context=null;}
   getNoAlphaContext(canvas){return canvas.getContext('2d',{alpha:false});}
  }
  const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,maxImageSize:16_000_000,verbosity:0,CanvasFactory,standardFontDataUrl:fileURLToPath(new URL('./standard_fonts/',import.meta.resolve('pdfjs-dist/package.json'))),cMapUrl:fileURLToPath(new URL('./cmaps/',import.meta.resolve('pdfjs-dist/package.json'))),cMapPacked:true,wasmUrl:fileURLToPath(new URL('./wasm/',import.meta.resolve('pdfjs-dist/package.json')))});
  const pdf=await task.promise;
  try{
   pages=pdf.numPages;if(pages<1||pages>100)fail('FORMAT_LIMIT');
   if(pdf.isPureXfa||await pdf.getJSActions()||await pdf.getAttachments())fail('ACTIVE_CONTENT');
   const open=await pdf.getOpenAction();if(open?.action&&open.action!=='GoTo')fail('ACTIVE_CONTENT');
   let textChars=0,operators=0;
   for(let number=1;number<=pages;number++){
    const page=await pdf.getPage(number);if(await page.getJSActions())fail('ACTIVE_CONTENT');
    const annotations=await page.getAnnotations();if(annotations.some(a=>a.jsActions||a.file||[17,18,19,20,21,25].includes(a.annotationType)))fail('ACTIVE_CONTENT');
    const ops=await page.getOperatorList();operators+=ops.fnArray.length;if(operators>300000)fail('FORMAT_LIMIT');
    const text=(await page.getTextContent()).items.filter(i=>'str'in i).map(i=>i.str+(i.hasEOL?'\n':' ')).join('').trim();textChars+=text.length;if(textChars>1000000)fail('FORMAT_LIMIT');
    const remaining=12000-fragments.reduce((n,f)=>n+f.text.length,0);if(text&&remaining>0)fragments.push({page:number,text:text.slice(0,remaining)});
    if(number===1){const original=page.getViewport({scale:1});if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0)fail('FORMAT_LIMIT');const scale=Math.min(1000/original.width,1400/original.height,1.5),viewport=page.getViewport({scale});const target=new CanvasFactory().create(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:target.context,canvas:target.canvas,viewport}).promise;preview=await sharp(target.canvas.toBuffer('image/png')).png({palette:true,colours:128,compressionLevel:9}).toBuffer();}
    page.cleanup();
   }
   parser='pdfjs-'+pdfjs.version;
  }finally{await task.destroy();}
 }else{
  const image=sharp(data,{limitInputPixels:16_000_000,failOn:'warning',sequentialRead:true});const info=await image.metadata();
  const allowed={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp','image/tiff':'tiff'};
  if(info.format!==allowed[input.mime]||!info.width||!info.height||info.width*info.height>16_000_000||(info.pages??1)>20)fail('FORMAT_LIMIT');
  pages=info.pages??1;for(let page=1;page<pages;page++)await sharp(data,{page,limitInputPixels:16_000_000,failOn:'warning'}).raw().toBuffer();preview=await image.rotate().resize({width:1000,height:1400,fit:'inside',withoutEnlargement:true}).png({palette:true,colours:128,compressionLevel:9}).toBuffer();parser='sharp-full-decode';
 }
 if(!preview||preview.length>2*1024*1024)fail('PREVIEW_LIMIT');
 return {passed:true,parser,pages,fragments,antivirus:'not-configured',preview:{mimeType:'image/png',sha256:hash(preview),bytes:preview.length,base64:preview.toString('base64')}};
}
async function spreadsheet(input){
 const data=Buffer.from(input.base64,'base64');if(data.length<1||data.length>2*1024*1024)fail('FORMAT_LIMIT');
 if(input.format==='csv'){try{new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{fail('INVALID_ENCODING');}if(data.includes(0))fail('INVALID_ENCODING');}
 else if(data.subarray(0,2).toString()!=='PK')fail('FORMAT_MISMATCH');
 const XLSX=await import('@e965/xlsx');const wb=XLSX.read(input.format==='csv'?new TextDecoder('utf-8',{fatal:true}).decode(data):data,{type:input.format==='csv'?'string':'buffer',raw:true,cellNF:true,cellText:true,cellFormula:true,bookVBA:false,bookFiles:true,sheetRows:10001});
 if(input.format!=='csv'&&!wb.keys?.includes(input.format==='xlsb'?'xl/workbook.bin':'xl/workbook.xml'))fail('FORMAT_MISMATCH');
 if(wb.SheetNames.length>20)fail('FORMAT_LIMIT');
 const date1904=!!wb.Workbook?.WBProps?.date1904,sheets=[];let cellCount=0,characters=0;
 for(const name of wb.SheetNames){
  const sheet=wb.Sheets[name],range=XLSX.utils.decode_range(sheet['!ref']??'A1:A1');if(range.e.r>=10000||range.e.c>=50)fail('FORMAT_LIMIT');const rows=[];
  for(let r=range.s.r;r<=range.e.r;r++){
   const cells=[];let nonEmpty=false;
   for(let c=0;c<=range.e.c;c++){
    const cell=sheet[XLSX.utils.encode_cell({r,c})];if(!cell){cells.push(null);continue;}
    cellCount++;if(cellCount>200000)fail('FORMAT_LIMIT');
    const raw=cell.v??null,display=cell.w??String(raw??'');characters+=display.length;if(display.length>10000||characters>2*1024*1024)fail('FORMAT_LIMIT');
    if(raw!==null&&raw!=='')nonEmpty=true;
    let dateCandidate=null,dateIssue=null;
    if(typeof raw==='number'&&cell.z&&XLSX.SSF.is_date(cell.z)){
     if(!date1904&&Math.floor(raw)===60)dateIssue='EXCEL_1900_LEAP_DAY';else{const p=XLSX.SSF.parse_date_code(raw,{date1904});if(p&&p.y>=1&&p.y<=2100)dateCandidate={year:p.y,month:p.m,day:p.d};}
    }
    cells.push({type:cell.t??'unknown',raw,display,format:cell.z??null,formula:cell.f??null,dateCandidate,dateIssue});
   }
   if(nonEmpty)rows.push({row:r+1,cells});
  }
  sheets.push({name,nonEmptyRows:rows.length,rows});
 }
 return {format:input.format,sourceSha256:hash(data),date1904,sheets,cellCount,limitations:['Rows are not unique funds.','Formulas and macros are not executed.','Physical row numbers are provenance, not stable document identifiers.']};
}
try{
 const input=JSON.parse(Buffer.concat(parts).toString('utf8'));const result=input.mode==='spreadsheet'?await spreadsheet(input):await inspect(input);
 const output=JSON.stringify(result);if(Buffer.byteLength(output)>16*1024*1024)fail('RESULT_LIMIT');process.stdout.write(output);
}catch(error){process.stdout.write(JSON.stringify({passed:false,error:typeof error?.safeCode==='string'?error.safeCode:'FORMAT_PARSE_FAILED'}));process.exitCode=1;}
