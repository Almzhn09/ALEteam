'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { DocumentSummary, DocumentType, Fund, Page } from '@/contracts/api';
import { apiGet } from '@/lib/api';
import { sortLabel, typeLabel } from '@/lib/labels';
import { DocumentCard } from '@/components/DocumentCard';
import { ErrorNotice, Loading, Notice, Pagination } from '@/components/ui';
import { useI18n } from '@/lib/lang';

const PAGE_SIZE = 10;
type Sort = keyof typeof sortLabel;
const TEXT_FILTERS = ['fundNumber', 'inventoryNumber', 'caseNumber', 'reference', 'author', 'organization', 'locality', 'originalLanguage', 'category', 'tag'] as const;
const ID_FILTERS = ['inventoryId', 'caseId', 'branchId'] as const;
type TextKey = typeof TEXT_FILTERS[number]; type IdKey = typeof ID_FILTERS[number];
const filterLabel: Record<TextKey, string> = { fundNumber: 'Номер фонда', inventoryNumber: 'Номер описи', caseNumber: 'Номер дела', reference: 'Архивный шифр', author: 'Автор', organization: 'Организация', locality: 'Населённый пункт', originalLanguage: 'Язык оригинала', category: 'Категория', tag: 'Тема' };
interface Filters extends Record<TextKey | IdKey, string> { q: string; fundId: string; type: DocumentType | ''; yearFrom: string; yearTo: string; sort: Sort; page: number; contentLang: string }

const isYear = (v: string) => /^\d{1,4}$/.test(v) && Number(v) >= 1 && Number(v) <= 2100;

// Read the URL defensively: invalid values are dropped instead of being sent to the API.
function fromUrl(params: URLSearchParams): { filters: Filters; dropped: boolean } {
  let dropped = false;
  const pick = (key: string, ok: (v: string) => boolean) => {
    const v = params.get(key)?.trim() ?? '';
    if (v && !ok(v)) { dropped = true; return ''; }
    return v;
  };
  const q = (params.get('q') ?? '').trim().slice(0, 200);
  const type = pick('type', v => v in typeLabel) as DocumentType | '';
  const fundId = pick('fundId', v => /^[a-zA-Z0-9_-]{1,80}$/.test(v));
  let yearFrom = pick('yearFrom', isYear); let yearTo = pick('yearTo', isYear);
  if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) { dropped = true; yearFrom = ''; yearTo = ''; }
  const sort = (pick('sort', v => v in sortLabel) || 'year_desc') as Sort;
  const pageRaw = pick('page', v => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 10000);
  const text = Object.fromEntries(TEXT_FILTERS.map(k => [k, (params.get(k) ?? '').trim().slice(0, 200)])) as Record<TextKey, string>;
  const ids = Object.fromEntries(ID_FILTERS.map(k => [k, pick(k, v => /^[a-zA-Z0-9_-]{1,80}$/.test(v))])) as Record<IdKey, string>;
  const contentLang = pick('contentLang', v => ['ru', 'kk', 'en'].includes(v));
  return { filters: { q, type, fundId, yearFrom, yearTo, sort, page: pageRaw ? Number(pageRaw) : 1, contentLang, ...text, ...ids }, dropped };
}

function toQuery(f: Partial<Filters>) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.fundId) p.set('fundId', f.fundId);
  for (const key of [...TEXT_FILTERS, ...ID_FILTERS]) if (f[key]) p.set(key, f[key]!);
  if (f.contentLang) p.set('contentLang', f.contentLang);
  if (f.type) p.set('type', f.type);
  if (f.yearFrom) p.set('yearFrom', f.yearFrom);
  if (f.yearTo) p.set('yearTo', f.yearTo);
  if (f.sort && f.sort !== 'year_desc') p.set('sort', f.sort);
  if (f.page && f.page > 1) p.set('page', String(f.page));
  return p.toString();
}

