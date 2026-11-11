'use client';
import Link from 'next/link';
import {Fragment,useEffect,useState} from 'react';
import type {Explanation,MaterialKey,MaterialRef} from '@/contracts/discovery';
import {apiGet,apiSend} from '@/lib/api';
import {useI18n} from '@/lib/lang';
import {materialLink,sourceFileLink} from '@/lib/discovery-links';
import {DemoBadge,ErrorNotice,Loading} from './ui';

export function MaterialCards({items}:{items:MaterialRef[]}){
 const {t}=useI18n();return <ul className="result-list grid-cards">{items.map(item=><li key={item.kind+item.id} className="card card-flat stack">
  <DemoBadge show={item.isDemo}/><h3><Link href={materialLink(item)} lang={item.contentLocale}>{item.title}</Link></h3>
  {item.translationStatus==='original'&&<p className="small muted">{t('Показан оригинал: перевод не опубликован.')}</p>}
  {item.reason.code!=='editorial'&&item.reason.evidence.length>0&&<details className="small"><summary>{item.reason.text}</summary><ul>{item.reason.evidence.map(s=><li key={s.kind+s.id+s.locale}><Link href={materialLink(s)} lang={s.locale}>{s.title}</Link></li>)}</ul></details>}
 </li>)}</ul>;
}
// Both work for archive documents and CMS materials (R-B03 shared endpoints); old document URLs stay valid.
const materialPath=(documentId:string|undefined,material:MaterialKey|undefined,action:'related'|'explanation')=>material?`/discovery/materials/${material.kind}/${encodeURIComponent(material.id)}/${action}`:`/documents/${encodeURIComponent(documentId??'')}/${action}`;
export function RelatedMaterials({documentId,material}:{documentId?:string;material?:MaterialKey}){
 const {lang,t}=useI18n();const [items,setItems]=useState<MaterialRef[]|null>(null),[error,setError]=useState<unknown>(null),[attempt,retry]=useState(0);const path=materialPath(documentId,material,'related');
 useEffect(()=>{const abort=new AbortController();setItems(null);setError(null);apiGet<{items:MaterialRef[]}>(`${path}?locale=${lang}`,abort.signal).then(r=>setItems(r.items),e=>{if(e.name!=='AbortError')setError(e);});return ()=>abort.abort();},[path,lang,attempt]);
 return <section className="stack" aria-label={t('Связанные материалы')}><h2>{t('Связанные материалы')}</h2>{error?<ErrorNotice error={error} onRetry={()=>retry(a=>a+1)}/>:!items?<Loading rows={1}/>:items.length?<MaterialCards items={items}/>:<p className="muted">{t('Связанные открытые материалы пока не найдены.')}</p>}</section>;
}
export function ExplainDocument({documentId,material}:{documentId?:string;material?:MaterialKey}){
 const {t,lang}=useI18n();const [data,setData]=useState<Explanation|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);const path=materialPath(documentId,material,'explanation');
 useEffect(()=>{setOpen(false);setData(null);setError(null);},[path,lang]);
 useEffect(()=>{if(!open)return;const abort=new AbortController();setBusy(true);setError(null);apiSend<Explanation>(path,'POST',{locale:lang},{},abort.signal).then(r=>{setData(r);setBusy(false);},e=>{if(e.name!=='AbortError'){setError(e);setBusy(false);}});return ()=>abort.abort();},[open,path,lang]);
 return <section className="panel stack" aria-label={t('Понятнее о документе')}><div className="row spread"><h2>{t(material?.kind==='cms'?'Понятнее о материале':'Понятнее о документе')}</h2><button className="btn btn-secondary" type="button" aria-expanded={open} aria-controls="document-explanation" onClick={()=>setOpen(v=>!v)}>{t(open?'Закрыть':'Показать выдержки и термины')}</button></div>
 {open&&<div id="document-explanation" className="explanation-body stack" tabIndex={0}>{busy?<Loading rows={1}/>:error?<ErrorNotice error={error} onRetry={()=>{setOpen(false);setTimeout(()=>setOpen(true),0);}}/>:data&&<>
  {data.status==='ready'?<><p className="small muted">{t(data.ocr?.used?'Автоматическое распознавание может содержать ошибки. Сравните текст с изображением; исходный документ не изменён.':'Точные выдержки и словарь. Сверяйте со сканом.')}</p>{data.citations.map((c,i)=><figure key={i} className="stack"><blockquote lang={c.source.locale}>{c.quote}</blockquote><figcaption className="small"><a href={sourceFileLink(c.source)} target="_blank" rel="noopener noreferrer">{t('Сверить с оригиналом')}{c.source.fragment?.page?` · ${t('Страница')} ${c.source.fragment.page}`:''}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a></figcaption></figure>)}{data.terms.length>0&&<dl className="props">{data.terms.map(term=><Fragment key={term.term}><dt>{term.term}</dt><dd>{term.explanation}</dd></Fragment>)}</dl>}</>:<p role="status">{t(data.status==='no_text'?'Для этой копии нет читаемого текста.':data.status==='low_quality'?'Качество распознавания недостаточно. Посмотрите оригинал.':'Для этого текста объяснение пока недоступно.')}</p>}
  {data.limitations.length>0&&<details><summary>{t('Об источнике и ограничениях')}</summary><ul>{data.limitations.map(s=><li key={s}>{s}</li>)}</ul></details>}
 </>}</div>}</section>;
}
