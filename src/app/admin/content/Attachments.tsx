'use client';
// R-F03: files of a CMS revision (contract docs/real-content/API.md, «Админское CMS-вложение»).
// Upload → quarantine → independent review (full parse + rights) → publish on the published revision → withdraw.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { apiGet, apiPutBytes, apiSend } from '@/lib/api';
import { formatBytes, safeFileName, sha256Hex } from '@/lib/file-hash';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../AdminShell';

const MAX_BYTES = 20 * 1024 * 1024;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIMES = ['application/pdf', 'image/png', 'image/jpeg', DOCX];
type State = 'AWAITING_CONTENT' | 'RECEIVING' | 'QUARANTINED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'FAILED' | 'WITHDRAWN';
interface CmsFile {
  id: string; revisionId: string; name: string; mimeType: string; expectedBytes: number; expectedSha256: string; rights: string; sourceNote: string;
  sourceLabel: string; sourceVersion: string; state: State; uploaderId: string; reviewerId: string | null; failureCode: string | null; createdAt: string; updatedAt: string;
  inspection: { parser?: string; fullFormatParsing: boolean; antivirus: string };
}
const stateLabel: Record<State, string> = {
  AWAITING_CONTENT: 'Ожидает файл', RECEIVING: 'Передаётся', QUARANTINED: 'На проверке', APPROVED: 'Одобрен', PUBLISHED: 'Опубликован',
  REJECTED: 'Отклонён', FAILED: 'Ошибка передачи', WITHDRAWN: 'Снят с публикации',
};
const stateBadge: Record<State, string> = {
  AWAITING_CONTENT: 'DRAFT', RECEIVING: 'IN_REVIEW', QUARANTINED: 'IN_REVIEW', APPROVED: 'APPROVED', PUBLISHED: 'PUBLISHED', REJECTED: 'REJECTED', FAILED: 'CHANGES_REQUESTED', WITHDRAWN: 'ARCHIVED',
};

function NewFile({ itemId, revisionId, onDone }: { itemId: string; revisionId: string; onDone(): void }) {
  const { t } = useI18n();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [round, setRound] = useState(0);
  const [form, setForm] = useState({ rights: '', sourceNote: '', sourceLabel: '', sourceVersion: '' });
  const [step, setStep] = useState('');
  const [local, setLocal] = useState('');
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setLocal(''); setError(null);
    if (!file) return setLocal(t('Выберите файл.'));
    if (!MIMES.includes(file.type)) return setLocal(t('Принимаются только PDF, DOCX, PNG и JPEG.'));
    if (file.size > MAX_BYTES) return setLocal(t('Файл больше 20 МиБ.'));
    if (Object.values(form).some(v => !v.trim())) return setLocal(t('Заполните права, происхождение, название и версию источника.'));
    try {
      setStep(t('Подсчёт контрольной суммы…'));
      const expectedSha256 = await sha256Hex(file);
      setStep(t('Регистрация загрузки…'));
      const { item } = await apiSend<{ item: CmsFile }>(`/admin/content/${encodeURIComponent(itemId)}/attachments`, 'POST', {
        revisionId, name: safeFileName(file.name), mimeType: file.type, expectedBytes: file.size, expectedSha256,
        rights: form.rights.trim(), sourceNote: form.sourceNote.trim(), sourceLabel: form.sourceLabel.trim(), sourceVersion: form.sourceVersion.trim(),
      });
      setStep(t('Передача файла…'));
      await apiPutBytes(`/admin/material-files/${item.id}/content`, file, { 'Content-Type': file.type, 'If-Match': `"${item.updatedAt}"` });
      setFile(null); setRound(r => r + 1); setForm({ rights: '', sourceNote: '', sourceLabel: '', sourceVersion: '' }); setStep(''); onDone();
    } catch (err) { setStep(''); setError(err); onDone(); }
  }
  return (
    <form className="stack upload-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-file`}>{t('Файл (PDF, DOCX, PNG или JPEG, до 20 МиБ)')}</label>
        <input key={round} id={`${id}-file`} className="input" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        {file && <span className="small muted">{file.name} · {formatBytes(file.size)}</span>}
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor={`${id}-label`}>{t('Название источника')}</label><input id={`${id}-label`} className="input" maxLength={200} value={form.sourceLabel} onChange={set('sourceLabel')} /></div>
        <div className="field"><label htmlFor={`${id}-version`}>{t('Версия источника')}</label><input id={`${id}-version`} className="input" maxLength={200} value={form.sourceVersion} onChange={set('sourceVersion')} /></div>
        <div className="field"><label htmlFor={`${id}-rights`}>{t('Права на файл')}</label><input id={`${id}-rights`} className="input" maxLength={1000} value={form.rights} onChange={set('rights')} /></div>
        <div className="field"><label htmlFor={`${id}-note`}>{t('Происхождение файла')}</label><input id={`${id}-note`} className="input" maxLength={1000} value={form.sourceNote} onChange={set('sourceNote')} /></div>
      </div>
      <p className="small muted">{t('Файл привязывается к этой редакции. Публикует его другой сотрудник после полного разбора и проверки прав; посетители видят файл только у опубликованной редакции.')}</p>
      {local && <Notice tone="error" live><p>{local}</p></Notice>}
      <FormError error={error} />
      {step && <p role="status" className="small">{step}</p>}
      <div><button className="btn btn-primary" type="submit" disabled={!!step}>{t('Загрузить файл')}</button></div>
    </form>
  );
}

