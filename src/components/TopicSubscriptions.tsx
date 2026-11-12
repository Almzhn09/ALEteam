'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import type {CursorPage,TopicSubscription,TopicNotice,SubscriptionInput} from '@/contracts/discovery';
import type {ContentLocale} from '@/contracts/cms';
import {apiGet,apiSend} from '@/lib/api';
import {useSession} from '@/lib/session';
import {useI18n} from '@/lib/lang';
import {materialLink} from '@/lib/discovery-links';
import {ErrorNotice,Loading} from './ui';
export function FollowTopic({selection,contentLocale}:{selection:Omit<SubscriptionInput,'locale'>;contentLocale?:ContentLocale}){
 const {user,state}=useSession(),{lang,t}=useI18n(),path=usePathname(),params=useSearchParams();const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);const key=JSON.stringify(selection);
 const locale=contentLocale??lang;
 useEffect(()=>{setSaved(false);setError(null);},[key,user?.id,locale]);
 async function follow(){setBusy(true);setError(null);try{await apiSend('/me/topic-subscriptions','POST',{...selection,locale});setSaved(true);}catch(e){setError(e);}finally{setBusy(false);}}
 if(state.status==='loading')return null;
 return <div className="stack">{user?<div className="row"><button className="btn btn-secondary" type="button" disabled={busy||saved} onClick={()=>void follow()}>{t(saved?'Вы следите за темой':'Следить за темой')}</button>{saved&&<Link href="/me#topic-subscriptions">{t('Мои подписки')}</Link>}</div>:<Link className="btn btn-secondary" href={'/login?returnTo='+encodeURIComponent(path+(params.size?'?'+params:''))}>{t('Войти и следить за темой')}</Link>}{!!error&&<ErrorNotice error={error}/>}</div>;
}
export function TopicSubscriptions(){
 const {user}=useSession(),{lang,t,formatDate}=useI18n();const [data,setData]=useState<{owner:string;subscriptions:CursorPage<TopicSubscription>;notices:CursorPage<TopicNotice>}|null>(null),[error,setError]=useState<unknown>(null),[attempt,refresh]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!user){setData(null);return;}const abort=new AbortController();setData(null);setError(null);Promise.all([apiGet<CursorPage<TopicSubscription>>('/me/topic-subscriptions?limit=20&locale='+lang,abort.signal),apiGet<CursorPage<TopicNotice>>('/me/topic-notifications?limit=20&locale='+lang,abort.signal)]).then(([subscriptions,notices])=>setData({owner:user.id,subscriptions,notices}),e=>{if(e.name!=='AbortError')setError(e);});return ()=>abort.abort();},[user?.id,lang,attempt]);
 async function act(path:string,method:'PATCH'|'DELETE'){setBusy(true);setError(null);try{await apiSend(path,method,{});refresh(a=>a+1);}catch(e){setError(e);}finally{setBusy(false);}}
 async function more(kind:'subscriptions'|'notices'){if(!data)return;setBusy(true);try{const cursor=data[kind].nextCursor;if(!cursor)return;const route=kind==='subscriptions'?'topic-subscriptions':'topic-notifications';const page=await apiGet<CursorPage<TopicSubscription|TopicNotice>>(`/me/${route}?limit=20&locale=${lang}&cursor=${encodeURIComponent(cursor)}`);setData(old=>old&&old.owner===user?.id?{...old,[kind]:{...page,items:[...old[kind].items,...page.items]}} as typeof old:old);}catch(e){setError(e);}finally{setBusy(false);}}
 if(!user)return null;return <section id="topic-subscriptions" className="panel stack"><h2>{t('Мои подписки')}</h2><p className="small muted">{t('Новые материалы появляются здесь после публикации. Письма и push не отправляются.')}</p>{!!error&&<ErrorNotice error={error} onRetry={()=>refresh(a=>a+1)}/>}{!data||data.owner!==user.id?<Loading rows={1}/>:<>
  {data.subscriptions.items.length?<ul className="result-list">{data.subscriptions.items.map(s=><li key={s.id} className="card card-flat stack"><span>{s.filters?.q||s.filters?.locality||s.filters?.reference||t('Подборка по выбранным фильтрам')} · {s.locale.toUpperCase()}</span>{s.filters&&<Link href={'/catalog?'+new URLSearchParams({...Object.fromEntries(Object.entries(s.filters).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])),contentLang:s.locale})}>{t('Открыть сохранённый поиск')}</Link>}{s.placeId&&<Link href={'/places?placeId='+encodeURIComponent(s.placeId)}>{t('История места')}</Link>}<button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void act('/me/topic-subscriptions/'+s.id,'DELETE')}>{t('Отписаться')}</button></li>)}</ul>:<p>{t('Подписок пока нет. Выберите тему в каталоге или истории места.')}</p>}
  {data.subscriptions.nextCursor&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void more('subscriptions')}>{t('Показать ещё подписки')}</button>}
  <h3>{t('Новые материалы по подпискам')}</h3>{data.notices.items.length?<ul className="result-list">{data.notices.items.map(n=><li key={n.id} className="card card-flat stack"><Link href={materialLink(n.material)} lang={n.material.contentLocale}>{n.material.title}</Link><span className="small muted">{formatDate(n.createdAt)}</span>{!n.readAt&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void act('/me/topic-notifications/'+n.id,'PATCH')}>{t('Отметить прочитанным')}</button>}</li>)}</ul>:<p>{t('Новых опубликованных совпадений пока нет.')}</p>}
  {data.notices.nextCursor&&<button className="btn btn-secondary" disabled={busy} onClick={()=>void more('notices')}>{t('Показать ещё уведомления')}</button>}
 </>}</section>;
}
