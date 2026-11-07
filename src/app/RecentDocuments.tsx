'use client';
import { useEffect, useState } from 'react';
import type { DocumentSummary, Page } from '@/contracts/api';
import { apiGet } from '@/lib/api';
import { DocumentCard } from '@/components/DocumentCard';
import { ErrorNotice, Loading } from '@/components/ui';
import { useI18n } from '@/lib/lang';

export function RecentDocuments() {
  const { t } = useI18n();
  const [data, setData] = useState<Page<DocumentSummary> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    apiGet<Page<DocumentSummary>>('/documents?pageSize=4&sort=year_desc', controller.signal)
      .then(setData, e => { if (e?.name !== 'AbortError') setError(e); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <ErrorNotice error={error} onRetry={() => setAttempt(a => a + 1)} />;
  if (!data) return <Loading rows={2} label={t('Загрузка материалов')} />;
  if (!data.items.length) return <p className="muted">{t('В каталоге пока нет опубликованных материалов.')}</p>;
  return (
    <ul className="result-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
      {data.items.map(doc => <li key={doc.id}><DocumentCard doc={doc} /></li>)}
    </ul>
  );
}
