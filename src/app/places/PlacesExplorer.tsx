'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import type {CursorPage,HistoricalDate,HistoryEntry,PlaceRef} from '@/contracts/discovery';
import {apiGet} from '@/lib/api';
import {useI18n} from '@/lib/lang';
import {materialLink} from '@/lib/discovery-links';
import {Breadcrumbs,DemoBadge,ErrorNotice,Loading} from '@/components/ui';
import {MaterialCards} from '@/components/DiscoveryMaterials';
import {FollowTopic} from '@/components/TopicSubscriptions';
export function historicalDateLabel(d:HistoricalDate,unknown:string){
 if(d.datePrecision==='unknown')return unknown;if(d.datePrecision==='range')return d.yearFrom+'–'+d.yearTo;
 const p=d.dateParts;if(!p)return unknown;return (p.day!==undefined?String(p.day).padStart(2,'0')+'.':'')+(p.month!==undefined?String(p.month).padStart(2,'0')+'.':'')+p.year;
}
export function PlacesExplorer(){
 const {t,lang}=useI18n(),params=useSearchParams(),router=useRouter();const selected=params.get('placeId')??'';
 const [places,setPlaces]=useState<CursorPage<PlaceRef>|null>(null),[history,setHistory]=useState<(CursorPage<HistoryEntry>&{place:PlaceRef})|null>(null),[error,setError]=useState<unknown>(null),[attempt,retry]=useState(0),[from,setFrom]=useState(''),[to,setTo]=useState(''),[period,setPeriod]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const abort=new AbortController();setPlaces(null);setError(null);apiGet<CursorPage<PlaceRef>>('/places?limit=20&locale='+lang,abort.signal).then(setPlaces,e=>{if(e.name!=='AbortError')setError(e);});return ()=>abort.abort();},[lang,attempt]);
 useEffect(()=>{setHistory(null);if(!selected)return;const abort=new AbortController();setError(null);apiGet<CursorPage<HistoryEntry>&{place:PlaceRef}>(`/places/${encodeURIComponent(selected)}/history?limit=20&locale=${lang}${period}`,abort.signal).then(setHistory,e=>{if(e.name!=='AbortError')setError(e);});return ()=>abort.abort();},[selected,lang,period,attempt]);
 async function more(kind:'places'|'history'){const data=kind==='places'?places:history;if(!data?.nextCursor)return;setBusy(true);setError(null);try{const route=kind==='places'?'/places':`/places/${encodeURIComponent(selected)}/history`;const page=await apiGet<CursorPage<PlaceRef|HistoryEntry>>(`${route}?limit=20&locale=${lang}${kind==='history'?period:''}&cursor=${encodeURIComponent(data.nextCursor)}`);if(kind==='places')setPlaces(old=>old?{...page,items:[...old.items,...page.items as PlaceRef[]]}:old);else setHistory(old=>old?{...old,...page,items:[...old.items,...page.items as HistoryEntry[]]}:old);}catch(e){setError(e);}finally{setBusy(false);}}
 return <div className="container page measure-narrow stack"><Breadcrumbs items={[{label:t('История места')}]}/><h1>{t('История места')}</h1><p className="lead">{t('Выберите город или район и проследите его историю по опубликованным источникам.')}</p>{!!error&&<ErrorNotice error={error} onRetry={()=>retry(a=>a+1)}/>}
 {!places?<Loading rows={1}/>:<><div className="field"><label htmlFor="history-place">{t('Место')}</label><select id="history-place" className="select" value={selected} onChange={e=>router.push('/places'+(e.target.value?'?placeId='+e.target.value:''))}><option value="">{t('Выберите место')}</option>{selected&&!places.items.some(p=>p.id===selected)&&history&&<option value={selected}>{history.place.name}</option>}{places.items.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>{!places.items.length&&<p className="muted">{t('Истории появятся после проверки и публикации источников.')}</p>}{places.nextCursor&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void more('places')}>{t('Показать ещё места')}</button>}</>}
 {selected&&(!history&&!error?<Loading rows={2}/>:history&&<section className="stack" aria-label={t('Хронология')}><div className="row"><h2 lang={history.place.contentLocale}>{history.place.name}</h2><DemoBadge show={history.place.isDemo}/></div>{history.place.translationStatus==='original'&&<p className="small muted">{t('Показан оригинал: перевод не опубликован.')}</p>}
 <p lang={history.place.contentLocale}>{history.place.description}</p><FollowTopic selection={{placeId:selected}}/>
 <form className="row" onSubmit={e=>{e.preventDefault();setPeriod((from?'&yearFrom='+from:'')+(to?'&yearTo='+to:''));}}><div className="field"><label htmlFor="history-from">{t('Год от')}</label><input id="history-from" className="input" type="number" min="1" max={to||2100} value={from} onChange={e=>setFrom(e.target.value)}/></div><div className="field"><label htmlFor="history-to">{t('Год до')}</label><input id="history-to" className="input" type="number" min={from||1} max="2100" value={to} onChange={e=>setTo(e.target.value)}/></div><button className="btn btn-secondary" type="submit">{t('Показать')}</button></form>
 {!history.items.length?<p>{t('Для выбранного периода опубликованных событий нет.')}</p>:<ol className="history-timeline result-list">{history.items.map(entry=><li key={entry.id} className="card stack"><strong>{historicalDateLabel(entry,t('Дата неизвестна'))}</strong><h3 lang={entry.contentLocale}>{entry.title}</h3>{entry.certainty==='approximate'&&<span className="badge badge-neutral">{t('Приблизительная датировка')}</span>}<p lang={entry.contentLocale}>{entry.body}</p>{entry.materials.length>0&&<MaterialCards items={entry.materials}/>}<details><summary>{t('Источники:')}</summary><ul>{entry.sources.map(s=><li key={s.id+s.locale}><Link href={materialLink(s)} lang={s.locale}>{s.title}</Link></li>)}</ul></details></li>)}</ol>}{history.nextCursor&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void more('history')}>{t('Показать ещё события')}</button>}
 </section>)}
 </div>;
}
