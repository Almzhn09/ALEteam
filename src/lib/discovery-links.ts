import type {MaterialKey,MaterialRef,SourceRef,ResearchAction} from '@/contracts/discovery';
export function materialLink(item:MaterialKey&{href?:string;contentLocale?:string;locale?:string}){
 const locale=item.contentLocale??item.locale;
 if(item.kind==='document')return `/documents/${encodeURIComponent(item.id)}${locale?'?contentLang='+locale:''}`;
 const match=item.href?.match(/^\/api\/content\/([a-z0-9-]+)(?:\?locale=(ru|kk|en))?$/);
 return match?`/materials/${match[1]}?contentLang=${match[2]??locale??'ru'}`:'/search';
}
export function researchLink(action:ResearchAction){
 if(action.type==='openPlace')return '/places?placeId='+encodeURIComponent(action.placeId);
 if(action.type==='openMaterial')return materialLink(action.material);
 const query=new URLSearchParams();for(const [key,value] of Object.entries(action.filters))if(value!==undefined)query.set(key,String(value));return '/catalog?'+query;
}
export function sourceFileLink(source:SourceRef){const match=source.href.match(/^\/api\/(files|material-files)\/([a-zA-Z0-9_-]+)\/(?:text|ocr)$/);return match?`/api/${match[1]}/${match[2]}${source.fragment?.page?'#page='+source.fragment.page:''}`:materialLink(source);}
export type DiscoveryMaterial=MaterialRef;
