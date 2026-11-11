'use client';
// R-F02: one search over site materials and both directories (/api/search). Each hit says what it is:
// a site material, a fonds directory number or a newspaper line — never a scan that does not exist.
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { SearchResult, NewspaperEntry, FundDirectoryEntry } from '@/contracts/real-content';
import { apiGet } from '@/lib/api';
import { materialLink } from '@/lib/discovery-links';
import { useI18n } from '@/lib/lang';
import { FundRow, KindBadge, NewspaperRow } from '@/components/Registry';
import { FollowTopic } from '@/components/TopicSubscriptions';
import { Breadcrumbs, ErrorNotice, Loading, Pagination } from '@/components/ui';
import { sampleQueries } from '@/lib/search-samples';

const SCOPES = ['all', 'cms', 'fund', 'newspaper'] as const;
type Scope = typeof SCOPES[number];
const scopeLabel: Record<Scope, string> = { all: 'Всё', cms: 'Материалы сайта', fund: 'Справочник фондов', newspaper: 'Перечень газет' };
const PAGE_SIZE = 20;

function snippetOf(text: string, q: string) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = q ? flat.toLowerCase().indexOf(q.toLowerCase()) : -1;
  const start = at > 60 ? flat.lastIndexOf(' ', at - 40) + 1 : 0;
  const cut = flat.slice(start, start + 240);
  return (start > 0 ? '…' : '') + cut + (start + 240 < flat.length ? '…' : '');
}

export function SearchPage() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const q = (params.get('q') ?? '').trim().slice(0, 200);
  const raw = params.get('scope');
  const scope: Scope = SCOPES.includes(raw as Scope) ? raw as Scope : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [text, setText] = useState(q);
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, retry] = useState(0);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (!q) { setData(null); setError(null); return; }
    const abort = new AbortController();
    setData(null); setError(null);
    const query = new URLSearchParams({ q, scope, locale: lang, page: String(page), pageSize: String(PAGE_SIZE) });
    apiGet<SearchResult>(`/search?${query}`, abort.signal).then(setData, e => { if (e.name !== 'AbortError') setError(e); });
    return () => abort.abort();
  }, [q, scope, page, lang, attempt]);
  const href = (next: { q?: string; scope?: Scope; page?: number }) => {
    const query = new URLSearchParams();
    const nq = next.q ?? q; const ns = next.scope ?? scope; const np = next.page ?? 1;
    if (nq) query.set('q', nq); if (ns !== 'all') query.set('scope', ns); if (np > 1) query.set('page', String(np));
    return `${path}${query.size ? `?${query}` : ''}`;
  };
  function submit(e: FormEvent) { e.preventDefault(); router.push(href({ q: text.trim(), page: 1 })); }
  const counts = data?.counts;
  const countOf = (s: Scope) => !counts ? null : s === 'all' ? counts.materials + counts.funds + counts.newspapers : s === 'cms' ? counts.materials : s === 'fund' ? counts.funds : counts.newspapers;
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ label: t('Поиск') }]} />
      <header className="page-head">
        <h1>{t('Поиск')}</h1>
        <p className="lead">{t('Ищет по материалам сайта, справочнику фондов и перечню газет.')}</p>
      </header>
      <form className="toolbar-search" role="search" onSubmit={submit} aria-label={t('Поиск по сайту и справочникам')}>
        <label htmlFor="search-q" className="visually-hidden">{t('Что вы ищете')}</label>
        <input id="search-q" className="input" type="search" value={text} maxLength={200} onChange={e => setText(e.target.value)} placeholder={t('Тема, имя или название фонда')} />
        <button className="btn btn-primary" type="submit">{t('Найти')}</button>
      </form>
      {!q ? <section className="stack" aria-labelledby="examples-title">
        <h2 id="examples-title" className="h3">{t('Например')}</h2>
        <ul className="chip-list">{sampleQueries.map(e => <li key={e}><Link className="chip" lang="ru" href={href({ q: e })}>{e}</Link></li>)}</ul>
      </section> : <>
        <nav className="scope-tabs" aria-label={t('Где искать')}>
          {SCOPES.map(s => { const n = countOf(s); return <Link key={s} href={href({ scope: s })} aria-current={s === scope ? 'page' : undefined} className="scope-tab">{t(scopeLabel[s])}{n !== null && <span className="scope-count">{n}</span>}</Link>; })}
        </nav>
        {error ? <ErrorNotice error={error} onRetry={() => retry(a => a + 1)} title={t('Не удалось выполнить поиск')} />
          : !data ? <Loading rows={4} label={t('Поиск…')} />
            : data.items.length === 0 ? <div className="empty-state"><p>{t('Ничего не найдено. Попробуйте другое слово, полное название или номер фонда целиком.')}</p></div>
              : <>
                <p role="status" className="small">{t('Найдено: {n}', { n: data.total })}</p>
                <ul className="search-results">
                  {data.items.map(hit => hit.kind === 'material'
                    ? <li key={`m-${hit.material.kind}-${hit.material.id}`} className="search-hit">
                      <div className="registry-head"><KindBadge kind="material" />{hit.material.translationStatus === 'original' && <span className="small muted">{t('Материал на языке источника')}</span>}</div>
                      <h3 className="registry-title"><Link href={materialLink(hit.material)} lang={hit.material.contentLocale}>{hit.material.title}</Link></h3>
                      {hit.snippet && <p className="small search-snippet" lang={hit.material.contentLocale}>{snippetOf(hit.snippet, q)}</p>}
                    </li>
                    : hit.kind === 'fund' ? <FundRow key={`f-${hit.id}`} entry={hit as FundDirectoryEntry} showKind />
                      : <NewspaperRow key={`n-${hit.id}`} entry={hit as NewspaperEntry} showKind />)}
                </ul>
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} href={p => href({ page: p })} />
                {scope !== 'fund' && scope !== 'newspaper' && <FollowTopic selection={{ filters: { q, scope: 'cms' } }} />}
              </>}
      </>}
    </div>
  );
}
