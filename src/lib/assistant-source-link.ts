// Session-stored messages are untrusted; only internally generated CMS URLs may be followed.
export function assistantSourceLink(source:{id:string;kind:string;href?:string;locale?:string}){
 if(source.kind==='document'&&source.locale&&source.locale!=='ru'){const m=source.href?.match(/^\/api\/documents\/([a-zA-Z0-9_-]{1,80})\?locale=(kk|en)$/u);return m?`/documents/${m[1]}?contentLang=${m[2]}`:'/assistant';}
 // A CMS source opens its reader page in the cited language, not the raw JSON of /api/content.
 if(source.kind==='cms'){const m=source.href?.match(/^\/api\/content\/([a-z0-9][a-z0-9-]{0,99})\?locale=(ru|kk|en)$/u);return m?`/materials/${m[1]}?contentLang=${m[2]}`:'/assistant';}
 return source.kind==='guide'?`/help#${encodeURIComponent(source.id)}`:`/documents/${encodeURIComponent(source.id)}`;
}
