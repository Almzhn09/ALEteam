'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../../../AdminShell';

interface Issue { row: number; code: string }
interface Preview {
  id: string; branchId: string; authorId: string; sourceNamespace: string; format: string; sourceHash: string; catalogBatchId: string | null; createdAt: string;
  page: number; pageSize: number;
  result: { mode: 'funds' | 'documents'; sheet: string; nonEmptyRows: number; mappedRows: { row: number; values: Record<string, unknown> }[];
    errors: Issue[]; warnings: Issue[]; errorCount: number; warningCount: number; stagingAvailable: boolean; limitations: string[] };
}
// Codes the server returns for rows; unknown codes are shown as-is so nothing is hidden.
const codeLabel: Record<string, string> = {
  POSSIBLE_HISTORICAL_RENAME_REQUIRES_REVIEW: 'Тот же номер фонда с другим названием — сверить вручную, это не подтверждённое переименование',
  REPEATED_FUND_ROW: 'Повтор той же строки фонда',
  STABLE_SOURCE_ID_REQUIRED_FOR_MIGRATION: 'Нет устойчивого идентификатора для переноса',
  FUND_NUMBER_AND_NAME_REQUIRED: 'Нужны номер и название фонда',
  STABLE_SOURCE_ID_REQUIRED: 'Нет идентификатора в источнике',
  DUPLICATE_SOURCE_ID: 'Повтор идентификатора в источнике',
  INTEGER_REQUIRED: 'Год или число листов должны быть целым числом',
  FORMULA_REQUIRES_REVIEW: 'В ячейке формула — проверьте вручную',
  CELL_ERROR_REQUIRES_REVIEW: 'В ячейке ошибка таблицы',
  EXCEL_DATE_REQUIRED: 'В ячейке нет даты Excel',
  BATCH_LIMIT_100: 'Больше 100 документов в одном пакете',
};
const PAGE = 50;

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, formatDate } = useI18n();
  const staff = useStaff();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try { setData((await apiGet<{ item: Preview }>(`/admin/file-previews/${encodeURIComponent(id)}?page=${page}&pageSize=${PAGE}`)).item); } catch (e) { setError(e); }
  }, [id, page]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorNotice error={error} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  const r = data.result;
  const own = data.authorId === staff.id;
  const label = (code: string) => codeLabel[code] ? t(codeLabel[code]) : code;
  const fields = [...new Set(r.mappedRows.flatMap(row => Object.keys(row.values)))];
  const pages = Math.max(1, Math.ceil(Math.max(r.nonEmptyRows, r.errorCount, r.warningCount) / PAGE));
  async function stage() {
    setBusy(true); setActionError(null);
    try { const res = await apiSend<{ item: { id: string } }>(`/admin/file-previews/${id}/stage`, 'POST', {}); router.push(`/admin/imports/${res.item.id}`); }
    catch (e) { setActionError(e); setBusy(false); }
  }
  async function remove() {
    setBusy(true); setActionError(null);
    try { await apiSend(`/admin/file-previews/${id}`, 'DELETE', {}); router.push('/admin/imports'); }
    catch (e) { setActionError(e); setBusy(false); }
  }
  return <>
    <p className="small"><Link href="/admin/imports">← {t('Импорт каталога')}</Link></p>
    <h1>{t('Предпросмотр таблицы')}</h1>
    <dl className="props">
      <div><dt>{t('Идентификатор набора')}</dt><dd className="mono">{data.sourceNamespace}</dd></div>
      <div><dt>{t('Формат и лист')}</dt><dd>{data.format.toUpperCase()} · {r.sheet}</dd></div>
      <div><dt>{t('Непустых строк')}</dt><dd>{r.nonEmptyRows}</dd></div>
      <div><dt>{t('Контрольная сумма')}</dt><dd className="mono upload-hash">{data.sourceHash}</dd></div>
      <div><dt>{t('Создан')}</dt><dd>{formatDate(data.createdAt)}</dd></div>
    </dl>
    {r.mode === 'funds' && <Notice tone="info" title={t('Только предпросмотр')}><p>{t('Строки фондов не уникальны и не создают описи, дела и документы. Совпадение номера с другим названием — кандидат на сверку, а не утверждённое переименование.')}</p></Notice>}
    <div className="row">
      <span className={`badge ${r.errorCount ? 'badge-REJECTED' : 'badge-PUBLISHED'}`}>{t('Ошибок')}: {r.errorCount}</span>
      <span className={`badge ${r.warningCount ? 'badge-CHANGES_REQUESTED' : 'badge-neutral'}`}>{t('Предупреждений')}: {r.warningCount}</span>
    </div>
    {(r.errors.length > 0 || r.warnings.length > 0) && <section className="stack" aria-labelledby="issues-title">
      <h2 id="issues-title">{t('Замечания по строкам')}</h2>
      <ul className="issue-list">
        {r.errors.map((e, i) => <li key={`e${i}`}><span className="badge badge-REJECTED">{t('Ошибка')}</span> {e.row ? `${t('Строка')} ${e.row}: ` : ''}{label(e.code)}</li>)}
        {r.warnings.map((w, i) => <li key={`w${i}`}><span className="badge badge-CHANGES_REQUESTED">{t('Предупреждение')}</span> {t('Строка')} {w.row}: {label(w.code)}</li>)}
      </ul>
    </section>}
    <section className="stack" aria-labelledby="rows-title">
      <h2 id="rows-title">{t('Сопоставленные строки')}</h2>
      {r.mappedRows.length === 0 ? <p className="muted">{t('На этой странице нет сопоставленных строк.')}</p>
        : <div className="table-wrap"><table className="table table-words">
          <thead><tr><th scope="col">{t('Строка')}</th>{fields.map(f => <th scope="col" key={f} className="mono">{f}</th>)}</tr></thead>
          <tbody>{r.mappedRows.map(row => <tr key={row.row}><td>{row.row}</td>{fields.map(f => <td key={f}>{row.values[f] === null || row.values[f] === undefined ? '—' : String(row.values[f])}</td>)}</tr>)}</tbody>
        </table></div>}
      {pages > 1 && <div className="row">
        <button className="btn btn-secondary btn-sm" type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('Назад')}</button>
        <span className="small">{t('Страница')} {page} / {pages}</span>
        <button className="btn btn-secondary btn-sm" type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>{t('Далее')}</button>
      </div>}
    </section>
    <FormError error={actionError} />
    {own && <div className="row">
      {data.catalogBatchId ? <Link className="btn btn-primary" href={`/admin/imports/${data.catalogBatchId}`}>{t('Открыть пакет импорта')}</Link>
        : r.stagingAvailable && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void stage()}>{t('Передать в пакет импорта')}</button>}
      {!data.catalogBatchId && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void remove()}>{t('Удалить предпросмотр')}</button>}
    </div>}
    {!r.stagingAvailable && r.mode === 'documents' && <p className="small muted">{t('Передать в пакет можно после исправления ошибок: загрузите исправленную таблицу заново.')}</p>}
  </>;
}
