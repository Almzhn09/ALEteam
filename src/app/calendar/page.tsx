import Link from 'next/link';
import { Breadcrumbs } from '@/components/ui';
import { SectionHero } from '@/components/SectionHero';
import { getLang, getT } from '@/lib/i18n-server';
import { listWithSource, materialHref } from '@/lib/sections-server';
import { languageAlternates } from '@/lib/seo';

export async function generateMetadata() { return { title: (await getT())('Памятные даты'), alternates: languageAlternates('/calendar') }; }

// One published calendar per year (RU/KK source texts); the year is read from the title, newest first.
export default async function CalendarPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const items = (await listWithSource(lang, 'PAGE', 'calendar'))
    .map(entry => ({ entry, year: entry.item.payload.title.match(/(19|20)\d{2}/)?.[0] ?? '' }))
    .sort((a, b) => b.year.localeCompare(a.year));
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ label: t('Памятные даты') }]} />
      <SectionHero title={t('Памятные даты')} lead={t('События и люди региона в календарях 2022–2026 годов.')} />
      {items.length ? <ol className="year-list" aria-label={t('Календари по годам')}>
        {items.map(({ entry, year }) => <li key={entry.item.id} className="year-card reveal">
          <Link href={materialHref(entry)} lang={entry.item.locale}>
            <span className="year-card-year">{year || entry.item.payload.title}</span>
            <span className="year-card-title">{entry.item.payload.title}</span>
          </Link>
          {entry.original && <p className="small muted">{t('Материал на языке источника')}</p>}
        </li>)}
      </ol> : <p className="muted">{t('Материалы раздела пока не опубликованы.')}</p>}
      <p className="small muted measure">{t('Даты указаны так, как в календарях архива. Спорные даты отмечены в тексте календаря.')}</p>
    </div>
  );
}