export function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const { t, lang } = useI18n();
  const { filters, dropped } = useMemo(() => fromUrl(new URLSearchParams(params.toString())), [params]);
  const urlKey = toQuery(filters);
  const contentLocale = filters.contentLang || lang;

  const textValues = (f: Filters) => Object.fromEntries(TEXT_FILTERS.map(k => [k, f[k]])) as Record<TextKey, string>;
  const [draft, setDraft] = useState({ q: filters.q, yearFrom: filters.yearFrom, yearTo: filters.yearTo, ...textValues(filters) });
  const [yearError, setYearError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [funds, setFunds] = useState<Fund[] | null>(null);
  const [data, setData] = useState<Page<DocumentSummary> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const ids = { q: useId(), from: useId(), to: useId(), type: useId(), fund: useId(), sort: useId(), yearErr: useId() };

  // Keep the form in sync when the URL changes through history navigation.
  useEffect(() => { setDraft({ q: filters.q, yearFrom: filters.yearFrom, yearTo: filters.yearTo, ...textValues(filters) }); setYearError(''); }, [urlKey]); // urlKey captures every text filter

  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ items: Fund[] }>('/funds', controller.signal).then(r => setFunds(r.items), () => setFunds([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    const api = new URLSearchParams(urlKey);
    api.delete('contentLang'); api.delete('lang'); api.set('locale', contentLocale);
    api.set('sort', filters.sort); api.set('page', String(filters.page)); api.set('pageSize', String(PAGE_SIZE));
    apiGet<Page<DocumentSummary>>(`/documents?${api}`, controller.signal)
      .then(r => { setData(r); setLoading(false); }, e => { if (e?.name !== 'AbortError') { setError(e); setLoading(false); } });
    return () => controller.abort();
  }, [urlKey, attempt, contentLocale]); // urlKey captures every filter value

  const navigate = (next: Partial<Filters>) => router.push(`/catalog?${toQuery({ ...filters, ...next, page: next.page ?? 1 })}`, { scroll: false });

  function submit(e: FormEvent) {
    e.preventDefault();
    const { yearFrom, yearTo } = draft;
    if ((yearFrom && !isYear(yearFrom)) || (yearTo && !isYear(yearTo))) return setYearError(t('Укажите год от 1 до 2100.'));
    if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) return setYearError(t('Начальный год не может быть больше конечного.'));
    setYearError('');
    navigate({ ...Object.fromEntries(TEXT_FILTERS.map(k => [k, draft[k].trim()])), q: draft.q.trim(), yearFrom, yearTo });
  }

  const fundName = (id: string) => funds?.find(f => f.id === id)?.name;
  const activeCount = [filters.type, filters.fundId, filters.yearFrom || filters.yearTo, ...TEXT_FILTERS.map(k => filters[k]), ...ID_FILTERS.map(k => filters[k])].filter(Boolean).length;
  const hasAdvanced = TEXT_FILTERS.some(k => filters[k]);
  const hasAny = !!(filters.q || activeCount);

  return (
    <div className="catalog-layout">
      <aside className="filters" aria-label={t('Поиск и фильтры')}>
        <button type="button" className="btn btn-secondary nav-toggle" style={{ width: '100%', marginBottom: 'var(--space-3)' }}
          aria-expanded={showFilters} aria-controls="filter-panel" onClick={() => setShowFilters(v => !v)}>
          {showFilters ? t('Скрыть фильтры') : `${t('Поиск и фильтры')}${activeCount ? ` (${activeCount})` : ''}`}
        </button>
        <form id="filter-panel" className="card card-flat filter-panel" data-open={showFilters} onSubmit={submit} role="search">
          <div className="field">
            <label htmlFor={ids.q}>{t('Текст или архивный шифр')}</label>
            <input id={ids.q} className="input" type="search" maxLength={200} value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder={t('Например: школа')} />
          </div>
          <fieldset className="field">
            <legend className="label">{t('Период, годы')}</legend>
            <div className="year-range">
              <div className="field">
                <label htmlFor={ids.from} className="hint">{t('с')}</label>
                <input id={ids.from} className="input" inputMode="numeric" pattern="\d*" maxLength={4} value={draft.yearFrom}
                  aria-invalid={!!yearError} aria-describedby={yearError ? ids.yearErr : undefined} onChange={e => setDraft(d => ({ ...d, yearFrom: e.target.value.trim() }))} />
              </div>
              <div className="field">
                <label htmlFor={ids.to} className="hint">{t('по')}</label>
                <input id={ids.to} className="input" inputMode="numeric" pattern="\d*" maxLength={4} value={draft.yearTo}
                  aria-invalid={!!yearError} aria-describedby={yearError ? ids.yearErr : undefined} onChange={e => setDraft(d => ({ ...d, yearTo: e.target.value.trim() }))} />
              </div>
            </div>
            {yearError && <p id={ids.yearErr} className="field-error" role="alert" style={{ margin: 0 }}>{yearError}</p>}
          </fieldset>
          <div className="field">
            <label htmlFor={ids.type}>{t('Тип документа')}</label>
            <select id={ids.type} className="select" value={filters.type} onChange={e => navigate({ type: e.target.value as DocumentType | '' })}>
              <option value="">{t('Все типы')}</option>
              {Object.entries(typeLabel).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={ids.fund}>{t('Фонд')}</label>
            <select id={ids.fund} className="select" value={filters.fundId} onChange={e => navigate({ fundId: e.target.value })} disabled={!funds}>
              <option value="">{t('Все фонды')}</option>
              {filters.fundId && funds && !fundName(filters.fundId) && <option value={filters.fundId}>{filters.fundId}</option>}
              {funds?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <details className="advanced-filters" open={hasAdvanced}>
            <summary>{t('Все реквизиты')}</summary>
            {TEXT_FILTERS.map(key => (
              <div className="field" key={key}>
                <label htmlFor={`${ids.q}-${key}`}>{t(filterLabel[key])}</label>
                <input id={`${ids.q}-${key}`} className="input" maxLength={200} value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
              </div>
            ))}
          </details>
          <div className="field">
            <label htmlFor={`${ids.q}-content`}>{t('Язык материалов')}</label>
            <select id={`${ids.q}-content`} className="select" value={contentLocale} onChange={e => navigate({ contentLang: e.target.value === lang ? '' : e.target.value })}>
              <option value="kk">Қазақша</option><option value="ru">Русский</option><option value="en">English</option>
            </select>
          </div>
          <div className="row" style={{ marginTop: 'var(--space-5)' }}>
            <button type="submit" className="btn btn-primary">{t('Найти')}</button>
            {hasAny && <Link href="/catalog" className="btn btn-ghost">{t('Сбросить')}</Link>}
          </div>
        </form>
      </aside>

      <section aria-labelledby="results-title">
        <h2 id="results-title" className="visually-hidden">{t('Результаты поиска')}</h2>
        {dropped && <Notice tone="warn" title={t('Часть параметров ссылки не распознана')}>{t('Некорректные значения фильтров проигнорированы.')}</Notice>}
        <div className="results-head">
          <p role="status" aria-live="polite" style={{ margin: 0 }}>
            {loading ? t('Поиск…') : data && !error ? <>{t('Найдено:')} <strong>{data.total}</strong>{filters.q && <> {t('по запросу')} «{filters.q}»</>}</> : ''}
          </p>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <label htmlFor={ids.sort} className="small">{t('Сортировка')}</label>
            <select id={ids.sort} className="select" style={{ width: 'auto' }} value={filters.sort} onChange={e => navigate({ sort: e.target.value as Sort })}>
              {Object.entries(sortLabel).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
        </div>

        {error ? <ErrorNotice error={error} onRetry={() => setAttempt(a => a + 1)} title={t('Не удалось выполнить поиск')} />
          : loading && !data ? <Loading label={t('Поиск документов')} />
          : data && data.items.length === 0 && data.total > 0 ? (
            <div className="card card-flat empty">
              <h3>{t('На этой странице нет результатов')}</h3>
              <Link href={`/catalog?${toQuery({ ...filters, page: 1 })}`} className="btn btn-secondary">{t('К первой странице')}</Link>
            </div>
          ) : data && data.items.length === 0 ? (
            <div className="card card-flat empty">
              <h3>{t('Ничего не найдено')}</h3>
              <p className="muted">{t('Попробуйте изменить запрос, расширить период или убрать часть фильтров.')}</p>
              {contentLocale !== 'ru' && <p><Link href={`/catalog?${toQuery({ ...filters, contentLang: 'ru', page: 1 })}`} className="btn btn-secondary">{t('Показать записи на русском языке')}</Link></p>}
              {hasAny && <Link href="/catalog" className="btn btn-secondary">{t('Сбросить фильтры')}</Link>}
            </div>
          ) : data && (
            <div aria-busy={loading} style={{ opacity: loading ? .6 : 1, transition: 'opacity .15s' }}>
              <ul className="result-list">
                {data.items.map(doc => <li key={doc.id}><DocumentCard doc={doc} fundName={fundName(doc.fundId)} /></li>)}
              </ul>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={p => `/catalog?${toQuery({ ...filters, page: p })}`} />
            </div>
          )}
      </section>
    </div>
  );
}
