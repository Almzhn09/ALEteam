'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ContentItem, ContentKind, Page } from '@/contracts/api';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { DemoBadge, ErrorNotice, Loading, Pagination, Ru } from '@/components/ui';

const PAGE_SIZE = 10;
const isExternal = (url: string | null): url is string => !!url && /^https?:\/\//i.test(url);

export function News() {
  const { t, formatDay } = useI18n();
  const params = useSearchParams();
  const kind: ContentKind = params.get('kind') === 'collections' ? 'COLLECTION' : 'NEWS';
  const pageParam = Number(params.get('page'));
  const page = Number.isInteger(pageParam) && pageParam >= 1 && pageParam <= 10000 ? pageParam : 1;
  const [data, setData] = useState<Page<ContentItem> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const href = (k: ContentKind, p = 1) => {
    const q = new URLSearchParams(); if (k === 'COLLECTION') q.set('kind', 'collections'); if (p > 1) q.set('page', String(p));
    return `/news${q.size ? `?${q}` : ''}`;
  };

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null);
    apiGet<Page<ContentItem>>(`/content?kind=${kind}&page=${page}&pageSize=${PAGE_SIZE}`, controller.signal)
      .then(setData, e => { if (e?.name !== 'AbortError') setError(e); });
    return () => controller.abort();
  }, [kind, page, attempt]);

  return (
    <div className="stack">
      <nav aria-label={t('Разделы новостей')}>
        <div className="tabs">
          <Link href={href('NEWS')} aria-current={kind === 'NEWS' ? 'page' : undefined}>{t('Новости архива')}</Link>
          <Link href={href('COLLECTION')} aria-current={kind === 'COLLECTION' ? 'page' : undefined}>{t('Подборки')}</Link>
        </div>
      </nav>
      <p className="muted small">{kind === 'NEWS'
        ? t('Заголовки и даты с официального сайта архива. Тексты и фотографии не копируются: откройте новость на сайте архива.')
        : t('Учебные подборки из демонстрационных записей каталога.')}</p>
      {error ? <ErrorNotice error={error} onRetry={() => setAttempt(a => a + 1)} />
        : !data ? <Loading label={t('Загрузка новостей')} />
        : data.items.length === 0 ? <div className="card card-flat empty"><h2>{t('Пока ничего не опубликовано')}</h2></div>
        : <>
          <ul className="result-list">
            {data.items.map(item => (
              <li key={item.id} className="card card-flat">
                <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                  <time className="small muted" dateTime={item.publishedAt}>{formatDay(item.publishedAt)}</time>
                  <DemoBadge show={item.isDemo} />
                </div>
                <h2 style={{ fontSize: '1.1rem', marginBottom: 'var(--space-2)' }}><Ru>{item.title}</Ru></h2>
                {item.summary && <Ru as="p" className="small muted">{item.summary}</Ru>}
                {item.documents.length > 0 && (
                  <ul style={{ margin: '0 0 var(--space-2)', paddingLeft: 'var(--space-5)' }}>
                    {item.documents.map(d => <li key={d.id}><Link href={`/documents/${encodeURIComponent(d.id)}`}><Ru>{d.title}</Ru></Link> <span className="muted small">· {d.year}</span></li>)}
                  </ul>
                )}
                {isExternal(item.sourceUrl) && (
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Читать на сайте архива')}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={p => href(kind, p)} />
        </>}
    </div>
  );
}
