import {ContentDetail,detailMetadata} from '@/components/ContentDetail';
import {contentKinds} from '@/contracts/cms';
import {getT} from '@/lib/i18n-server';
import {isLang} from '@/lib/i18n';
const kinds=contentKinds.filter(k=>k!=='SETTING');
type Props={params:Promise<{slug:string}>;searchParams:Promise<{contentLang?:string}>};
export async function generateMetadata({params,searchParams}:Props){const {slug}=await params,lang=(await searchParams).contentLang;return detailMetadata(slug,'/materials/'+slug,kinds,isLang(lang)?lang:undefined);}
export default async function MaterialPage({params,searchParams}:Props){const [{slug},t,{contentLang}]=await Promise.all([params,getT(),searchParams]);return <ContentDetail slug={slug} path={'/materials/'+slug} kinds={kinds} contentLocale={isLang(contentLang)?contentLang:undefined} crumb={{href:'/',label:t('Главная')}}/>;}
