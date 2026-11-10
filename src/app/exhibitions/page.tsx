import { ContentCard, EmptyList, FilterBar, Pager, includes, inPeriod, one, pageHref, yearOf } from '@/components/content';
import { Breadcrumbs } from '@/components/ui';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { listContent } from '@/server/public-read';

const PAGE_SIZE = 12;
export async function generateMetadata() {
  const t = await getT();
  return { title: t('Онлайн-выставки'), description: t('Тематические экспозиции архивных материалов.'), alternates: languageAlternates('/exhibitions') };
}

export default async function ExhibitionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, lang, sp] = await Promise.all([getT(), getLang(), searchParams]);
  const q = one(sp.q); const category = one(sp.category); const fromText = one(sp.from); const toText = one(sp.to);
  const all = await listContent(lang, 'EXHIBITION');
  const categories = [...new Set(all.map(i => i.payload.category).filter(Boolean) as string[])].sort();
  const items = all.filter(i => (!q || includes(i.payload.title, q) || includes(i.payload.body, q)) && (!category || i.payload.category === category) && inPeriod(i.payload, yearOf(fromText), yearOf(toText)));
  const pageNumber = Math.max(1, Number(one(sp.page)) || 1);
  const filtered = !!(q || category || fromText || toText);
  return (
    <div className="container page stack">
      <Breadcrumbs items={[{ label: t('Онлайн-выставки') }]} />
      <h1>{t('Онлайн-выставки')}</h1>
      <FilterBar action="/exhibitions" t={t} reset={filtered}>
        <div className="field"><label htmlFor="x-q">{t('Тема')}</label><input id="x-q" name="q" className="input" type="search" defaultValue={q} maxLength={100} /></div>
        <div className="field"><label htmlFor="x-cat">{t('Категория')}</label>
          <select id="x-cat" name="category" className="select" defaultValue={category}><option value="">{t('Все категории')}</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label htmlFor="x-from">{t('Период с')}</label><input id="x-from" name="from" className="input" inputMode="numeric" maxLength={4} defaultValue={fromText} /></div>
        <div className="field"><label htmlFor="x-to">{t('Период по')}</label><input id="x-to" name="to" className="input" inputMode="numeric" maxLength={4} defaultValue={toText} /></div>
      </FilterBar>
      {items.length ? <ul className="result-list grid-cards">{items.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE).map(i => <li key={i.id}><ContentCard item={i} lang={lang} t={t} /></li>)}</ul> : <EmptyList t={t} filtered={filtered} />}
      <Pager t={t} page={pageNumber} pageSize={PAGE_SIZE} total={items.length} href={p => pageHref('/exhibitions', { q, category, from: fromText, to: toText }, p)} />
    </div>
  );
}
