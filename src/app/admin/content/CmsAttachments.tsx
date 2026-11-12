'use client';

import {useCallback,useEffect,useId,useState,type FormEvent} from 'react';
import type {ContentRevision} from '@/contracts/cms';
import type {UploadMime} from '@/contracts/uploads';
import {ApiClientError,apiGet,apiPutBytes,apiSend} from '@/lib/api';
import {useI18n} from '@/lib/lang';
import {ErrorNotice,Loading,Notice} from '@/components/ui';
import {FormError,useStaff} from '../AdminShell';

// Deliberately mirrors the browser-safe response, not the private storage model.
interface CmsAttachment {
 id:string;revisionId:string;name:string;mimeType:UploadMime;expectedBytes:number;expectedSha256:string;
 rights:string;sourceNote:string;sourceLabel:string;sourceVersion:string;uploaderId:string;reviewerId:string|null;
 state:'AWAITING_CONTENT'|'RECEIVING'|'QUARANTINED'|'APPROVED'|'REJECTED'|'PUBLISHED'|'FAILED'|'WITHDRAWN';
 updatedAt:string;createdAt:string;failureCode:string|null;
 inspection:{fullFormatParsing:boolean;parser?:string;antivirus:'not-configured'};
}
const MAX_BYTES=20*1024*1024;
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const mimeByExtension:Record<string,UploadMime>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',docx:DOCX};
const stateLabel:Record<CmsAttachment['state'],string>={AWAITING_CONTENT:'Ожидает файл',RECEIVING:'Передача файла',QUARANTINED:'На проверке',APPROVED:'Одобрен',REJECTED:'Отклонён',PUBLISHED:'Опубликован',FAILED:'Ошибка загрузки',WITHDRAWN:'Снят с публикации'};
async function inspectFile(file:File){
 const mimeType=mimeByExtension[file.name.split('.').at(-1)?.toLowerCase()??''];
 if(!mimeType||file.type&&file.type!=='application/octet-stream'&&file.type!==mimeType)throw new ApiClientError(400,'INVALID_FILE','Принимаются PDF, DOCX, PNG и JPEG.');
 if(!file.size||file.size>MAX_BYTES)throw new ApiClientError(400,'INVALID_FILE_SIZE','Размер файла должен быть от 1 байта до 20 МиБ.');
 const bytes=await file.arrayBuffer();
 const expectedSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {mimeType,expectedSha256};
}
async function transmit(item:CmsAttachment,file:File){
 const checked=await inspectFile(file);
 if(item.expectedBytes!==file.size||item.expectedSha256!==checked.expectedSha256||item.mimeType!==checked.mimeType)throw new ApiClientError(400,'SOURCE_MISMATCH','Выбранный файл отличается от зарегистрированного оригинала.');
 return (await apiPutBytes<{item:CmsAttachment}>(`/admin/material-files/${item.id}/content`,file,{'Content-Type':item.mimeType,'If-Match':`"${item.updatedAt}"`})).item;
}
function ResumeTransfer({item,onChanged}:{item:CmsAttachment;onChanged():Promise<void>}){
 const {t}=useI18n(),id=useId();
 const [file,setFile]=useState<File|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(!file)return;setBusy(true);setError(null);try{await transmit(item,file);await onChanged();}catch(e){setError(e);if(e instanceof ApiClientError&&e.status===409)await onChanged();}finally{setBusy(false);}}
 return <form className="stack" onSubmit={submit}><div className="field"><label htmlFor={id}>{t('Выберите тот же оригинал для продолжения')}</label><input id={id} className="input" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" disabled={busy} onChange={e=>setFile(e.target.files?.[0]??null)}/></div><FormError error={error}/><div><button className="btn btn-secondary" type="submit" disabled={busy||!file}>{t('Продолжить передачу')}</button></div></form>;
}
function AttachmentCard({item,revision,branchId,onChanged,readOnly=false}:{item:CmsAttachment;revision?:ContentRevision;branchId:string|null;onChanged():Promise<void>;readOnly?:boolean}){
 const {t,formatDate}=useI18n(),staff=useStaff(),id=useId();
 const [reason,setReason]=useState(''),[rightsConfirmed,setRightsConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[local,setLocal]=useState('');
 const own=item.uploaderId===staff.id;
 const can=(permission:string)=>!readOnly&&staff.can(permission,branchId);
 const canReview=can('content.review')&&!own&&item.state==='QUARANTINED';
 const canPublish=can('content.publish')&&item.state==='APPROVED'&&revision?.status==='PUBLISHED';
 const canWithdraw=can('content.publish')&&['PUBLISHED','APPROVED'].includes(item.state);
 const canRetry=can('content.write')&&own&&(item.state==='FAILED'||item.state==='RECEIVING'&&Date.now()-Date.parse(item.updatedAt)>=120000);
 async function act(action:'review'|'publish'|'withdraw'|'retry',decision?:'APPROVE'|'REJECT'){
  setLocal('');setError(null);
  if(reason.trim().length<3)return setLocal(t('Укажите основание решения: не менее 3 символов.'));
  if(decision==='APPROVE'&&!rightsConfirmed)return setLocal(t('Подтвердите права на публикацию копии.'));
  setBusy(true);
  try{await apiSend(`/admin/material-files/${item.id}/${action}`,'POST',{expectedUpdatedAt:item.updatedAt,reason:reason.trim(),...(decision?{decision,rightsConfirmed:decision==='APPROVE'&&rightsConfirmed}:{})});setReason('');setRightsConfirmed(false);await onChanged();}
  catch(e){setError(e);if(e instanceof ApiClientError&&e.status===409)await onChanged();}
  finally{setBusy(false);}
 }
 return <li className="card card-flat stack cms-attachment" data-cms-file-id={item.id}>
  <div className="row spread"><h3>{item.name}</h3><span className={'badge badge-'+(item.state==='WITHDRAWN'?'ARCHIVED':item.state)}>{t(stateLabel[item.state])}</span></div>
  <p className="small muted">{item.name.split('.').at(-1)?.toUpperCase()} · {Math.ceil(item.expectedBytes/1024)} KB · {formatDate(item.createdAt)}{own?` · ${t('ваша загрузка')}`:''}</p>
  <dl className="props small"><dt>{t('Источник')}</dt><dd>{item.sourceLabel}</dd><dt>{t('Версия источника')}</dt><dd>{item.sourceVersion}</dd><dt>{t('Права на файл')}</dt><dd>{item.rights}</dd><dt>{t('Происхождение файла')}</dt><dd>{item.sourceNote}</dd></dl>
  <details><summary>{t('Техническая проверка')}</summary><dl className="props small"><dt>{t('Контрольная сумма')}</dt><dd className="mono">{item.expectedSha256}</dd><dt>{t('Разбор файла')}</dt><dd>{t(item.inspection.fullFormatParsing?'Формат разобран':'Разбор при проверке сотрудником')}</dd>{item.failureCode&&<><dt>{t('Код ошибки')}</dt><dd className="mono">{item.failureCode}</dd></>}</dl><p className="small muted">{t('Антивирус не подключён: проверяются формат, сигнатура и контрольная сумма.')}</p></details>
  {['QUARANTINED','APPROVED','PUBLISHED','REJECTED','WITHDRAWN'].includes(item.state)&&<p><a href={`/api/admin/material-files/${item.id}/content`} download>{t('Скачать оригинал для проверки')}</a></p>}
  {readOnly&&revision&&<p className="small muted">{revision.locale.toUpperCase()} · {t('Редакция')} {revision.version}</p>}
  {item.state==='QUARANTINED'&&own&&!readOnly&&<p className="small muted">{t('Проверяет и одобряет файл другой сотрудник.')}</p>}
  {item.state==='APPROVED'&&revision?.status!=='PUBLISHED'&&!readOnly&&<p className="small muted">{t('Сначала опубликуйте редакцию материала, затем файл.')}</p>}
  {can('content.write')&&own&&item.state==='AWAITING_CONTENT'&&<ResumeTransfer item={item} onChanged={onChanged}/>}
  {canReview||canPublish||canWithdraw||canRetry?<div className="stack">
   <div className="field"><label htmlFor={`${id}-reason`}>{t('Основание решения')}</label><textarea id={`${id}-reason`} className="textarea" rows={2} maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></div>
   {canReview&&<label className="row"><input type="checkbox" checked={rightsConfirmed} disabled={busy} onChange={e=>setRightsConfirmed(e.target.checked)}/>{t('Права на публикацию копии проверены')}</label>}
   {local&&<Notice tone="error" live><p>{local}</p></Notice>}<FormError error={error}/>
   {error instanceof ApiClientError&&error.status===409&&<p className="small muted">{t('Состояние обновлено. Введённое основание сохранено; проверьте данные и повторите действие.')}</p>}
   <div className="row">{canReview&&<><button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void act('review','APPROVE')}>{t('Одобрить')}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void act('review','REJECT')}>{t('Отклонить')}</button></>}{canPublish&&<button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void act('publish')}>{t('Опубликовать файл')}</button>}{canWithdraw&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void act('withdraw')}>{t('Снять файл с публикации')}</button>}{canRetry&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void act('retry')}>{t('Разрешить повторную передачу')}</button>}</div>
  </div>:null}
 </li>;
}
function NewAttachment({itemId,revision,onDone}:{itemId:string;revision:ContentRevision;onDone():Promise<void>}){
 const {t}=useI18n(),id=useId();
 const [file,setFile]=useState<File|null>(null),[rights,setRights]=useState(revision.payload.rights),[sourceNote,setSourceNote]=useState(revision.payload.sourceNote??''),[label,setLabel]=useState(revision.payload.title),[version,setVersion]=useState('');
 const [pending,setPending]=useState<CmsAttachment|null>(null),[busy,setBusy]=useState(false),[step,setStep]=useState(''),[error,setError]=useState<unknown>(null),[round,setRound]=useState(0);
 async function upload(e:FormEvent){
  e.preventDefault();setError(null);if(!file)return;
  setBusy(true);
  try{
   setStep(t('Подсчёт контрольной суммы…'));const checked=await inspectFile(file);
   let row=pending;
   if(!row){
    if(!rights.trim()||!sourceNote.trim()||!label.trim()||!version.trim())throw new ApiClientError(400,'SOURCE_REQUIRED','Укажите права, происхождение, название и версию источника.');
    setStep(t('Регистрация загрузки…'));row=(await apiSend<{item:CmsAttachment}>(`/admin/content/${itemId}/attachments`,'POST',{revisionId:revision.id,name:file.name.replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180),mimeType:checked.mimeType,expectedBytes:file.size,expectedSha256:checked.expectedSha256,rights:rights.trim(),sourceNote:sourceNote.trim(),sourceLabel:label.trim(),sourceVersion:version.trim()})).item;setPending(row);
   }else row=(await apiGet<{item:CmsAttachment}>(`/admin/material-files/${row.id}`)).item;
   if(row.state==='AWAITING_CONTENT'){setStep(t('Передача файла…'));await transmit(row,file);}
   else if(row.state!=='QUARANTINED')throw new ApiClientError(409,'RETRY_REQUIRED','Передача не завершена. Проверьте состояние файла в списке ниже.');
   setFile(null);setPending(null);setRound(n=>n+1);setVersion('');await onDone();setStep(t('Файл передан на проверку.'));
  }catch(e){setError(e);setStep('');await onDone();}finally{setBusy(false);}
 }
 return <details className="panel cms-upload"><summary>{t('Добавить оригинал к редакции')}</summary><form className="stack" onSubmit={upload}>
  <div className="field"><label htmlFor={`${id}-file`}>{t('Файл (PDF, DOCX, PNG или JPEG, до 20 МиБ)')}</label><input key={round} id={`${id}-file`} className="input" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" disabled={busy||!!pending} onChange={e=>{setFile(e.target.files?.[0]??null);setStep('');}} required/></div>
  <div className="form-grid"><div className="field"><label htmlFor={`${id}-rights`}>{t('Права на файл')}</label><input id={`${id}-rights`} className="input" maxLength={1000} value={rights} disabled={busy||!!pending} onChange={e=>setRights(e.target.value)} required/></div><div className="field"><label htmlFor={`${id}-source`}>{t('Происхождение файла')}</label><input id={`${id}-source`} className="input" maxLength={1000} value={sourceNote} disabled={busy||!!pending} onChange={e=>setSourceNote(e.target.value)} required/></div><div className="field"><label htmlFor={`${id}-label`}>{t('Название источника')}</label><input id={`${id}-label`} className="input" maxLength={200} value={label} disabled={busy||!!pending} onChange={e=>setLabel(e.target.value)} required/></div><div className="field"><label htmlFor={`${id}-version`}>{t('Версия источника')}</label><input id={`${id}-version`} className="input" maxLength={200} value={version} disabled={busy||!!pending} onChange={e=>setVersion(e.target.value)} required/></div></div>
  <p className="small muted">{t('Оригинал прикрепляется к выбранной редакции. После передачи его проверяет другой сотрудник.')}</p>
  <FormError error={error}/>{step&&<p className="small" role="status">{step}</p>}
  <div className="row"><button type="submit" className="btn btn-primary" disabled={busy||!file}>{t(pending?'Продолжить передачу':'Загрузить файл')}</button>{pending&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>{setPending(null);setFile(null);setRound(n=>n+1);setError(null);setStep('');}}>{t('Выбрать другой оригинал')}</button>}</div>
 </form></details>;
}
export function CmsAttachments({itemId,branchId,revision,revisions}:{itemId:string;branchId:string|null;revision:ContentRevision;revisions:ContentRevision[]}){
 const {t}=useI18n(),staff=useStaff();const [items,setItems]=useState<CmsAttachment[]|null>(null),[error,setError]=useState<unknown>(null);
 const load=useCallback(async()=>{setError(null);try{setItems((await apiGet<{items:CmsAttachment[]}>(`/admin/content/${itemId}/attachments`)).items);}catch(e){setError(e);}},[itemId]);
 useEffect(()=>{void load();},[load]);
 const active=items?.filter(f=>f.revisionId===revision.id),other=items?.filter(f=>f.revisionId!==revision.id);
 return <section className="stack" aria-labelledby="cms-originals-title"><div className="row spread"><h2 id="cms-originals-title">{t('Оригиналы публикации')}</h2><button type="button" className="btn btn-secondary" onClick={()=>void load()}>{t('Обновить список')}</button></div>
  <p className="small muted">{revision.locale.toUpperCase()} · {t('Редакция')} {revision.version}</p>
  {staff.can('content.write',branchId)&&['DRAFT','CHANGES_REQUESTED','PUBLISHED'].includes(revision.status)&&<NewAttachment key={revision.id} itemId={itemId} revision={revision} onDone={load}/>}
  {error?<ErrorNotice error={error} onRetry={()=>void load()}/>:!items?<Loading rows={1}/>:active?.length?<ul className="result-list">{active.map(item=><AttachmentCard key={item.id} item={item} revision={revision} branchId={branchId} onChanged={load}/>)}</ul>:<p className="muted">{t('У этой редакции пока нет вложений.')}</p>}
  {!!other?.length&&<details><summary>{t('Вложения других редакций')} ({other.length})</summary><ul className="result-list">{other.map(item=><AttachmentCard key={item.id} item={item} revision={revisions.find(r=>r.id===item.revisionId)} branchId={branchId} onChanged={load} readOnly/>)}</ul></details>}
 </section>;
}
