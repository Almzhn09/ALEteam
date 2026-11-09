// Session-stored messages are untrusted; only internally generated CMS URLs may be followed.
export function assistantSourceLink(source:{id:string;kind:string;href?:string;locale?:string}){
 if(source.kind==='document'&&source.locale&&source.locale!=='ru')return source.href&&/^\/api\/documents\/[a-zA-Z0-9_-]{1,80}\?locale=(kk|en)$/u.test(source.href)?source.href:'/assistant';
 if(source.kind==='cms')return source.href&&/^\/api\/content\/[a-z0-9][a-z0-9-]{0,99}\?locale=(ru|kk|en)$/u.test(source.href)?source.href:'/assistant';
 return source.kind==='guide'?`/about#${encodeURIComponent(source.id)}`:`/documents/${encodeURIComponent(source.id)}`;
}
