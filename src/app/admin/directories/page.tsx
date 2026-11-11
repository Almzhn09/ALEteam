'use client';
// R-F03: reference directories (fonds, newspapers) — source edition, counts, repeat-safe import check and
// visibility. The import is the fixed verified package; nothing here edits individual source rows.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../AdminShell';

interface Dataset { id: string; kind: string; title: string; isPublic: boolean; sourceSha256: string; createdAt: string; source: { edition?: string; asOf?: string | null; notes?: string }; _count: { entries: number } }
interface ImportReport { dryRun: boolean; total: number; sets: { id: string; kind: string; count: number; state: 'unchanged' | 'create' | 'imported' }[] }
const stateLabel = { unchanged: 'Без изменений', create: 'Будет создан', imported: 'Импортирован' } as const;

export default function DirectoriesAdmin() {
  const { t, formatDate } = useI18n();
  const staff = useStaff();
  const [items, setItems] = useState<Dataset[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try { setItems((await apiGet<{ items: Dataset[] }>('/admin/directories')).items); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const can = (p: string) => staff.can(p, null);
  async function run(dryRun: boolean) {
    setBusy(true); setActionError(null);
    try { setReport(await apiSend<ImportReport>('/admin/directories/import', 'POST', { package: 'archive-20261110', dryRun })); await load(); }
    catch (e) { setActionError(e); } finally { setBusy(false); }
  }
  async function visibility(set: Dataset) {
    setBusy(true); setActionError(null);
    try { await apiSend(`/admin/directories/${encodeURIComponent(set.id)}/visibility`, 'POST', { expectedVisible: set.isPublic, isPublic: !set.isPublic }); await load(); }
    catch (e) { setActionError(e); await load(); } finally { setBusy(false); }
  }
  return <>
    <h1>{t('Справочники')}</h1>
    <p className="lead">{t('Справочник фондов и перечень газет из проверенного пакета источников. Строки не превращаются в документы каталога.')}</p>
    {error ? <ErrorNotice error={error} onRetry={() => void load()} /> : !items ? <Loading rows={2} />
      : !items.length ? <p className="muted">{t('Справочники ещё не импортированы.')}</p>
        : <ul className="result-list upload-list">{items.map(set => <li key={set.id} className="card card-flat stack">
          <div className="row spread"><strong>{set.title}</strong><span className={`badge ${set.isPublic ? 'badge-PUBLISHED' : 'badge-ARCHIVED'}`}>{t(set.isPublic ? 'Опубликован' : 'Скрыт')}</span></div>
          <dl className="props small">
            <div><dt>{t('Строк')}</dt><dd>{set._count.entries}</dd></div>
            {set.source.edition && <div><dt>{t('Версия источника')}</dt><dd>{set.source.edition}</dd></div>}
            {set.source.notes && <div><dt>{t('Примечание')}</dt><dd>{set.source.notes}</dd></div>}
            <div><dt>{t('Контрольная сумма')}</dt><dd className="mono upload-hash">{set.sourceSha256}</dd></div>
            <div><dt>{t('Создан')}</dt><dd>{formatDate(set.createdAt)}</dd></div>
          </dl>
          <div className="row">
            <Link className="btn btn-secondary btn-sm" href={set.kind === 'fund' ? '/directories/funds' : '/directories/newspapers'}>{t('Открыть на сайте')}</Link>
            {can('catalog.write') && can('content.publish') && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void visibility(set)}>{t(set.isPublic ? 'Скрыть с сайта' : 'Показать на сайте')}</button>}
          </div>
        </li>)}</ul>}
    {can('catalog.write') && <section className="stack card card-flat" aria-labelledby="import-title">
      <h2 id="import-title" className="h3">{t('Импорт пакета источников')}</h2>
      <p className="small muted">{t('Проверка показывает, что изменится. Повтор того же пакета ничего не дублирует; другой вариант того же источника вызывает конфликт, а не перезапись.')}</p>
      <div className="row">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(true)}>{t('Проверить пакет')}</button>
        {can('content.publish') && report?.dryRun && report.sets.some(s => s.state === 'create') && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(false)}>{t('Импортировать')}</button>}
      </div>
      {report && <Notice tone={report.dryRun ? 'info' : 'success'} live title={t(report.dryRun ? 'Результат проверки' : 'Импорт выполнен')}>
        <ul className="issue-list">{report.sets.map(s => <li key={s.id}>{s.id}: {s.count} · {t(stateLabel[s.state])}</li>)}</ul>
      </Notice>}
      <FormError error={actionError} />
    </section>}
  </>;
}
