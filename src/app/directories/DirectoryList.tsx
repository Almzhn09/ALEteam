'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { FundDirectoryEntry, NewspaperEntry, RegistrySource } from '@/contracts/real-content';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { FundRow, NewspaperRow } from '@/components/Registry';
import { Breadcrumbs, ErrorNotice, Loading, Pagination } from '@/components/ui';
import { directoryKey } from './shared';

type Kind = 'funds' | 'newspapers';
export interface Result { items: (FundDirectoryEntry | NewspaperEntry)[]; total: number; page: number; pageSize: number; sourceVersions: RegistrySource[] }
const PAGE_SIZE = 20;

/** Searchable, paginated reference directory; the address keeps q/page/sort so results can be shared. */
// The server renders the first result page (initial + its query key), so the list is visible before hydration.
export function DirectoryList({ kind, initial = null, initialKey = '' }: { kind: Kind; initial?: Result | null; initialKey?: string }) {
  const { t, formatDay } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const q = (params.get('q') ?? '').slice(0, 200);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sort = params.get('sort') === 'title' ? 'title' : 'source';
  const key = directoryKey(q, page, sort);
  const [text, setText] = useState(q);
  const [data, setData] = useState<Result | null>(initial && initialKey === key ? initial : null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, retry] = useState(0);
  const [served] = useState(initialKey);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (attempt === 0 && key === served && initial) return;
    const abort = new AbortController();
    setError(null); setData(null);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (q) query.set('q', q);
    apiGet<Result>(`/directories/${kind}?${query}`, abort.signal).then(setData, e => { if (e.name !== 'AbortError') setError(e); });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key, attempt]);
  const href = (next: { q?: string; page?: number; sort?: string }) => {
    const query = new URLSearchParams();
    const nq = next.q ?? q; const ns = next.sort ?? sort; const np = next.page ?? 1;
    if (nq) query.set('q', nq); if (ns !== 'source') query.set('sort', ns); if (np > 1) query.set('page', String(np));
    return `${path}${query.size ? `?${query}` : ''}`;
  };
  function submit(e: FormEvent) { e.preventDefault(); router.push(href({ q: text.trim(), page: 1 })); }
  const title = kind === 'funds' ? 'Справочник фондов' : 'Перечень хранения газет';
  const exportQuery = new URLSearchParams(q ? { q } : {});
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ href: '/directories', label: t('Справочники фондов') }, { label: t(title) }]} />
      <header className="page-head">
        <h1>{t(title)}</h1>
        <p className="lead">{t(kind === 'funds' ? 'Учётные номера фондов и их названия в разные периоды, как в источнике.' : 'Газеты, годы и количество единиц хранения, как в перечне источника.')}</p>
      </header>
      <form className="toolbar-search" role="search" onSubmit={submit} aria-label={t('Поиск в справочнике')}>
        <label htmlFor="directory-q" className="visually-hidden">{t('Поиск в справочнике')}</label>
        <input id="directory-q" className="input" type="search" value={text} maxLength={200} onChange={e => setText(e.target.value)} placeholder={t(kind === 'funds' ? 'Название или номер фонда' : 'Название газеты или издатель')} />
        <button className="btn btn-primary" type="submit">{t('Найти')}</button>
      </form>
      <div className="results-bar">
        <p role="status" className="small">{data ? t('Найдено: {n}', { n: data.total }) : ' '}</p>
        <div className="row">
          <label htmlFor="directory-sort" className="small">{t('Порядок')}</label>
          <select id="directory-sort" className="select select-inline" value={sort} onChange={e => router.push(href({ sort: e.target.value, page: 1 }))}>
            <option value="source">{t('Как в источнике')}</option>
            <option value="title">{t('По названию')}</option>
          </select>
          <a className="btn btn-secondary btn-sm" href={`/api/directories/${kind}/export${exportQuery.size ? `?${exportQuery}` : ''}`} download>{t('Скачать JSON')}</a>
        </div>
      </div>
      {error ? <ErrorNotice error={error} onRetry={() => retry(a => a + 1)} />
        : !data ? <Loading rows={4} />
          : data.items.length === 0 ? <p className="muted">{q ? t('По этому запросу ничего не найдено. Проверьте написание или попробуйте номер фонда целиком.') : t('Справочник пока не опубликован.')}</p>
            : <ul className="registry-list">{data.items.map(item => item.kind === 'fund' ? <FundRow key={item.id} entry={item} /> : <NewspaperRow key={item.id} entry={item as NewspaperEntry} />)}</ul>}
      {data && data.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={p => href({ page: p })} />}
      {data?.sourceVersions?.length ? <aside className="source-note small" aria-label={t('Источник')}>
        <strong>{t('Источник')}</strong>
        {data.sourceVersions.map(s => <p key={s.id} lang="ru">{s.title} · {s.edition}{s.asOf ? ` · ${formatDay(s.asOf)}` : ''}. {s.notes}</p>)}
        <p>{t('Версия справочника указана у источника. Строка справочника не является цифровой копией дела.')}</p>
      </aside> : null}
      <p><Link href="/directories">← {t('Все справочники')}</Link></p>
    </div>
  );
}
