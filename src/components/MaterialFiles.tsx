'use client';
import {useEffect,useRef,useState} from 'react';
import type {AttachmentRef} from '@/contracts/real-content';
import {apiGet} from '@/lib/api';
import {useI18n} from '@/lib/lang';
import {ErrorNotice,Loading} from './ui';
import {ApiClientError} from '@/lib/api';
// No text or no access (404/403/410) will not change on retry; only transient failures offer it.
const finalError=(e:unknown)=>e instanceof ApiClientError&&[403,404,410].includes(e.status);
import {PdfViewer} from './PdfViewer';
import {SafeImage} from './SafeImage';
interface Fragment {text:string;page?:number;paragraph?:number}
interface FileText {text:string;isOcr:boolean;fragments:Fragment[];nextOffset?:number|null;totalCharacters?:number}
const originalReaderHref=(href:string,offset?:number)=>{const base=href.replace(/^\/api/,'');return `${base}${base.includes('?')?'&':'?'}reader=1${offset===undefined?'':`&offset=${offset}`}`;};
const fragmentLabel=(f:Fragment,t:(k:string)=>string)=>f.page?`${t('Страница')} ${f.page}`:f.paragraph?`${t('Абзац')} ${f.paragraph}`:'';
function ReadOriginal({file,initiallyOpen=false}:{file:AttachmentRef;initiallyOpen?:boolean}){
 const {t}=useI18n();const [open,setOpen]=useState(initiallyOpen),[data,setData]=useState<FileText|null>(null),[error,setError]=useState<unknown>(null),[attempt,retry]=useState(0);
 // Long originals arrive in parts (nextOffset); each part is appended so the whole text can be read here.
 const [more,setMore]=useState<{loading:boolean;error:unknown}>({loading:false,error:null});
 const firstNew=useRef<HTMLDivElement>(null),focusIndex=useRef<number|null>(null);
 useEffect(()=>{setData(null);setError(null);setMore({loading:false,error:null});if(!open)return;const abort=new AbortController();apiGet<{item:FileText}>(originalReaderHref(file.textHref),abort.signal).then(r=>setData(r.item),e=>{if(e.name!=='AbortError')setError(e);});return()=>abort.abort();},[open,file.textHref,attempt]);
 useEffect(()=>{if(focusIndex.current!==null){firstNew.current?.focus();focusIndex.current=null;}},[data]);
 async function loadMore(){
  if(!data||data.nextOffset==null||more.loading)return;
  setMore({loading:true,error:null});
  try{const r=await apiGet<{item:FileText}>(originalReaderHref(file.textHref,data.nextOffset));
   focusIndex.current=data.fragments.length;
   setData({...r.item,fragments:[...data.fragments,...r.item.fragments],isOcr:data.isOcr||r.item.isOcr});setMore({loading:false,error:null});}
  catch(e){setMore({loading:false,error:e});}
 }
 const shown=data?.fragments.reduce((n,f)=>n+f.text.length,0)??0;
 return <details className="original-text" open={initiallyOpen||undefined} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t('Читать документ')}</summary>{open&&(error?<ErrorNotice error={error} onRetry={finalError(error)?undefined:()=>retry(v=>v+1)}/>:!data?<Loading rows={1}/>:<div className="stack">{data.isOcr&&<p className="small muted">{t('Автоматическое распознавание может содержать ошибки. Сравните текст с изображением; исходный документ не изменён.')}</p>}<div className="original-fragments" lang={file.locale}>{!data.fragments.some(fragment=>fragment.text.trim())&&<p className="muted" role="status">{t('Текст не распознан. Просмотрите оригинал документа.')}</p>}{data.fragments.map((fragment,i)=>{const label=fragmentLabel(fragment,t);const repeat=i>0&&label&&label===fragmentLabel(data.fragments[i-1],t);return <div className="source-fragment" key={i} ref={i===focusIndex.current?firstNew:undefined} tabIndex={i===focusIndex.current?-1:undefined}>{!repeat&&<span className="small muted">{label}</span>}<p className="pre-wrap">{fragment.text}</p></div>;})}</div>
  {data.nextOffset!=null&&<div className="row original-more">
   {more.error?<ErrorNotice error={more.error} onRetry={()=>void loadMore()}/>:<button type="button" className="btn btn-secondary" onClick={()=>void loadMore()} disabled={more.loading} aria-busy={more.loading}>{more.loading?t('Загрузка…'):t('Читать дальше')}</button>}
   {data.totalCharacters?<span className="small muted">{t('Показано')} {Math.min(100,Math.round(shown/data.totalCharacters*100))}%</span>:null}
  </div>}
 </div>)}</details>;
}
export function MaterialFiles({materialId,contentLocale,initialFiles}:{materialId:string;contentLocale:string;initialFiles?:AttachmentRef[]}){
 const {t}=useI18n();const [data,setData]=useState<AttachmentRef[]|null>(initialFiles??null),[error,setError]=useState<unknown>(null),[attempt,retry]=useState(0);
 useEffect(()=>{const abort=new AbortController();setData(initialFiles??null);setError(null);apiGet<{items:AttachmentRef[]}>(`/discovery/materials/cms/${encodeURIComponent(materialId)}/attachments?locale=${contentLocale}`,abort.signal).then(r=>setData(r.items),e=>{if(e.name!=='AbortError')setError(e);});return()=>abort.abort();},[materialId,contentLocale,attempt,initialFiles]);
 if(!error&&data?.length===0)return null;
 return <section id="material-originals" className="stack material-originals" aria-label={t('Оригиналы документов')}><h2>{t('Оригиналы документов')}</h2>{error?<ErrorNotice error={error} onRetry={()=>retry(v=>v+1)}/>:!data?<Loading rows={1}/>:<ul className="result-list">{data.filter(f=>f.variant==='master').map((file,index,masters)=>{const firstReadable=masters.find(m=>!m.mimeType.startsWith('image/')&&m.mimeType!=='application/pdf')?.id===file.id;const preview=data.find(f=>f.parentId===file.id);return <li key={file.id} className="card card-flat stack"><div className="row spread"><h3 lang={file.locale}>{file.name}</h3><span className="small muted">{file.mimeType.split('/').at(-1)==='pdf'?'PDF':file.name.split('.').at(-1)?.toUpperCase()} · {new Intl.NumberFormat().format(Math.ceil(file.bytes/1024))} KB</span></div>
  {file.mimeType.startsWith('image/')?<details><summary>{t('Просмотреть изображение')}</summary><SafeImage className="source-preview" src={file.href} alt={file.source.label} loading="lazy" decoding="async"/></details>:preview&&<details><summary>{t('Посмотреть страницу источника')}{preview.source.page?` · ${t('Страница')} ${preview.source.page}`:''}</summary><SafeImage className="source-preview" src={preview.href} alt={file.source.label} loading="lazy" decoding="async"/></details>}
  <div className="row">{file.downloadable&&<a className="btn btn-secondary" href={file.href+'?download=1'}>{t('Скачать оригинал')}</a>}{file.mimeType==='application/pdf'&&<PdfViewer file={file} title={file.source.label} href={file.href}/>}</div>
  {!file.mimeType.startsWith('image/')&&<ReadOriginal file={file} initiallyOpen={firstReadable}/>}
 </li>;})}</ul>}</section>;
}
