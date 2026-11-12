'use client';
// N-F06: file uploads for a catalog card. Every step is a real /admin/uploads call; the browser only
// computes the SHA-256 that the server then checks against the bytes it actually received.
import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { ArchiveUploadDTO, UploadMime, UploadState } from '@/contracts/uploads';
import { apiGet, apiPutBytes, apiSend } from '@/lib/api';
import { formatBytes, sha256Hex as sha256 } from '@/lib/file-hash';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../AdminShell';

const MAX_BYTES = 20 * 1024 * 1024;
const MIMES: UploadMime[] = ['application/pdf', 'image/png', 'image/jpeg'];
export const uploadStateLabel: Record<UploadState, string> = {
  AWAITING_CONTENT: 'Ожидает файл', RECEIVING: 'Передаётся', QUARANTINED: 'На проверке', APPROVED: 'Одобрен',
  REJECTED: 'Отклонён', PUBLISHED: 'Опубликован', FAILED: 'Ошибка передачи',
};
const stateBadge: Record<UploadState, string> = {
  AWAITING_CONTENT: 'DRAFT', RECEIVING: 'IN_REVIEW', QUARANTINED: 'IN_REVIEW', APPROVED: 'APPROVED', REJECTED: 'REJECTED', PUBLISHED: 'PUBLISHED', FAILED: 'CHANGES_REQUESTED',
};
const parserLabel: Record<string, string> = {
  QUEUED: 'Разбор файла в очереди', RUNNING: 'Файл разбирается', PASSED: 'Разбор файла пройден', FAILED: 'Разбор файла не пройден', not_queued: 'Разбор файла не запускался',
};
interface Inspection { state: string; attempts?: number; failureCode?: string | null; previewFileId?: string | null }


export function UploadStateBadge({ state }: { state: UploadState }) {
  const { t } = useI18n();
  return <span className={`badge badge-${stateBadge[state]}`}>{t(uploadStateLabel[state])}</span>;
}

/** Form for a new file: declare, send bytes, the server verifies size, signature and hash. */
export function NewUpload({ documentId, onDone }: { documentId: string; onDone(): void }) {
  const { t } = useI18n();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [step, setStep] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState('');
  const [round, setRound] = useState(0);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setLocal('');
    if (!file) return setLocal(t('Выберите файл.'));
    if (!MIMES.includes(file.type as UploadMime)) return setLocal(t('Принимаются только PDF, PNG и JPEG.'));
    if (file.size > MAX_BYTES) return setLocal(t('Файл больше 20 МиБ.'));
    if (!rights.trim() || !sourceNote.trim()) return setLocal(t('Укажите права и происхождение файла.'));
    try {
      setStep(t('Подсчёт контрольной суммы…'));
      const expectedSha256 = await sha256(file);
      setStep(t('Регистрация загрузки…'));
      const { item } = await apiSend<{ item: ArchiveUploadDTO }>('/admin/uploads', 'POST', {
        documentId, originalName: file.name.replace(/[\\/]/g, '_').slice(0, 200), mimeType: file.type, expectedBytes: file.size, expectedSha256, rights: rights.trim(), sourceNote: sourceNote.trim(),
      });
      setStep(t('Передача файла…'));
      await apiPutBytes(`/admin/uploads/${item.id}/content`, file, { 'Content-Type': file.type, 'If-Match': `"${item.updatedAt}"` });
      setFile(null); setRights(''); setSourceNote(''); setRound(r => r + 1);
      setStep(''); onDone();
    } catch (err) { setStep(''); setError(err); onDone(); }
  }
  return (
    <form className="stack upload-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-file`}>{t('Файл (PDF, PNG или JPEG, до 20 МиБ)')}</label>
        <input key={round} id={`${id}-file`} className="input" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {file && <span className="small muted">{file.name} · {formatBytes(file.size)}</span>}
      </div>
      <div className="field"><label htmlFor={`${id}-rights`}>{t('Права на файл')}</label><input id={`${id}-rights`} className="input" value={rights} maxLength={500} onChange={e => setRights(e.target.value)} /></div>
      <div className="field"><label htmlFor={`${id}-source`}>{t('Происхождение файла')}</label><input id={`${id}-source`} className="input" value={sourceNote} maxLength={500} onChange={e => setSourceNote(e.target.value)} /></div>
      <p className="small muted">{t('После передачи файл попадает в карантин: сервер сверяет размер, сигнатуру и контрольную сумму, затем разбирает файл. Публикует его другой сотрудник после проверки прав.')}</p>
      {local && <Notice tone="error" live><p>{local}</p></Notice>}
      <FormError error={error} />
      {step && <p role="status" className="small">{step}</p>}
      <div><button className="btn btn-primary" type="submit" disabled={!!step}>{t('Загрузить файл')}</button></div>
    </form>
  );
}

