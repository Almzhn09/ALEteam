import Link from 'next/link';
import type { ContentKind } from '@/contracts/cms';
import { ContentCard, EmptyList, FilterBar, Pager, includes, inPeriod, one, pageHref, period, yearOf } from '@/components/content';
import { Breadcrumbs, DemoBadge } from '@/components/ui';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { listWithSource } from '@/lib/sections-server';

const tabs = [
  { kind: 'EVENT', slug: 'events', label: 'События' }, { kind: 'COLLECTION', slug: 'collections', label: 'Коллекции' },
  { kind: 'PERSON', slug: 'people', label: 'Личности' }, { kind: 'MEMOIR', slug: 'memoirs', label: 'Воспоминания' },
] as const;
const PAGE_SIZE = 12;
export async function generateMetadata() {
  const t = await getT();
  return { title: t('Большой архив памяти'), description: t('Коллекции, события, личности и воспоминания из истории региона.'), alternates: languageAlternates('/memory') };
}

export default async function MemoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, lang, sp] = await Promise.all([getT(), getLang(), searchParams]);
  const tab = tabs.find(x => x.slug === one(sp.section)) ?? tabs[0];
  const q = one(sp.q); const place = one(sp.place); const fromText = one(sp.from); const toText = one(sp.to);
  const from = yearOf(fromText); const to = yearOf(toText);
  const all = (await listWithSource(lang, tab.kind as ContentKind)).map(({item})=>item);
  const items = all.filter(i => (!q || includes(i.payload.title, q) || includes(i.payload.body, q) || i.payload.tags.some(x => includes(x, q)))
    && (!place || includes(i.payload.category, place) || i.payload.tags.some(x => includes(x, place)) || includes(i.payload.body, place))
    && inPeriod(i.payload, from, to))
    .sort((a, b) => (a.payload.yearFrom ?? 9999) - (b.payload.yearFrom ?? 9999) || a.payload.title.localeCompare(b.payload.title));
  const pageNumber = Math.max(1, Number(one(sp.page)) || 1);
  const shown = items.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
  const query = { section: tab.slug, q, place, from: fromText, to: toText };
  const filtered = !!(q || place || fromText || toText);
  return (
    <div className="container page stack">
      <Breadcrumbs items={[{ label: t('Большой архив памяти') }]} />
      <h1>{t('Большой архив памяти')}</h1>
      <p className="lead">{t('Коллекции, события, личности и воспоминания из истории региона.')}</p>
      <nav aria-label={t('Разделы архива памяти')}><div className="tabs">
        {tabs.map(x => <Link key={x.slug} href={`/memory?section=${x.slug}`} aria-current={x === tab ? 'page' : undefined}>{t(x.label)}</Link>)}
      </div></nav>
      <FilterBar action="/memory" t={t} reset={filtered}>
        <input type="hidden" name="section" value={tab.slug} />
        <div className="field"><label htmlFor="m-q">{t('Тема')}</label><input id="m-q" name="q" className="input" type="search" defaultValue={q} maxLength={100} /></div>
        <div className="field"><label htmlFor="m-place">{t('Место')}</label><input id="m-place" name="place" className="input" defaultValue={place} maxLength={100} /></div>
        <div className="field"><label htmlFor="m-from">{t('Период с')}</label><input id="m-from" name="from" className="input" inputMode="numeric" maxLength={4} defaultValue={fromText} /></div>
        <div className="field"><label htmlFor="m-to">{t('Период по')}</label><input id="m-to" name="to" className="input" inputMode="numeric" maxLength={4} defaultValue={toText} /></div>
      </FilterBar>
      {!shown.length ? <EmptyList t={t} filtered={filtered} />
        : tab.kind === 'EVENT' ? (
          <ol className="timeline" aria-label={t('Лента событий')}>
            {shown.map(i => (
              <li key={i.id} className="timeline-decade" style={{ paddingBottom: 'var(--space-5)' }}>
                <h2 className="timeline-year">{period(i.payload) || t('Дата не указана')}</h2>
                <div className="card card-flat" lang={i.locale}>
                  {i.locale!==lang&&<p className="source-language small muted" lang={lang}>{t('Материал на языке источника')} · {i.locale.toUpperCase()}</p>}
                  <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>{i.payload.category && <span className="badge badge-neutral">{i.payload.category}</span>}<DemoBadge show={i.isDemo} /></div>
                  <Link href={`/memory/${i.slug}`}>{i.payload.title}</Link>
                  <p className="small muted clamp-2" style={{ margin: 0 }}>{i.payload.body}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : <ul className="result-list grid-cards">{shown.map(i => <li key={i.id}><ContentCard item={i} lang={lang} t={t} /></li>)}</ul>}
      <Pager t={t} page={pageNumber} pageSize={PAGE_SIZE} total={items.length} href={p => pageHref('/memory', query, p)} />
      <p className="small"><Link href="/timeline">{t('Шкала документов каталога')} →</Link></p>
    </div>
  );
}