function FileCard({ file, branchId, me, published, onChanged }: { file: CmsFile; branchId: string | null; me: string; published: boolean; onChanged(): void }) {
  const { t, formatDate } = useI18n();
  const staff = useStaff();
  const id = useId();
  const [reason, setReason] = useState('');
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState('');
  const [error, setError] = useState<unknown>(null);
  const own = file.uploaderId === me;
  const can = (p: string) => staff.can(p, branchId);
  async function act(action: string, body: Record<string, unknown>) {
    setBusy(true); setError(null); setLocal('');
    try { await apiSend(`/admin/material-files/${file.id}/${action}`, 'POST', { expectedUpdatedAt: file.updatedAt, ...body }); setReason(''); onChanged(); }
    catch (err) { setError(err); onChanged(); }
    finally { setBusy(false); }
  }
  const needReason = (then: () => void) => () => { if (reason.trim().length < 3) { setLocal(t('Укажите основание решения.')); return; } then(); };
  return (
    <li className="card card-flat stack upload-card">
      <div className="row spread"><strong className="upload-name">{file.name}</strong><span className={`badge badge-${stateBadge[file.state]}`}>{t(stateLabel[file.state])}</span></div>
      <p className="small muted">{file.mimeType === DOCX ? 'DOCX' : file.mimeType} · {formatBytes(file.expectedBytes)} · {formatDate(file.createdAt)}{own ? ` · ${t('ваша загрузка')}` : ''}</p>
      <dl className="props small">
        <div><dt>{t('Источник')}</dt><dd>{file.sourceLabel} · {file.sourceVersion}</dd></div>
        <div><dt>{t('Права на файл')}</dt><dd>{file.rights}</dd></div>
        <div><dt>{t('Происхождение файла')}</dt><dd>{file.sourceNote}</dd></div>
        <div><dt>{t('Контрольная сумма')}</dt><dd className="mono upload-hash">{file.expectedSha256}</dd></div>
        {file.failureCode && <div><dt>{t('Код ошибки')}</dt><dd className="mono">{file.failureCode}</dd></div>}
      </dl>
      <p className="small">{file.inspection.fullFormatParsing ? `${t('Разбор файла пройден')} · ${file.inspection.parser ?? ''}` : t('Полный разбор выполняется при одобрении.')} · {t('Антивирус не подключён: проверяются формат, сигнатура и контрольная сумма.')}</p>
      {['QUARANTINED', 'APPROVED', 'REJECTED', 'PUBLISHED'].includes(file.state) && <p className="small"><a href={`/api/admin/material-files/${file.id}/content`} download>{t('Скачать оригинал для проверки')}</a></p>}

      {file.state === 'QUARANTINED' && !own && can('content.review') && <fieldset className="stack upload-review">
        <legend>{t('Проверка файла')}</legend>
        <div className="field"><label htmlFor={`${id}-reason`}>{t('Основание решения')}</label><input id={`${id}-reason`} className="input" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
        <label className="row checkbox-row"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} /> {t('Права на публикацию копии проверены')}</label>
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={needReason(() => { if (!rights) { setLocal(t('Подтвердите права на публикацию копии.')); return; } void act('review', { decision: 'APPROVE', rightsConfirmed: true, reason: reason.trim() }); })}>{t('Одобрить')}</button>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={needReason(() => void act('review', { decision: 'REJECT', reason: reason.trim() }))}>{t('Отклонить')}</button>
        </div>
      </fieldset>}
      {file.state === 'QUARANTINED' && own && <p className="small muted">{t('Проверяет и одобряет файл другой сотрудник.')}</p>}
      {['APPROVED', 'PUBLISHED'].includes(file.state) && can('content.publish') && <div className="stack">
        <div className="field"><label htmlFor={`${id}-pub`}>{t('Основание решения')}</label><input id={`${id}-pub`} className="input" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
        <div className="row">
          {file.state === 'APPROVED' && <button type="button" className="btn btn-primary btn-sm" disabled={busy || !published} onClick={needReason(() => void act('publish', { reason: reason.trim() }))}>{t('Опубликовать файл')}</button>}
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={needReason(() => void act('withdraw', { reason: reason.trim() }))}>{t('Снять с публикации')}</button>
        </div>
        {file.state === 'APPROVED' && !published && <p className="small muted">{t('Опубликовать файл можно после публикации этой редакции.')}</p>}
      </div>}
      {['FAILED', 'RECEIVING'].includes(file.state) && own && <div><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act('retry', {})}>{t('Повторить передачу')}</button></div>}
      {local && <Notice tone="error" live><p>{local}</p></Notice>}
      <FormError error={error} />
    </li>
  );
}

