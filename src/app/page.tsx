import Link from 'next/link';
import { ContentCard } from '@/components/content';
import { HomeDiscovery } from '@/components/HomeDiscovery';
import { SectionHero } from '@/components/SectionHero';
import { SectionIcon } from '@/components/SectionIcon';
import { directoryTotals } from '@/lib/directories-server';
import { homeDiscoveryInitial } from '@/lib/home-server';
import { getLang, getT } from '@/lib/i18n-server';
import { sections } from '@/lib/sections';
import { firstHref } from '@/lib/sections-server';
import { languageAlternates } from '@/lib/seo';
import { listContent } from '@/server/public-read';

export function generateMetadata() { return { alternates: languageAlternates('/') }; }

// R-F01: one real image beside the text, four section entries, recommendations, the directories in numbers.
// Copy follows data/artur/real-content-v2/ui-copy.json; every list below is read from the published corpus.
export default async function Home() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [historyHref, contactsHref, totals, news, exhibitions, discovery] = await Promise.all([
    firstHref(lang, 'history', '/about#history'), firstHref(lang, 'contacts', '/about#contacts'), directoryTotals(), listContent(lang, 'NEWS'), listContent(lang, 'EXHIBITION'), homeDiscoveryInitial(lang),
  ]);
  const entries = [
    { ...sections.history, href: historyHref },
    sections.calendar, sections.directories, sections.branches,
  ];
  const blocks = [
    { id: 'news', title: 'Новости и события', href: '/news', items: [...news].sort((a, b) => (b.payload.date ?? '').localeCompare(a.payload.date ?? '')).slice(0, 3) },
    { id: 'exhibitions', title: 'Онлайн-выставки', href: '/exhibitions', items: exhibitions.slice(0, 3) },
  ].filter(b => b.items.length);
  const number = new Intl.NumberFormat(lang === 'kk' ? 'kk-KZ' : lang === 'en' ? 'en-GB' : 'ru-RU');
  return (
    <div className="container page stack-xl home">
      <SectionHero title={t('Откройте историю Восточного Казахстана')} lead={t('История архива, памятные даты и справочники фондов — начните с интересующей темы.')} image="home">
        <form className="hero-search" action="/search" method="get" role="search" aria-label={t('Поиск по архиву')}>
          <label htmlFor="hero-q" className="visually-hidden">{t('Что вы ищете')}</label>
          <input id="hero-q" name="q" className="input" type="search" maxLength={200} autoComplete="off" placeholder={t('Тема, имя или название фонда')} />
          <button type="submit" className="btn btn-primary">{t('Найти')}</button>
        </form>
      </SectionHero>

      <section aria-labelledby="sections-title">
        <h2 id="sections-title" className="visually-hidden">{t('Основные разделы')}</h2>
        <ul className="entry-grid">
          {entries.map(entry => (
            <li key={entry.id} className="reveal">
              <Link href={entry.href} className="entry-card">
                <SectionIcon id={entry.id} />
                <span className="entry-card-title">{t(entry.title)}</span>
                <span className="entry-card-text">{t(entry.description)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <HomeDiscovery initial={discovery} />

      {(totals.funds !== null || totals.newspapers !== null) && <section className="figures reveal" aria-labelledby="figures-title">
        <div className="figures-text">
          <h2 id="figures-title">{t('Справочники фондов')}</h2>
          <p className="muted">{t('Версия справочника указана у источника. Строка справочника не является цифровой копией дела.')}</p>
          <Link className="btn btn-secondary" href="/directories">{t('Открыть справочники')}</Link>
        </div>
        <dl className="figures-list">
          {totals.funds !== null && <div><dt>{t('учётных номеров фондов')}</dt><dd>{number.format(totals.funds)}</dd></div>}
          {totals.newspapers !== null && <div><dt>{t('строк перечня газет')}</dt><dd>{number.format(totals.newspapers)}</dd></div>}
        </dl>
      </section>}

      {blocks.map(block => (
        <section key={block.id} className="stack" aria-labelledby={`${block.id}-title`}>
          <div className="section-head">
            <h2 id={`${block.id}-title`}>{t(block.title)}</h2>
            <Link href={block.href}>{t('Все материалы')} →</Link>
          </div>
          <ul className="result-list grid-cards">{block.items.map(i => <li key={i.id}><ContentCard item={i} lang={lang} t={t} /></li>)}</ul>
        </section>
      ))}

      <section className="info-band reveal" aria-labelledby="visit-title">
        <div>
          <h2 id="visit-title" className="info-band-title">{t('Часы работы')}</h2>
          <p>{t('Понедельник–пятница: архив 8:00–17:00; читальный зал 9:00–16:00.')}</p>
        </div>
        <div className="info-band-links">
          <Link className="btn btn-secondary" href={contactsHref}>{t('Контакты')}</Link>
          <Link className="btn btn-secondary" href="/about">{t('Об архиве')}</Link>
        </div>
      </section>
    </div>
  );
}
