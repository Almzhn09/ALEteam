'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { DocumentSummary, DocumentType, Page } from '@/contracts/api';
import { apiGet } from '@/lib/api';
import { typeLabel } from '@/lib/labels';
import { DemoBadge, ErrorNotice, Loading, Ru } from '@/components/ui';
import { useI18n } from '@/lib/lang';

const PAGE_SIZE = 50;
const MAX_ITEMS = 500;

export function Timeline() {
  const { t } = useI18n();
  const [items, setItems] = useState<DocumentSummary[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [type, setType] = useState<DocumentType | ''>('');
  const id = useId();

  // The catalog API is paginated (max 50); the timeline reads pages up to a fixed cap.
  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null); setItems(null);
    try {
      const all: DocumentSummary[] = [];
      for (let page = 1; ; page++) {
        const r = await apiGet<Page<DocumentSummary>>(`/documents?sort=year_asc&pageSize=${PAGE_SIZE}&page=${page}`, signal);
        all.push(...r.items);
        if (all.length >= r.total || r.items.length === 0) { setTruncated(false); break; }
        if (all.length >= MAX_ITEMS) { setTruncated(true); break; }
      }
      setItems(all);
    } catch (e) { if ((e as Error)?.name !== 'AbortError') setError(e); }
  }, []);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);

  const decades = useMemo(() => {
    const map = new Map<number, DocumentSummary[]>();
    for (const d of items ?? []) {
      if (type && d.type !== type) continue;
      const decade = Math.floor(d.year / 10) * 10;
      map.set(decade, [...(map.get(decade) ?? []), d]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [items, type]);

  if (error) return <ErrorNotice error={error} onRetry={() => void load()} />;
  if (!items) return <Loading label={t('Загрузка шкалы')} />;

  return (
    <div className="stack">
      <div className="row">
        <label htmlFor={id} className="label">{t('Тип документа')}</label>
        <select id={id} className="select" style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value as DocumentType | '')}>
          <option value="">{t('Все типы')}</option>
          {Object.entries(typeLabel).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
      </div>
      {truncated && <p className="small muted">{t('Показаны первые {n} материалов. Для точного отбора используйте каталог.', { n: MAX_ITEMS })} <Link href="/catalog">{t('Перейти в каталог')}</Link></p>}
      {decades.length === 0 ? <p className="muted">{t('Нет материалов для выбранного типа.')}</p> : <>
        <nav aria-label={t('Десятилетия')} className="decade-nav">
          {decades.map(([decade, list]) => <a key={decade} href={`#decade-${decade}`}>{t('{n}-е', { n: decade })} <span className="muted">({list.length})</span></a>)}
        </nav>
        <ol className="timeline">
          {decades.map(([decade, list]) => (
            <li key={decade} id={`decade-${decade}`} className="timeline-decade" tabIndex={-1} aria-labelledby={`${id}-${decade}`}>
              <h2 id={`${id}-${decade}`} className="timeline-year">{t('{n}-е', { n: decade })}</h2>
              <ul className="timeline-items">
                {list.map(d => (
                  <li key={d.id} className="card card-flat">
                    <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                      <strong className="mono">{d.year}</strong>
                      <span className="badge badge-neutral">{t(typeLabel[d.type])}</span>
                      <DemoBadge show={d.isDemo} />
                    </div>
                    <Link href={`/documents/${encodeURIComponent(d.id)}`}><Ru>{d.title}</Ru></Link>
                    <p className="small muted" style={{ margin: 0 }}>{t('Шифр:')} <span className="mono">{d.reference}</span></p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </>}
    </div>
  );
}
