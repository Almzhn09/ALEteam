'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {useI18n} from '@/lib/lang';

/** Immediate feedback bridges the network delay before Next can deliver its loading boundary. */
export function NavigationFeedback(){
 const {t}=useI18n();const pathname=usePathname(),params=useSearchParams();
 const [waiting,setWaiting]=useState(false);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{setWaiting(false);if(timer.current)clearTimeout(timer.current);},[pathname,params]);
 useEffect(()=>{
  const begin=()=>{setWaiting(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setWaiting(false),30000);};
  const internal=(href:string)=>{try{const url=new URL(href,location.href);return url.origin===location.origin&&!url.pathname.startsWith('/api/')&&(url.pathname!==location.pathname||url.search!==location.search);}catch{return false;}};
  const click=(event:MouseEvent)=>{
   if(event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
   const target=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(!(target instanceof HTMLAnchorElement)||target.hasAttribute('download')||target.target&&target.target!=='_self'||target.getAttribute('aria-disabled')==='true')return;
   if(internal(target.href))begin();
  };
  // Capturing the interaction means feedback appears before a slow RSC response arrives.
  const submit=(event:SubmitEvent)=>{
   const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('action')||form.method.toLowerCase()!=='get')return;
   if(internal(form.action))begin();
  };
  document.addEventListener('click',click,true);document.addEventListener('submit',submit,true);
  return()=>{document.removeEventListener('click',click,true);document.removeEventListener('submit',submit,true);if(timer.current)clearTimeout(timer.current);};
 },[]);
 useEffect(()=>{const main=document.getElementById('main');if(waiting)main?.setAttribute('aria-busy','true');else main?.removeAttribute('aria-busy');return()=>main?.removeAttribute('aria-busy');},[waiting]);
 if(!waiting)return null;
 return <div className="navigation-feedback" role="status" aria-live="polite"><span className="spinner" aria-hidden="true"/><span>{t('Загрузка страницы…')}</span></div>;
}
