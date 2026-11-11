// Session-stored messages are untrusted; only internally generated CMS URLs may be followed.
export function assistantSourceLink(source:{id:string;kind:string;href?:string;locale?:string}){
 if(source.kind==='fund'||source.kind==='newspaper'){
  const path='/api/directories/'+(source.kind==='fund'?'funds':'newspapers')+'/';
  return /^[a-zA-Z0-9_-]{1,80}$/u.test(source.id)&&source.href===path+source.id?source.href:'/assistant';
 }
 if(source.kind==='document'&&source.locale&&source.locale!=='ru')return source.href&&/^\/api\/documents\/[a-zA-Z0-9_-]{1,80}\?locale=(kk|en)$/u.test(source.href)?source.href:'/assistant';
 if(source.kind==='cms')return source.href&&(/^\/api\/content\/[a-z0-9][a-z0-9-]{0,99}\?locale=(ru|kk|en)$/u.test(source.href)||/^\/api\/material-files\/[a-zA-Z0-9_-]{1,80}\/text(?:\?page=(?:[1-9]\d?|100))?$/u.test(source.href))?source.href:'/assistant';
 return source.kind==='guide'?`/about#${encodeURIComponent(source.id)}`:`/documents/${encodeURIComponent(source.id)}`;
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
