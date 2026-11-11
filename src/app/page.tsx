import Link from 'next/link';
import { ContentCard } from '@/components/content';
import { DocumentCard } from '@/components/DocumentCard';
import { typeLabel } from '@/lib/labels';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { latestDocuments, listContent } from '@/server/public-read';
import {HomeDiscovery} from '@/components/HomeDiscovery';
import editorial from '../../data/artur/real-content-v2/ui-copy.json';

const quick = [
  { href: '/catalog', title: 'Каталог документов', text: 'Поиск по тексту и архивному шифру, фильтры по периоду, типу и фонду.' },
  { href: '/exhibitions', title: 'Онлайн-выставки', text: 'Тематические экспозиции архивных материалов.' },
  { href: '/branches', title: 'Филиалы и подразделения', text: 'Адреса, контакты, график работы и маршруты до филиалов архива.' },
  { href: '/places', title: 'История места', text: 'Города и районы: события и опубликованные источники.' },
];
export function generateMetadata() { return { alternates: languageAlternates('/') }; }

export default async function Home() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const copy=editorial[lang];
  const [news, exhibitions, events, ownDocs] = await Promise.all([listContent(lang, 'NEWS'), listContent(lang, 'EXHIBITION'), listContent(lang, 'EVENT'), latestDocuments(lang, 4)]);
  const docs = (ownDocs.length ? ownDocs : lang === 'ru' ? [] : await latestDocuments('ru', 3)).slice(0,3);
  const blocks = [
    { id: 'news', title: 'Новости и события', href: '/news', items: [...news].sort((a, b) => (b.payload.date ?? '').localeCompare(a.payload.date ?? '')).slice(0, 3) },
    { id: 'exhibitions', title: 'Онлайн-выставки', href: '/exhibitions', items: exhibitions.slice(0, 3) },
    { id: 'events', title: 'Большой архив памяти', href: '/memory', items: events.slice(0, 3) },
  ].filter(b => b.items.length);
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="container">
        <h1 id="hero-title">{t('Электронный архив')}</h1>
        <p className="lead">{copy.heroText}</p>
        <form className="hero-search" action="/catalog" method="get" role="search" aria-label={t('Поиск по архиву')}>
          <label htmlFor="hero-q" className="visually-hidden">{t('Что вы ищете')}</label>
          <input id="hero-q" name="q" className="input" type="search" maxLength={200} autoComplete="off" placeholder={copy.searchPlaceholder} />
          <button type="submit" className="btn btn-primary">{t('Найти')}</button>
        </form>
        {docs.length>0&&<div className="row small" style={{ marginTop: 'var(--space-4)' }}>
          <span className="muted">{t('Типы документов:')}</span>
          {(Object.keys(typeLabel) as (keyof typeof typeLabel)[]).map(type => <Link key={type} href={`/catalog?type=${type}`}>{t(typeLabel[type])}</Link>)}
        </div>}
      </div>
    </section>

    <div className="container page">
      <section aria-labelledby="quick-title">
        <h2 id="quick-title" className="visually-hidden">{t('Быстрые действия')}</h2>
        <div className="quick-grid">
          {quick.map(q => (
            <Link key={q.href} href={q.href} className="card card-flat quick-card">
              <h3>{t(q.title)}</h3>
              <p className="muted small" style={{ margin: 0 }}>{t(q.text)}</p>
            </Link>
          ))}
        </div>
      </section>

      <HomeDiscovery/>
      {docs.length > 0 && <section className="section" aria-labelledby="recent-title">
        <div className="row spread" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 id="recent-title" style={{ margin: 0 }}>{t('Материалы каталога')}</h2>
          <Link href="/catalog?sort=year_desc">{t('Все материалы')} →</Link>
        </div>
        {!ownDocs.length && lang !== 'ru' && <p className="small muted">{t('Переводы карточек ещё не опубликованы: показаны записи на русском языке.')}</p>}
        <ul className="result-list grid-cards">{docs.map(doc => <li key={doc.id}><DocumentCard doc={doc} /></li>)}</ul>
      </section>}

      {blocks.map(block => (
        <section key={block.id} className="section" aria-labelledby={`${block.id}-title`}>
          <div className="row spread" style={{ marginBottom: 'var(--space-4)' }}>
            <h2 id={`${block.id}-title`} style={{ margin: 0 }}>{t(block.title)}</h2>
            <Link href={block.href}>{t('Все материалы')} →</Link>
          </div>
          <ul className="result-list grid-cards">{block.items.map(i => <li key={i.id}><ContentCard item={i} lang={lang} t={t} /></li>)}</ul>
        </section>
      ))}

      <section className="section" aria-labelledby="about-title">
        <div className="panel prose">
          <h2 id="about-title">{t('Об архиве')}</h2>
          <p>{copy.aboutSource}</p>
          <p style={{ margin: 0 }}>{t('Официальная информация:')} <a href="http://e-arhiv.vko.gov.kz/ru" rel="noopener noreferrer" target="_blank">e-arhiv.vko.gov.kz<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a> · <Link href="/about">{t('Подробнее и помощь')}</Link></p>
        </div>
      </section>
    </div>
  </>;
}
