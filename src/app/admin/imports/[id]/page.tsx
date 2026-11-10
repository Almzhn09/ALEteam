'use client';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import type { CatalogImportDTO } from '@/contracts/imports';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../../AdminShell';
import { importStateLabel, rowActionLabel } from '../labels';

type Action = 'validate' | 'commit' | 'cancel' | 'rollback';
const done: Record<Action, string> = { validate: 'Пакет проверен заново.', commit: 'Черновики созданы. Они закрыты до обычного согласования.', cancel: 'Пакет отменён.', rollback: 'Созданные черновики откачены.' };

export default function ImportBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, formatDate } = useI18n();
  const staff = useStaff();
  const [item, setItem] = useState<CatalogImportDTO | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try { setItem((await apiGet<{ item: CatalogImportDTO }>(`/admin/imports/${encodeURIComponent(id)}`)).item); } catch (e) { setError(e); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorNotice error={error} onRetry={() => void load()} />;
  if (!item) return <Loading />;
  const canWrite = staff.can('catalog.write', item.branchId);
  async function act(action: Action) {
    if (action === 'commit' && !window.confirm(t('Создать закрытые черновики по этому пакету?'))) return;
    setBusy(true); setActionError(null); setMessage('');
    try { await apiSend(`/admin/imports/${id}/${action}`, 'POST', { expectedUpdatedAt: item!.updatedAt, digest: item!.digest }); setMessage(t(done[action])); }
    catch (e) { setActionError(e); }
    finally { setBusy(false); await load(); }
  }
  async function exportJson() {
    setActionError(null);
    try {
      const data = await apiGet<unknown>(`/admin/imports/${id}/export`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `import-${item!.sourceNamespace}-${id}.json`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setActionError(e); }
  }
  const r = item.report;
  return <>
    <p className="small"><Link href="/admin/imports">← {t('Импорт каталога')}</Link></p>
    <h1 className="mono-title">{t('Пакет')} <span className="mono">{item.sourceNamespace}</span></h1>
    <dl className="props">
      <div><dt>{t('Состояние')}</dt><dd>{t(importStateLabel[item.state])}</dd></div>
      <div><dt>{t('Создать / без изменений')}</dt><dd>{r.counts.create} / {r.counts.unchanged}</dd></div>
      <div><dt>{t('Контрольная сумма')}</dt><dd className="mono upload-hash">{item.digest}</dd></div>
      <div><dt>{t('Создан')}</dt><dd>{formatDate(item.createdAt)}</dd></div>
    </dl>
    <Notice tone="info"><p>{t('Создание черновиков не публикует материалы: карточки остаются закрытыми, цифровые копии не открываются, переводы не придумываются.')}</p></Notice>
    {!r.valid && <Notice tone="error" title={t('Пакет не прошёл проверку')}>
      <ul className="issue-list">{r.issues.slice(0, 100).map((issue, i) => <li key={i}><code>{issue.path || '—'}</code> · {issue.code}</li>)}</ul>
    </Notice>}
    {message && <Notice tone="success" live><p>{message}</p></Notice>}
    <FormError error={actionError} />
    <div className="row">
      {canWrite && item.state === 'READY' && <>
        <button className="btn btn-primary" type="button" disabled={busy || !r.valid} onClick={() => void act('commit')}>{t('Создать черновики')}</button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void act('validate')}>{t('Проверить заново')}</button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void act('cancel')}>{t('Отменить пакет')}</button>
      </>}
      {canWrite && item.state === 'VALIDATION_FAILED' && <>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void act('validate')}>{t('Проверить заново')}</button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void act('cancel')}>{t('Отменить пакет')}</button>
      </>}
      {canWrite && item.state === 'COMMITTED' && <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void act('rollback')}>{t('Откатить черновики')}</button>}
      <button className="btn btn-secondary" type="button" onClick={() => void exportJson()}>{t('Скачать контрольный JSON')}</button>
    </div>
    <section className="stack" aria-labelledby="import-rows">
      <h2 id="import-rows">{t('Строки пакета')}</h2>
      {r.rows.length === 0 ? <p className="muted">{t('В пакете нет документов.')}</p>
        : <div className="table-wrap"><table className="table table-words">
          <thead><tr><th scope="col">{t('Строка')}</th><th scope="col">{t('Идентификатор в источнике')}</th><th scope="col">{t('Действие')}</th><th scope="col">{t('Карточка')}</th></tr></thead>
          <tbody>{r.rows.map(row => <tr key={row.index}>
            <td>{row.index + 1}</td><td className="mono">{row.sourceId}</td><td>{t(rowActionLabel[row.action])}</td>
            <td>{row.documentId ? <Link href={`/admin/catalog/${row.documentId}`}>{t('Открыть')}</Link> : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}
