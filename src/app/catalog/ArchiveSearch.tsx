'use client';
import Link from 'next/link';
import {useSearchParams,useRouter} from 'next/navigation';
import {useEffect,useState,type FormEvent} from 'react';
import type {SearchHit,SearchResult,FundDirectoryEntry,NewspaperEntry} from '@/contracts/real-content';
import {apiGet} from '@/lib/api';
import {useI18n} from '@/lib/lang';
import {materialLink} from '@/lib/discovery-links';
import {ErrorNotice,Loading,Pagination} from '@/components/ui';
import {FollowTopic} from '@/components/TopicSubscriptions';
import {Catalog} from './Catalog';

type Scope='all'|'cms'|'fund'|'newspaper'|'document';
const scopes: {id:Scope;label:string}[]=[{id:'all',label:'Всё'},{id:'cms',label:'Материалы'},{id:'fund',label:'Фонды'},{id:'newspaper',label:'Газеты'},{id:'document',label:'Архивные документы'}];
function DirectoryCard({item,detail=false}:{item:FundDirectoryEntry|NewspaperEntry;detail?:boolean}){
 const {t}=useI18n();
 return <article className="card card-flat search-card stack">
  <span className="eyebrow">{t(item.kind==='fund'?'Фондовый справочник':'Газетный справочник')}</span>
  <h2><Link href={'/catalog?scope='+item.kind+'&entry='+encodeURIComponent(item.id)}>{item.kind==='fund'?`${t('Фонд')} ${item.number}`:item.title}</Link></h2>
  {item.kind==='fund'?<><p lang="ru">{item.names[0]?.name}</p><details open={detail}><summary>{t('Названия и периоды из источника')}</summary><ol className="directory-names" lang="ru">{item.names.map((n,i)=><li key={i}><span>{n.name}</span>{n.periodOriginal&&<span className="small muted">{n.periodOriginal}</span>}</li>)}</ol></details></>:<dl className="props"><dt>{t('Годы хранения')}</dt><dd>{item.yearsOriginal||'—'}</dd><dt>{t('Издатель')}</dt><dd>{item.publisherOriginal||'—'}</dd><dt>{t('Объём по источнику')}</dt><dd>{item.volumesOriginal||'—'}</dd>{item.notes&&<><dt>{t('Примечание')}</dt><dd>{item.notes}</dd></>}</dl>}
  <details className="source-details" open={detail}><summary>{t('Источник и версия')}</summary><p lang="ru">{item.source.title}</p><p className="small muted">{item.source.edition}</p>{item.source.notes&&<p className="small muted">{item.source.notes}</p>}{item.source.holder&&<p>{item.source.holder}</p>}</details>
 </article>;
}
export function ArchiveSearch(){
 const params=useSearchParams(),router=useRouter(),{t,lang}=useI18n();
 const scope:Scope=scopes.some(s=>s.id===params.get('scope'))?params.get('scope') as Scope:'all';
 const q=(params.get('q')??'').trim().slice(0,100),entry=/^[a-zA-Z0-9_-]{1,80}$/.test(params.get('entry')??'')?params.get('entry')??'':'';
 const sort=params.get('sort')==='title'?'title':'source',number=(params.get('number')??'').slice(0,100);
 const directory=scope==='fund'||scope==='newspaper';
 const page=/^[1-9]\d{0,3}$/.test(params.get('page')??'')?Number(params.get('page')):1;
 const legacy=params.get('advanced')==='1'||['fundId','type','reference','fundNumber','inventoryNumber','caseNumber','locality','placeId','nameMode'].some(k=>params.has(k));
 const [draft,setDraft]=useState(q),[numberDraft,setNumberDraft]=useState(number),[data,setData]=useState<SearchResult|null>(null),[single,setSingle]=useState<FundDirectoryEntry|NewspaperEntry|null>(null),[error,setError]=useState<unknown>(null),[attempt,retry]=useState(0);
 const query=(next:Record<string,string|number>={})=>'/catalog?'+new URLSearchParams({...{scope,q,...(number?{number}:{}),...(sort==='title'?{sort}:{}),...(page>1?{page:String(page)}:{})},...Object.fromEntries(Object.entries(next).map(([k,v])=>[k,String(v)]))});
 useEffect(()=>setDraft(q),[q]);
 useEffect(()=>setNumberDraft(number),[number]);
 useEffect(()=>{if(legacy)return;const abort=new AbortController();setData(null);setSingle(null);setError(null);
  const directoryParams=new URLSearchParams({q,page:String(page),pageSize:'10',sort,...(scope==='fund'&&number?{number}:{})});
  const request=entry&&directory?'/directories/'+(scope==='fund'?'funds':'newspapers')+'/'+entry:directory?'/directories/'+(scope==='fund'?'funds':'newspapers')+'?'+directoryParams:'/search?'+new URLSearchParams({q,scope,locale:lang,page:String(page),pageSize:'10'});
  type DirectoryPage={items:(FundDirectoryEntry|NewspaperEntry)[];total:number;page:number;pageSize:number};
  apiGet<SearchResult|DirectoryPage|{item:FundDirectoryEntry|NewspaperEntry}>(request,abort.signal).then(r=>{if('item'in r)setSingle(r.item);else setData('counts'in r?r:{...r,locale:lang,counts:{materials:0,funds:scope==='fund'?r.total:0,newspapers:scope==='newspaper'?r.total:0}});},e=>{if(e.name!=='AbortError')setError(e);});return()=>abort.abort();
 },[q,scope,page,entry,lang,attempt,legacy,sort,number,directory]);
 function submit(e:FormEvent){e.preventDefault();router.push(query({q:draft.trim(),number:numberDraft.trim(),page:1,entry:''}));}
 const navigateScope=(s:Scope)=>query({scope:s,page:1,entry:'',number:''});
 return <div className="stack archive-search">
  <nav className="search-scopes" aria-label={t('Где искать')}>{scopes.map(s=><Link key={s.id} href={navigateScope(s.id)} aria-current={scope===s.id&&!legacy?'page':undefined}>{t(s.label)}</Link>)}</nav>
  {legacy?<><Link href={query({scope:'all',advanced:'',page:1})}>{t('Вернуться к общему поиску')}</Link><Catalog/></>:<>
  <form className="archive-search-form" role="search" onSubmit={submit}><label className="visually-hidden" htmlFor="archive-query">{t('Что вы ищете')}</label><input id="archive-query" className="input" type="search" maxLength={100} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={t('Название, тема или номер фонда')}/><button className="btn btn-primary" type="submit">{t('Найти')}</button>{scope==='fund'&&<div className="field exact-number"><label htmlFor="fund-exact-number">{t('Точный номер фонда')}</label><input id="fund-exact-number" className="input" maxLength={100} value={numberDraft} onChange={e=>setNumberDraft(e.target.value)} placeholder="Р-1 ч.с."/></div>}</form>
  <div className="row spread"><p className="small muted search-hint">{t(scope==='fund'?'Названия и номера фондов из справочника. Цифровые копии дел здесь не представлены.':scope==='newspaper'?'Сведения о хранении газет. Годы и объёмы приведены как в источнике.':'Ищите публикации, фондовые названия и сведения о газетах в одном месте.')}</p>{scope==='document'&&<Link href="/catalog?advanced=1">{t('Расширенный поиск')}</Link>}</div>
  {error?<ErrorNotice error={error} onRetry={()=>retry(v=>v+1)}/>:single?<><Link href={navigateScope(scope)}>← {t('К результатам поиска')}</Link><DirectoryCard item={single} detail/></>:!data?<Loading label={t('Поиск…')} rows={2}/>:<>
   <div className="results-head"><p role="status">{t('Найдено:')} <strong>{data.total}</strong>{q&&<> · «{q}»</>}</p>{directory&&<div className="row"><label htmlFor="directory-sort" className="small">{t('Сортировка')}</label><select id="directory-sort" className="select" value={sort} onChange={e=>router.push(query({sort:e.target.value,page:1}))}><option value="source">{t('В порядке источника')}</option><option value="title">{t('По названию')}</option></select><a className="btn btn-secondary" href={'/api/directories/'+(scope==='fund'?'funds':'newspapers')+'/export?'+new URLSearchParams({q,sort,...(scope==='fund'&&number?{number}:{})})} download>{t('Скачать справочник')}</a></div>}</div>
   {data.items.length?<ul className="result-list">{data.items.map((hit:SearchHit)=><li key={hit.kind+(hit.kind==='material'?hit.material.id:hit.id)}>{hit.kind==='material'?<article className="card card-flat search-card stack"><span className="eyebrow">{t(hit.material.kind==='cms'?'Материал архива':'Архивный документ')}</span><h2><Link href={materialLink(hit.material)} lang={hit.material.contentLocale}>{hit.material.title}</Link></h2><p className="muted clamp-3" lang={hit.material.contentLocale}>{hit.snippet}</p>{hit.material.translationStatus==='original'&&<span className="small muted">{t('Материал показан на языке источника.')}</span>}</article>:<DirectoryCard item={hit}/>}</li>)}</ul>:<div className="empty card card-flat"><h2>{t('Ничего не найдено')}</h2><p className="muted">{t('Попробуйте сократить запрос или выбрать другой раздел.')}</p><Link className="btn btn-secondary" href="/catalog">{t('Все материалы')}</Link></div>}
   <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={n=>query({page:n})}/>
   {q&&['all','cms','document'].includes(scope)&&<div className="panel stack"><h2>{t('Не пропустить новое')}</h2><FollowTopic contentLocale={lang} selection={{filters:{q,...(scope==='cms'||scope==='document'?{scope}:{})}}}/></div>}
  </>}
  </>}
 </div>;
}
