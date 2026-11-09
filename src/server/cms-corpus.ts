// TZ-A06: boundary proposal, not a replacement for server-side DB authorization.
export type CmsSource = {
 id:string; kind:'guide'|'document'|'fund'|'inventory'|'case'|'branch'|'exhibition';
 language:'ru'|'kk'|'en'; status:string; translationStatus:string;
 metadataPublic:boolean; assistantAllowed:boolean; revision:number;
 title:string; publicText:string; isDemo:boolean;
 // Private text, master file paths, comments and credentials must never be passed here.
};
export function cmsCorpus(records: readonly CmsSource[], language:'ru'|'kk'|'en') {
  if (!['ru','kk','en'].includes(language)) throw new Error('Unsupported language');
  const ids=new Set<string>();
  return records.filter(r=>r.language===language && r.status==='PUBLISHED' && r.translationStatus==='APPROVED'
    && r.metadataPublic===true && r.assistantAllowed===true)
    .map(r=>{
      if (!['guide','document','fund','inventory','case','branch','exhibition'].includes(r.kind)
        || typeof r.title !== 'string' || typeof r.publicText !== 'string'
        || !r.title.trim() || !r.publicText.trim() || r.title.length > 500 || r.publicText.length > 12000) throw new Error('Invalid public source');
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(r.id) || !Number.isSafeInteger(r.revision) || r.revision<1 || ids.has(r.id)) throw new Error('Ambiguous CMS identity');
      ids.add(r.id);
      return {id:r.id,kind:r.kind,language:r.language,title:r.title,text:r.publicText,isDemo:r.isDemo,revision:r.revision};
    });
}
// No retained cache. Recompute from an authorized public projection per request so withdrawals take effect.
