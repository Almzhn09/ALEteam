import {ArchiveSearch} from './ArchiveSearch';
import {Breadcrumbs} from '@/components/ui';
import {getLang,getT} from '@/lib/i18n-server';
import {materialSearch} from '@/server/material-search';
import {directory} from '@/server/reference-directory';
import {archiveKey,archiveParams,archiveRequest,archiveResult,type ArchiveInitial,type ArchiveResponse} from './shared';

type Props={searchParams:Promise<Record<string,string|string[]|undefined>>};
export async function generateMetadata(){return {title:(await getT())('Каталог')};}

// Use the public handlers directly: first-page HTML includes the same current
// visibility-checked results as the API, without a client round trip or skeleton.
export default async function CatalogPage({searchParams}:Props){
 const [raw,lang,t]=await Promise.all([searchParams,getLang(),getT()]);
 const query=new URLSearchParams();
 for(const [key,value]of Object.entries(raw)){
  const first=typeof value==='string'?value:Array.isArray(value)&&typeof value[0]==='string'?value[0]:undefined;
  if(first!==undefined)query.set(key,first);
 }
 const params=archiveParams(query);
 let initial:ArchiveInitial|null=null;
 if(!params.legacy){
  try{
   const request=new Request('http://internal.invalid/api'+archiveRequest(params,lang));
   const response=params.scope==='fund'||params.scope==='newspaper'?await directory(request,params.scope,params.entry||undefined):await materialSearch(request);
   if(response.ok)initial=archiveResult(await response.json() as ArchiveResponse,params,lang);
  }catch{initial=null;}
 }
 return <div className="container page">
  <Breadcrumbs items={[{label:t('Каталог')}]} />
  <div className="section-heading"><p className="eyebrow">{t('Исследуйте архив')}</p><h1>{t('Поиск по архиву')}</h1></div>
  <ArchiveSearch initial={initial} initialKey={archiveKey(params,lang)}/>
 </div>;
}
