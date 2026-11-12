/** Editorial decisions from R-A01, applied without replacing backend IDs/workflow. */
import publication from '../../../data/artur/real-content-v2/publication-manifest.json';
import sources from '../../../data/artur/real-content-v2/files.json';
interface PublicationRow {sourceKey:string;locale:string;payload:Record<string,unknown>;original:unknown}
export function reviewedPublicationRecord(row:PublicationRow){
 let key=row.sourceKey;
 if(key.startsWith('reference-'))key=key.slice('reference-'.length)+'-'+row.locale;
 if(key==='branch-decree-142')key='decree-142-'+row.locale;
 if(key==='fund-directory-info')key='fonds-guide';
 const original=row.original as {sha256?:string}|undefined;
 const file=original?.sha256?sources.files.find(f=>f.sha256===original.sha256):undefined;
 return publication.records.find(r=>r.sourceKey===key&&r.request.locale===row.locale)
  ??(file?publication.records.find(r=>r.request.locale===row.locale&&r.attachments.some(key=>key===file.key)):undefined);
}
export function reviewedPublicationPayload(row:PublicationRow){
 const reviewed=reviewedPublicationRecord(row);
 if(!reviewed)return row.payload;
 return {...reviewed.request.payload,
  ...(row.sourceKey==='fund-directory-info'?{title:row.payload.title}:{}),
  ...(row.payload.category?{category:row.payload.category}:{}),
  ...(row.payload.yearFrom!==undefined?{yearFrom:row.payload.yearFrom,yearTo:row.payload.yearTo}:{}),
  ...(row.payload.contactReview?{contactReview:row.payload.contactReview}:{}),
 };
}