/** One upload with the actions the current staff member may take on it. */
function UploadCard({ item, branchId, me, onChanged, documentLink }: { item: ArchiveUploadDTO; branchId: string | null | undefined; me: string; onChanged(): void; documentLink: boolean }) {
  const { t, formatDate } = useI18n();
  const staff = useStaff();
  const id = useId();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [reason, setReason] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [downloadable, setDownloadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState('');
  useEffect(() => {
    if (!['QUARANTINED', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(item.state)) { setInspection(null); return; }
    const abort = new AbortController();
    apiGet<{ item: Inspection }>(`/admin/uploads/${item.id}/inspection`, abort.signal).then(r => setInspection(r.item), () => setInspection(null));
    return () => abort.abort();
  }, [item.id, item.updatedAt, item.state]);
  const own = item.uploaderId === me;
  // In the cross-document queue the branch is unknown here: buttons follow any grant and the server decides.
  const can = (p: string) => branchId === undefined ? staff.grants.some(g => g.permission === p) : staff.can(p, branchId);
  const canReview = !own && can('content.review') && can('catalog.read');
  const canPublish = can('content.publish');
  async function act(path: string, body: unknown) {
    setBusy(true); setError(null); setLocal('');
    try { await apiSend(path, 'POST', body); onChanged(); } catch (err) { setError(err); onChanged(); } finally { setBusy(false); }
  }
  function review(decision: 'APPROVE' | 'REJECT') {
    if (!reason.trim()) return setLocal(t('Укажите основание решения.'));
    if (decision === 'APPROVE' && !rightsConfirmed) return setLocal(t('Подтвердите права на публикацию копии.'));
    void act(`/admin/uploads/${item.id}/review`, { expectedUpdatedAt: item.updatedAt, decision, rightsConfirmed: decision === 'APPROVE' && rightsConfirmed, reason: reason.trim() });
  }
  const parsed = inspection?.state === 'PASSED';
  return (
    <li className="card card-flat stack upload-card">
      <div className="row spread">
        <strong className="upload-name">{item.originalName}</strong>
        <UploadStateBadge state={item.state} />
      </div>
      {documentLink && <p className="small"><Link href={`/admin/catalog/${item.documentId}`}>{t('Карточка документа')} →</Link></p>}
      <p className="small muted">{item.mimeType} · {formatBytes(item.expectedBytes)} · {formatDate(item.createdAt)}{own ? ` · ${t('ваша загрузка')}` : ''}</p>
      <dl className="props small">
        <div><dt>{t('Права на файл')}</dt><dd>{item.rights}</dd></div>
        <div><dt>{t('Происхождение файла')}</dt><dd>{item.sourceNote}</dd></div>
        <div><dt>{t('Контрольная сумма')}</dt><dd className="mono upload-hash">{item.actualSha256 ?? item.expectedSha256}</dd></div>
        {item.reviewReason && <div><dt>{t('Основание решения')}</dt><dd>{item.reviewReason}</dd></div>}
        {item.failureCode && <div><dt>{t('Код ошибки')}</dt><dd className="mono">{item.failureCode}</dd></div>}
      </dl>
      {inspection && <p className="small">
        {t(parserLabel[inspection.state] ?? 'Разбор файла не запускался')}
        {inspection.failureCode ? <> · <span className="mono">{inspection.failureCode}</span></> : null}
        {inspection.attempts ? ` · ${t('попыток')}: ${inspection.attempts}` : ''}
      </p>}
      <p className="small muted">{t('Антивирус не подключён: проверяются формат, сигнатура и контрольная сумма.')}</p>
      {['QUARANTINED', 'APPROVED', 'REJECTED'].includes(item.state) && <p className="small"><a href={`/api/admin/uploads/${item.id}/content`} download>{t('Скачать оригинал для проверки')}</a></p>}
      {item.state === 'PUBLISHED' && item.fileId && <p className="small">{t('Опубликован как файл')} <span className="mono">{item.fileId}</span></p>}

      {item.state === 'QUARANTINED' && canReview && (
        <fieldset className="stack upload-review">
          <legend>{t('Проверка файла')}</legend>
          {!parsed && <Notice tone="warn"><p>{t('Одобрить можно только после успешного разбора файла.')}</p></Notice>}
          <div className="field"><label htmlFor={`${id}-reason`}>{t('Основание решения')}</label><input id={`${id}-reason`} className="input" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
          <label className="row checkbox-row"><input type="checkbox" checked={rightsConfirmed} onChange={e => setRightsConfirmed(e.target.checked)} /> {t('Права на публикацию копии проверены')}</label>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !parsed} onClick={() => review('APPROVE')}>{t('Одобрить')}</button>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => review('REJECT')}>{t('Отклонить')}</button>
          </div>
        </fieldset>
      )}
      {item.state === 'QUARANTINED' && own && <p className="small muted">{t('Проверяет и одобряет файл другой сотрудник.')}</p>}
      {item.state === 'APPROVED' && canPublish && (
        <div className="stack">
          <label className="row checkbox-row"><input type="checkbox" checked={downloadable} onChange={e => setDownloadable(e.target.checked)} /> {t('Разрешить посетителям скачивание')}</label>
          <div><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act(`/admin/uploads/${item.id}/publish`, { expectedUpdatedAt: item.updatedAt, downloadable })}>{t('Опубликовать файл')}</button></div>
          <p className="small muted">{t('Карточка должна быть опубликована и разрешать показ цифровой копии.')}</p>
        </div>
      )}
      {item.state === 'FAILED' && own && <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(`/admin/uploads/${item.id}/retry`, { expectedUpdatedAt: item.updatedAt })}>{t('Повторить передачу')}</button></div>}
      {item.state === 'QUARANTINED' && own && inspection?.state === 'FAILED' && (inspection.attempts ?? 0) < 3 && <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(`/admin/uploads/${item.id}/inspection-retry`, {})}>{t('Повторить разбор файла')}</button></div>}
      {local && <Notice tone="error" live><p>{local}</p></Notice>}
      <FormError error={error} />
    </li>
  );
}

