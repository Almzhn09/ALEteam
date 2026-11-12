'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { contentKinds, type ContentKind, type Page, type StaffContentItem } from '@/contracts/cms';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Pagination } from '@/components/ui';
import { useStaff } from '../AdminShell';
import { StateBadge, kindLabel } from '../editorial';

const PAGE_SIZE = 20;
export default function AdminContentPage() {
  const { t } = useI18n();
  const staff = useStaff();
  const [kind, setKind] = useState<ContentKind | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<StaffContentItem> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const id = useId();
  const load = useCallback(async () => {
    setData(null); setError(null);
    try { setData(await apiGet<Page<StaffContentItem>>(`/admin/content?page=${page}&pageSize=${PAGE_SIZE}${kind ? `&kind=${kind}` : ''}`)); } catch (e) { setError(e); }
  }, [page, kind]);
  useEffect(() => { void load(); }, [load]);
  return <>
    <div className="row spread"><h1 style={{ margin: 0 }}>{t('Материалы')}</h1>{staff.grants.some(g => g.permission === 'content.write') && <Link className="btn btn-primary" href="/admin/content/new">{t('Создать материал')}</Link>}</div>
    <div className="field" style={{ maxWidth: 320 }}><label htmlFor={id}>{t('Тип материала')}</label>
      <select id={id} className="select" value={kind} onChange={e => { setPage(1); setKind(e.target.value as ContentKind | ''); }}><option value="">{t('Все типы')}</option>{contentKinds.map(k => <option key={k} value={k}>{t(kindLabel[k])}</option>)}</select></div>
    {error ? <ErrorNotice error={error} onRetry={() => void load()} /> : !data ? <Loading /> : !data.items.length ? <p className="muted">{t('Материалов пока нет.')}</p> : <>
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t('Заголовок')}</th><th scope="col">{t('Тип')}</th><th scope="col">{t('Языки и состояния')}</th></tr></thead>
        <tbody>{data.items.map(item => {
          const latest = (['ru', 'kk', 'en'] as const).flatMap(l => item.revisions.find(r => r.locale === l) ?? []);
          return <tr key={item.id}>
            <td><Link href={`/admin/content/${item.id}`}>{latest[0]?.payload.title ?? item.slug}</Link><div className="small muted mono">{item.slug}</div></td>
            <td>{t(kindLabel[item.kind])}</td>
            <td><div className="row" style={{ gap: 'var(--space-1)' }}>{latest.map(r => <span key={r.id} className="row" style={{ gap: 4 }}><span className="small mono">{r.locale.toUpperCase()}</span><StateBadge status={r.status} /></span>)}</div></td>
          </tr>;
        })}</tbody>
      </table></div>
      {data.total > PAGE_SIZE && <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← {t('Назад')}</button>
        <span className="small">{t('Страница {n}', { n: page })}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage(p => p + 1)}>{t('Вперёд')} →</button>
      </div>}
    </>}
  </>;
}
