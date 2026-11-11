'use client';
import {useEffect,useState} from 'react';
import type {AttachmentRef} from '@/contracts/real-content';
import {apiGet} from '@/lib/api';
import {useI18n} from '@/lib/lang';
import {ErrorNotice,Loading} from './ui';
import {PdfViewer} from './PdfViewer';
interface FileText {text:string;isOcr:boolean;fragments:{text:string;page?:number;paragraph?:number}[]}
function ReadOriginal({file}:{file:AttachmentRef}){
 const {t}=useI18n();const [open,setOpen]=useState(false),[data,setData]=useState<FileText|null>(null),[error,setError]=useState<unknown>(null),[attempt,retry]=useState(0);
 useEffect(()=>{setData(null);setError(null);if(!open)return;const abort=new AbortController();apiGet<{item:FileText}>(file.textHref.replace(/^\/api/,''),abort.signal).then(r=>setData(r.item),e=>{if(e.name!=='AbortError')setError(e);});return()=>abort.abort();},[open,file.textHref,attempt]);
 return <details className="original-text" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t('Читать текст оригинала')}</summary>{open&&(error?<ErrorNotice error={error} onRetry={()=>retry(v=>v+1)}/>:!data?<Loading rows={1}/>:<div className="stack">{data.isOcr&&<p className="small muted">{t('Автоматическое распознавание может содержать ошибки. Сравните текст с изображением; исходный документ не изменён.')}</p>}<div className="original-fragments" lang={file.locale}>{data.fragments.map((fragment,i)=><div className="source-fragment" key={i}><span className="small muted">{fragment.page?`${t('Страница')} ${fragment.page}`:fragment.paragraph?`${t('Абзац')} ${fragment.paragraph}`:''}</span><p className="pre-wrap">{fragment.text}</p></div>)}</div></div>)}</details>;
}
export function MaterialFiles({materialId,contentLocale,initialFiles}:{materialId:string;contentLocale:string;initialFiles?:AttachmentRef[]}){
 const {t}=useI18n();const [data,setData]=useState<AttachmentRef[]|null>(initialFiles??null),[error,setError]=useState<unknown>(null),[attempt,retry]=useState(0);
 useEffect(()=>{const abort=new AbortController();setData(initialFiles??null);setError(null);apiGet<{items:AttachmentRef[]}>(`/discovery/materials/cms/${encodeURIComponent(materialId)}/attachments?locale=${contentLocale}`,abort.signal).then(r=>setData(r.items),e=>{if(e.name!=='AbortError')setError(e);});return()=>abort.abort();},[materialId,contentLocale,attempt,initialFiles]);
 if(data?.length===0)return null;
 return <section id="material-originals" className="stack material-originals" aria-label={t('Оригиналы документов')}><h2>{t('Оригиналы документов')}</h2>{error?<ErrorNotice error={error} onRetry={()=>retry(v=>v+1)}/>:!data?<Loading rows={1}/>:<ul className="result-list">{data.filter(f=>f.variant==='master').map(file=>{const preview=data.find(f=>f.parentId===file.id);return <li key={file.id} className="card card-flat stack"><div className="row spread"><h3 lang={file.locale}>{file.name}</h3><span className="small muted">{file.mimeType.split('/').at(-1)==='pdf'?'PDF':file.name.split('.').at(-1)?.toUpperCase()} · {new Intl.NumberFormat().format(Math.ceil(file.bytes/1024))} KB</span></div>
  {file.mimeType.startsWith('image/')?<details><summary>{t('Просмотреть изображение')}</summary><img className="source-preview" src={file.href} alt={file.source.label} loading="lazy" decoding="async"/></details>:preview&&<details><summary>{t('Посмотреть страницу источника')}{preview.source.page?` · ${t('Страница')} ${preview.source.page}`:''}</summary><img className="source-preview" src={preview.href} alt={file.source.label} loading="lazy" decoding="async"/></details>}
  <div className="row">{file.downloadable&&<a className="btn btn-secondary" href={file.href+'?download=1'}>{t('Скачать оригинал')}</a>}{file.mimeType==='application/pdf'&&<PdfViewer file={file} title={file.source.label} href={file.href}/>}</div>
  {!file.mimeType.startsWith('image/')&&<ReadOriginal file={file}/>}
 </li>;})}</ul>}</section>;
}
