'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Page, StaffContentItem } from '@/contracts/cms';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading } from '@/components/ui';
import { StateBadge, kindLabel } from '../editorial';

const MAX_PAGES = 10;
export default function QueuePage() {
  const { t, formatDate } = useI18n();
  const [items, setItems] = useState<StaffContentItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  // The API has no status filter yet, so the queue is assembled from up to 500 materials.
  const load = useCallback(async () => {
    setItems(null); setError(null);
    try {
      const all: StaffContentItem[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await apiGet<Page<StaffContentItem>>(`/admin/content?page=${page}&pageSize=50`);
        all.push(...r.items);
        if (all.length >= r.total || !r.items.length) break;
      }
      setItems(all);
    } catch (e) { setError(e); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <ErrorNotice error={error} onRetry={() => void load()} />;
  if (!items) return <Loading />;
  const rows = items.flatMap(item => (['ru', 'kk', 'en'] as const).flatMap(l => item.revisions.find(r => r.locale === l && ['IN_REVIEW', 'APPROVED'].includes(r.status)) ?? []).map(r => ({ item, r })))
    .sort((a, b) => a.r.updatedAt.localeCompare(b.r.updatedAt));
  return <>
    <h1 style={{ margin: 0 }}>{t('Очередь согласования')}</h1>
    {!rows.length ? <p className="muted">{t('Нет материалов, ожидающих решения.')}</p> : (
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t('Заголовок')}</th><th scope="col">{t('Тип')}</th><th scope="col">{t('Язык')}</th><th scope="col">{t('Состояние')}</th><th scope="col">{t('Обновлено')}</th></tr></thead>
        <tbody>{rows.map(({ item, r }) => <tr key={r.id}><td><Link href={`/admin/content/${item.id}`}>{r.payload.title}</Link></td><td>{t(kindLabel[item.kind])}</td><td className="mono">{r.locale.toUpperCase()}</td><td><StateBadge status={r.status} /></td><td>{formatDate(r.updatedAt)}</td></tr>)}</tbody>
      </table></div>
    )}
  </>;
}
