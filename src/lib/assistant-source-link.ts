// Session-stored messages are untrusted; only internally generated CMS URLs may be followed.
export function assistantSourceLink(source:{id:string;kind:string;href?:string}){
 if(source.kind==='cms')return source.href&&/^\/api\/content\/[a-z0-9][a-z0-9-]{0,99}\?locale=(ru|kk|en)$/u.test(source.href)?source.href:'/assistant';
 return source.kind==='guide'?`/about#${encodeURIComponent(source.id)}`:`/documents/${encodeURIComponent(source.id)}`;
}
