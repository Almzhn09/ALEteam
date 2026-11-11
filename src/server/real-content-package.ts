import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareSourceDraftRows} from './source-drafts';
import {contentPayload} from './cms';
import {canonicalHash} from './catalog-import-schema';
import {Prisma} from '../generated/prisma/index.js';
import {reviewedPublicationPayload} from './artur-discovery/publication-content';
import publication from '../../data/artur/real-content-v2/publication-manifest.json';
const hash=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
export interface RealPage {sourceKey:string;slug:string;locale:string;kind:'PAGE'|'BRANCH_PROFILE';branchId:string|null;branchName?:string;payload:Prisma.InputJsonObject;original:unknown}
export async function realContentPackage(){
 const requests=JSON.parse(await readFile('data/archive-20261110/cms-draft-requests.json','utf8'));
 const branches=JSON.parse(await readFile('data/archive-20261110/branches.json','utf8'));
 const maps=requests.records.map((r:any)=>({sourceKey:r.sourceKey,slug:r.sourceKey.startsWith('calendar-')?r.request.slug.replace(/-(ru|kk)$/,''):r.sourceKey==='compliance-14'||r.sourceKey==='compliance-15'?'archive-compliance-information':r.sourceKey==='compliance-16'||r.sourceKey==='compliance-17'?'archive-compliance-analysis-notice':r.request.slug}));
 const cms=prepareSourceDraftRows({package:'archive-20261110',mode:'cms',mappings:maps});
 const profiles=prepareSourceDraftRows({package:'archive-20261110',mode:'branches',mappings:branches.records.map((r:any,index:number)=>({sourceKey:r.sourceKey,slug:'archive-branch-'+(index+1)}))});
 const rows:RealPage[]=[...cms,...profiles].map(r=>{
  const p=contentPayload.parse(r.payload);p.rights='Материал предоставлен для публикации в проекте; оригинал сохранён.';
  p.category=r.sourceKey.startsWith('calendar-')?'calendar':r.sourceKey.startsWith('compliance-')?'compliance':r.sourceKey.startsWith('S01-')?'branches':r.sourceKey.startsWith('history-')?'history':r.sourceKey==='contacts'?'contacts':'structure';
  if(r.sourceKey.startsWith('calendar-')){p.yearFrom=Number(r.sourceKey.split('-')[1]);p.yearTo=p.yearFrom;}
  if(r.sourceKey==='contacts'){p.address='Республика Казахстан, 070000, г. Усть-Каменогорск, ул. Бейбітшілік, 26/1 (Головкова, 26/1)';p.phone='8 (7232) 25-59-76';p.email='arhiv-ukg@yandex.kz';p.hours='Понедельник–пятница: архив 8:00–17:00; читальный зал 9:00–16:00';}
  if(p.contactReview){p.contactReview.address='verified';if(p.phone)p.contactReview.phone='verified';}
  return {sourceKey:r.sourceKey,slug:r.slug,locale:r.locale,kind:r.kind,branchId:r.branchId,...(r.branchName?{branchName:r.branchName}:{}),payload:p as Prisma.InputJsonObject,original:r.original};
 });
 const decree=JSON.parse(await readFile('data/artur/discovery/branch-decree-review.json','utf8'));
 rows.push({sourceKey:'branch-decree-142',slug:'archive-branch-decree-142',locale:'ru',kind:'PAGE',branchId:null,payload:contentPayload.parse({title:decree.title,body:'Постановление акимата Восточно-Казахстанской области от 2 июня 2026 года №142 «О некоторых вопросах архивных учреждений Восточно-Казахстанской области». Приложение 1 содержит создание девяти филиалов, приложение 2 — переименование четырёх филиалов. Оригинал постановления приведён во вложении. Реквизиты прочитаны по изображению, автоматический OCR может содержать ошибки.',date:'2026-06-02',category:'branches',rights:'Предоставленный оригинал постановления.',sourceNote:'S06; реквизиты: визуальная сверка изображения помощником ALEteam, не юридическое заключение.'}) as Prisma.InputJsonObject,original:decree});
 const references=JSON.parse(await readFile('data/artur/discovery/reference-page-drafts.json','utf8'));
 for(const r of references.records){rows.push({sourceKey:'reference-'+r.sourceKey,slug:r.create.slug,locale:'ru',kind:'PAGE',branchId:null,payload:contentPayload.parse({...r.create.payload,category:'services'}) as Prisma.InputJsonObject,original:r});for(const t of r.translations??[])rows.push({sourceKey:'reference-'+r.sourceKey,slug:r.create.slug,locale:t.locale,kind:'PAGE',branchId:null,payload:contentPayload.parse({...t.payload,category:'services'}) as Prisma.InputJsonObject,original:{...r,translationOrigin:'ALEteam editorial translation'}});}
 for(const [sourceKey,slug,title,body]of [
 ['fund-directory-info','archive-fund-directory','Справочник фондов','Перечни обычных и партийных фондов с исходными номерами и строками названий. Наименование файла содержит 2018 год, подпись ссылки — 2026; дата актуальности перечня не установлена. Из строк фондов не создаются архивные дела и оцифрованные документы.'],
 ['newspaper-directory-info','archive-newspaper-directory','Перечень хранения газет','Перечень по состоянию на 1 января 2018 года. Представлены 1466 строк хранения, а не 1466 различных газет или цифровых выпусков. Написания, годы, тома и обозначения повторов сохранены в справочнике.']])rows.push({sourceKey,slug,locale:'ru',kind:'PAGE',branchId:null,payload:contentPayload.parse({title,body,category:'directories',rights:'Предоставленные материалы S09 и сохранённые связанные выгрузки.',sourceNote:'S09; сведения о версии перечня сохранены.',links:[]}) as Prisma.InputJsonObject,original:{source:'S09',sourceKey}});
 const manifest=JSON.parse(await readFile('sources/archive-public-20261111/manifest.json','utf8'));
 for(const file of manifest.records){const bytes=await readFile('sources/archive-public-20261111/'+file.path);if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('SOURCE_HASH_CHANGED');if(file.ocrSha256&&hash(await readFile('sources/archive-public-20261111/ocr-s06.json'))!==file.ocrSha256)throw Error('OCR_ARTIFACT_CHANGED');}
 for(const file of manifest.records.filter((f:any)=>f.sourceId==='S04'&&f.name.endsWith('.pdf'))){const locale=/каз|Сыбайлас|Аналитикалық/.test(file.name)?'kk':'ru';rows.push({sourceKey:'compliance-file-'+file.sha256.slice(0,16),slug:'archive-compliance-'+file.sha256.slice(0,12),locale,kind:'PAGE',branchId:null,payload:contentPayload.parse({title:file.name.replace(/\.pdf$/i,''),body:locale==='kk'?'Комплаенс қызметінің ұсынылған құжаты. Түпнұсқа тіркемеде берілген.':'Предоставленный документ комплаенс-службы. Оригинал приведён во вложении.',rights:'Предоставленный материал комплаенс-службы.',sourceNote:'S04; '+file.member,category:'compliance'}) as Prisma.InputJsonObject,original:{sourceMember:file.member,sha256:file.sha256}});}
 for(const record of publication.records.filter(r=>r.sourceKey.startsWith('compliance-index-')))rows.push({sourceKey:record.sourceKey,slug:record.materialKey,locale:record.request.locale,kind:'PAGE',branchId:null,payload:contentPayload.parse({...record.request.payload,category:'compliance'}) as Prisma.InputJsonObject,original:{sourceId:'S04',preparedSourceKey:record.sourceKey}});
 for(const row of rows)row.payload=contentPayload.parse(reviewedPublicationPayload(row)) as Prisma.InputJsonObject;
 const paperGuide=rows.find(r=>r.sourceKey==='newspaper-directory-info');if(paperGuide)paperGuide.payload.sourceNote='Перечень газет из предоставленного документа «Фонды.docx»; версия исходника указана в тексте.';
 return {version:1,namespace:'real-content-20261111',rows,files:manifest.records,excluded:manifest.excluded,digest:canonicalHash({rows,files:manifest.records})};
}
