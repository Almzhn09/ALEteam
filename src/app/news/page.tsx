import { ContentCard, EmptyList, FilterBar, Pager, one, includes, pageHref, yearOf, inPeriod } from '@/components/content';
import { Breadcrumbs } from '@/components/ui';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { listContent } from '@/server/public-read';

const PAGE_SIZE = 10;
export async function generateMetadata() {
  const t = await getT();
  return { title: t('Новости и события'), description: t('Новости, события и объявления архива.'), alternates: languageAlternates('/news') };
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, lang, sp] = await Promise.all([getT(), getLang(), searchParams]);
  const q = one(sp.q); const category = one(sp.category); const yearText = one(sp.year);
  const year = yearOf(yearText);
  const all = (await listContent(lang, 'NEWS')).sort((a, b) => (b.payload.date ?? '').localeCompare(a.payload.date ?? ''));
  const categories = [...new Set(all.map(i => i.payload.category).filter(Boolean) as string[])].sort();
  const items = all.filter(i => (!q || includes(i.payload.title, q) || includes(i.payload.body, q))
    && (!category || i.payload.category === category) && inPeriod(i.payload, year, year));
  const pageNumber = Math.max(1, Number(one(sp.page)) || 1);
  const shown = items.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
  const query = { q, category, year: yearText };
  const filtered = !!(q || category || yearText);
  return (
    <div className="container page stack" style={{ maxWidth: 960 }}>
      <Breadcrumbs items={[{ label: t('Новости и события') }]} />
      <h1>{t('Новости и события')}</h1>
      <FilterBar action="/news" t={t} reset={filtered}>
        <div className="field"><label htmlFor="news-q">{t('Поиск')}</label><input id="news-q" name="q" className="input" type="search" defaultValue={q} maxLength={100} /></div>
        <div className="field"><label htmlFor="news-cat">{t('Категория')}</label>
          <select id="news-cat" name="category" className="select" defaultValue={category}><option value="">{t('Все категории')}</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="news-year">{t('Год')}</label><input id="news-year" name="year" className="input" inputMode="numeric" maxLength={4} defaultValue={yearText} /></div>
      </FilterBar>
      {shown.length ? <ul className="result-list">{shown.map(i => <li key={i.id}><ContentCard item={i} lang={lang} t={t} /></li>)}</ul> : <EmptyList t={t} filtered={filtered} />}
      <Pager t={t} page={pageNumber} pageSize={PAGE_SIZE} total={items.length} href={p => pageHref('/news', query, p)} />
    </div>
  );
}
