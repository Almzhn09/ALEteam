'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading } from '@/components/ui';

interface AuditEvent { id: string; actorId: string; action: string; entityId: string; createdAt: string }
const PAGE_SIZE = 30;
export default function AuditPage() {
  const { t, formatDate } = useI18n();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AuditEvent[]; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => { setData(null); setError(null); try { setData(await apiGet(`/admin/audit?page=${page}&pageSize=${PAGE_SIZE}`)); } catch (e) { setError(e); } }, [page]);
  useEffect(() => { void load(); }, [load]);
  return <>
    <h1 style={{ margin: 0 }}>{t('Журнал действий')}</h1>
    {error ? <ErrorNotice error={error} onRetry={() => void load()} /> : !data ? <Loading /> : !data.items.length ? <p className="muted">{t('Записей нет.')}</p> : <>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t('Время')}</th><th scope="col">{t('Действие')}</th><th scope="col">{t('Сотрудник')}</th><th scope="col">{t('Объект')}</th></tr></thead>
        <tbody>{data.items.map(e => <tr key={e.id}><td>{formatDate(e.createdAt)}</td><td className="mono">{e.action}</td><td className="mono small">{e.actorId}</td><td className="mono small">{e.entityId}</td></tr>)}</tbody>
      </table></div>
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← {t('Назад')}</button>
        <span className="small">{t('Страница {n}', { n: page })}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage(p => p + 1)}>{t('Вперёд')} →</button>
      </div>
    </>}
  </>;
}