/** Uploads of one document, or the review queue across the staff member's scope. */
export function UploadList({ documentId, branchId, state, writable = false }: { documentId?: string; branchId?: string | null; state?: UploadState; writable?: boolean }) {
  const { t } = useI18n();
  const staff = useStaff();
  const [items, setItems] = useState<ArchiveUploadDTO[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    setError(null);
    const q = new URLSearchParams({ pageSize: '20' });
    if (documentId) q.set('documentId', documentId);
    if (state) q.set('state', state);
    try { setItems((await apiGet<{ items: ArchiveUploadDTO[] }>(`/admin/uploads?${q}`)).items); } catch (e) { setError(e); }
  }, [documentId, state]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="stack">
      {writable && documentId && <NewUpload documentId={documentId} onDone={() => void load()} />}
      {error ? <ErrorNotice error={error} onRetry={() => void load()} />
        : !items ? <Loading rows={1} />
          : items.length === 0 ? <p className="muted">{state ? t('Файлов в этом состоянии нет.') : t('Файлы ещё не загружались.')}</p>
            : <ul className="result-list upload-list">{items.map(u => <UploadCard key={u.id} item={u} branchId={branchId} me={staff.id} documentLink={!documentId} onChanged={() => void load()} />)}</ul>}
    </div>
  );
}
