// Session-stored messages are untrusted; only internally generated URLs of known shapes may be followed, and each
// opens a reader page (or the original file) instead of the raw JSON of an /api endpoint.
export function assistantSourceLink(source:{id:string;kind:string;href?:string;locale?:string}){
 if(source.kind==='fund'||source.kind==='newspaper'){
  const path=source.kind==='fund'?'funds':'newspapers';
  return /^[a-zA-Z0-9_-]{1,80}$/u.test(source.id)&&source.href===`/api/directories/${path}/${source.id}`?`/directories/${path}/${source.id}`:'/assistant';
 }
 if(source.kind==='document'&&source.locale&&source.locale!=='ru'){const m=source.href?.match(/^\/api\/documents\/([a-zA-Z0-9_-]{1,80})\?locale=(kk|en)$/u);return m?`/documents/${m[1]}?contentLang=${m[2]}`:'/assistant';}
 if(source.kind==='cms'){
  const page=source.href?.match(/^\/api\/content\/([a-z0-9][a-z0-9-]{0,99})\?locale=(ru|kk|en)$/u);
  if(page)return `/materials/${page[1]}?contentLang=${page[2]}`;
  // A cited original file: open the file itself at the cited page, not its extracted-text JSON.
  const file=source.href?.match(/^\/api\/material-files\/([a-zA-Z0-9_-]{1,80})\/text(?:\?page=([1-9]\d?|100))?$/u);
  return file?`/api/material-files/${file[1]}${file[2]?`#page=${file[2]}`:''}`:'/assistant';
 }
 return source.kind==='guide'?`/help#${encodeURIComponent(source.id)}`:`/documents/${encodeURIComponent(source.id)}`;
}

// Render validated evidence as a reading page while preserving the strict URL
// checks above for messages restored from untrusted browser storage.
export function assistantReadingLink(source:{id:string;kind:string;href?:string;locale?:string}){
 const href=assistantSourceLink(source);
 const cms=href.match(/^\/api\/content\/([a-z0-9][a-z0-9-]{0,99})\?locale=(ru|kk|en)$/u);
 if(cms)return '/materials/'+cms[1]+'?contentLang='+cms[2];
 if((source.kind==='fund'||source.kind==='newspaper')&&href.startsWith('/api/directories/'))return '/catalog?scope='+source.kind+'&entry='+encodeURIComponent(source.id);
 const file=href.match(/^\/api\/material-files\/([a-zA-Z0-9_-]{1,80})\/text(?:\?page=([1-9]\d?|100))?$/u);
 if(file)return '/api/material-files/'+file[1]+(file[2]?'#page='+file[2]:'');
 const document=href.match(/^\/api\/documents\/([a-zA-Z0-9_-]{1,80})\?locale=(kk|en)$/u);
 return document?'/documents/'+document[1]+'?contentLang='+document[2]:href;
}