/** Files of one CMS item; new files attach to the given revision. */
export function CmsAttachments({ itemId, branchId, revision }: { itemId: string; branchId: string | null; revision: { id: string; status: string } | undefined }) {
  const { t } = useI18n();
  const staff = useStaff();
  const [items, setItems] = useState<CmsFile[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setItems((await apiGet<{ items: CmsFile[] }>(`/admin/content/${encodeURIComponent(itemId)}/attachments`)).items); } catch (e) { setError(e); }
  }, [itemId]);
  useEffect(() => { void load(); }, [load]);
  const writable = staff.can('content.write', branchId) && revision && ['DRAFT', 'CHANGES_REQUESTED', 'PUBLISHED'].includes(revision.status);
  const mine = items?.filter(f => !revision || f.revisionId === revision.id) ?? [];
  const other = items?.filter(f => revision && f.revisionId !== revision.id) ?? [];
  return (
    <section className="stack" aria-labelledby="cms-files-title">
      <h2 id="cms-files-title">{t('Файлы материала')}</h2>
      {writable && revision && <NewFile itemId={itemId} revisionId={revision.id} onDone={() => void load()} />}
      {error ? <ErrorNotice error={error} onRetry={() => void load()} />
        : !items ? <Loading rows={1} />
          : !items.length ? <p className="muted">{t('Файлы ещё не загружались.')}</p>
            : <>
              <ul className="result-list upload-list">{mine.map(f => <FileCard key={f.id} file={f} branchId={branchId} me={staff.id} published={revision?.status === 'PUBLISHED'} onChanged={() => void load()} />)}</ul>
              {other.length > 0 && <details><summary>{t('Файлы других редакций')} ({other.length})</summary>
                <ul className="result-list upload-list">{other.map(f => <FileCard key={f.id} file={f} branchId={branchId} me={staff.id} published={false} onChanged={() => void load()} />)}</ul>
              </details>}
            </>}
    </section>
  );
}
