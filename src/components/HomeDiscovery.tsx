'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {CursorPage,DiscoveryHome,InterestSettings,MaterialRef} from '@/contracts/discovery';
import {apiGet,apiSend} from '@/lib/api';
import {useI18n} from '@/lib/lang';
import {useSession} from '@/lib/session';
import {MaterialCards} from './DiscoveryMaterials';
import {ErrorNotice,Loading} from './ui';
const PREF='archive-interests-v1',HISTORY='archive-continue-v1',HISTORY_ENABLED='archive-continue-enabled-v1';
interface Topic{id:string;title:string;contentLocale:string}
function storedTopics():{enabled:boolean;topicIds:string[]}{try{const p=JSON.parse(localStorage.getItem(PREF)??'null');if(typeof p?.enabled==='boolean'&&Array.isArray(p.topicIds)&&p.topicIds.length<=20&&p.topicIds.every((s:unknown)=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s)))return p;}catch{}return {enabled:false,topicIds:[]};}
function historyIds():string[]{try{const ids=JSON.parse(localStorage.getItem(HISTORY)??'[]');return Array.isArray(ids)?ids.filter(s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(s)).slice(0,3):[];}catch{return [];}}
export function RememberDocument({documentId}:{documentId:string}){
 useEffect(()=>{try{if(localStorage.getItem(HISTORY_ENABLED)==='1')localStorage.setItem(HISTORY,JSON.stringify([documentId,...historyIds().filter(id=>id!==documentId)].slice(0,3)));}catch{}},[documentId]);return null;
}
export function HomeDiscovery(){
 const {lang,t}=useI18n(),{user,state}=useSession();const [topics,setTopics]=useState<Topic[]>([]),[selected,setSelected]=useState<string[]>([]),[enabled,setEnabled]=useState(false),[saved,setSaved]=useState(false),[remember,setRemember]=useState(false),[recent,setRecent]=useState<MaterialRef[]>([]),[data,setData]=useState<DiscoveryHome|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false),[attempt,refresh]=useState(0);
 useEffect(()=>{if(state.status==='loading')return;const abort=new AbortController();setData(null);setError(null);setSaved(false);setSelected([]);setEnabled(false);setRecent([]);
  void(async()=>{try{
   const all:Topic[]=[];let cursor:string|null=null;do{const page:CursorPage<Topic>=await apiGet('/discovery/topics?locale='+lang+'&limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):''),abort.signal);all.push(...page.items);cursor=page.nextCursor;}while(cursor&&all.length<200);if(abort.signal.aborted)return;setTopics(all);
   const pref=user?(await apiGet<{item:InterestSettings}>('/me/interests',abort.signal)).item:storedTopics();const active='enabled' in pref?pref.enabled:pref.personalizationEnabled;const ids=pref.topicIds.filter(id=>all.some(topic=>topic.id===id));if(abort.signal.aborted)return;setSelected(ids);setEnabled(active);
   setData(await apiGet('/discovery/home?locale='+lang+'&limit=3'+(!user&&active&&ids.length?'&topicIds='+encodeURIComponent(ids.join(',')):''),abort.signal));
   const allowed=localStorage.getItem(HISTORY_ENABLED)==='1';setRemember(allowed);if(allowed){const recent=await Promise.all(historyIds().map(id=>apiGet<{item:MaterialRef}>(`/discovery/materials/document/${id}?locale=${lang}`,abort.signal).then(r=>r.item,()=>null)));if(!abort.signal.aborted)setRecent(recent.filter((r):r is MaterialRef=>!!r));}
  }catch(e){if(!abort.signal.aborted)setError(e);}})();return ()=>abort.abort();
 },[lang,user?.id,state.status,attempt]);
 async function save(clear=false){setBusy(true);setError(null);try{const ids=clear?[]:selected,active=clear?false:enabled;if(user)await apiSend('/me/interests','PUT',{topicIds:ids,personalizationEnabled:active,historyEnabled:false});else localStorage.setItem(PREF,JSON.stringify({enabled:active,topicIds:ids}));if(clear){localStorage.removeItem(HISTORY);localStorage.removeItem(HISTORY_ENABLED);setRemember(false);setRecent([]);}setData(await apiGet('/discovery/home?locale='+lang+'&limit=3'+(!user&&active&&ids.length?'&topicIds='+encodeURIComponent(ids.join(',')):'')));setSelected(ids);setEnabled(active);setSaved(true);}catch(e){setError(e);}finally{setBusy(false);}}
 function toggleHistory(value:boolean){setError(null);try{localStorage.setItem(HISTORY_ENABLED,value?'1':'0');if(!value){localStorage.removeItem(HISTORY);setRecent([]);}setRemember(value);}catch(e){setError(e);}}
 return <section className="section stack" aria-labelledby="recommendations-title"><div className="row spread"><h2 id="recommendations-title">{t('Для вас')}</h2><Link href="/places">{t('История места')} →</Link></div>
  <details className="panel"><summary>{t('Настроить рекомендации')}</summary><form className="stack" onSubmit={e=>{e.preventDefault();void save();}}><p className="small muted">{t('Выберите интересные темы. Персонализацию можно отключить в любой момент.')}</p><label className="row"><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);setSaved(false);}}/>{t('Учитывать выбранные темы')}</label>
   {topics.length>0?<fieldset className="stack"><legend>{t('Темы')}</legend>{topics.map(topic=><label key={topic.id} className="row"><input type="checkbox" disabled={!enabled||busy} checked={selected.includes(topic.id)} onChange={e=>{setSaved(false);setSelected(ids=>e.target.checked?[...ids,topic.id].slice(0,20):ids.filter(id=>id!==topic.id));}}/><span lang={topic.contentLocale}>{topic.title}</span></label>)}</fieldset>:<p>{t('Темы появятся после редакционной проверки материалов.')}</p>}
   <p className="small muted">{t(user?'Выбор тем сохраняется в вашем аккаунте.':'Выбор тем сохраняется только в этом браузере.')}</p><div className="row"><button className="btn btn-primary" disabled={busy} type="submit">{t('Сохранить')}</button><button className="btn btn-secondary" disabled={busy} type="button" onClick={()=>void save(true)}>{t('Очистить настройки')}</button></div>{saved&&<p role="status">{t('Настройки сохранены.')}</p>}
   <label className="row"><input type="checkbox" checked={remember} onChange={e=>toggleHistory(e.target.checked)}/>{t('Сохранять последние три документа в этом браузере')}</label><p className="small muted">{t('По умолчанию история не сохраняется. Отключение удаляет сохранённый список.')}</p>
  </form></details>
  {error?<ErrorNotice error={error} onRetry={()=>refresh(a=>a+1)}/>:!data?<Loading rows={1}/>:data.recommended.items.length?<><p className="small muted">{t(data.recommended.mode==='interests'?'По выбранным вами темам':'Редакционная подборка')}</p><MaterialCards items={data.recommended.items}/></>:<p className="muted">{t('Подходящая подборка пока не опубликована. Начните с каталога.')}</p>}
  {data?.popular.status==='measured'&&data.popular.items.length>0&&<><h3>{t('Популярные материалы')}</h3><p className="small muted">{t('Период:')} {data.popular.period?.from.slice(0,10)} — {data.popular.period?.to.slice(0,10)}</p><MaterialCards items={data.popular.items}/></>}
  {remember&&recent.length>0&&<><h3>{t('Продолжить чтение')}</h3><MaterialCards items={recent}/></>}
 </section>;
}
