import {getT} from '@/lib/i18n-server';

// P1-F3: shown while a server-rendered page is prepared after navigation.
export default async function LoadingPage(){
 const t=await getT();
 return <div className="container page stack page-skeleton" role="status" aria-live="polite">
  <span className="visually-hidden">{t('Загрузка страницы…')}</span>
  <div className="skeleton skeleton-crumbs" aria-hidden="true"/>
  <div className="skeleton skeleton-title" aria-hidden="true"/>
  <div className="skeleton skeleton-line" aria-hidden="true"/>
  <div className="skeleton skeleton-line short" aria-hidden="true"/>
  <div className="skeleton skeleton-block" aria-hidden="true"/>
 </div>;
}
