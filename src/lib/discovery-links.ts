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
export function sourceFileLink(source:SourceRef){
 const cms=source.href.match(/^\/api\/material-files\/([a-zA-Z0-9_-]{1,80})(?:\/text(?:\?page=(?:[1-9]\d?|100))?)?$/);
 if(cms)return '/api/material-files/'+cms[1]+(source.fragment?.page?'#page='+source.fragment.page:'');
 const match=source.href.match(/^\/api\/files\/([a-zA-Z0-9_-]+)\/(?:text|ocr)$/);return match?`/api/files/${match[1]}${source.fragment?.page?'#page='+source.fragment.page:''}`:materialLink(source);
}
export type DiscoveryMaterial=MaterialRef;
