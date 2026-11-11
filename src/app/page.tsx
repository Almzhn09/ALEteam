import Link from 'next/link';
import { ContentCard } from '@/components/content';
import { DocumentCard } from '@/components/DocumentCard';
import { typeLabel } from '@/lib/labels';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { latestDocuments, listContent } from '@/server/public-read';
import {HomeDiscovery} from '@/components/HomeDiscovery';
import {ArchivePhoto} from '@/components/ArchivePhoto';
import editorial from '../../data/artur/real-content-v2/ui-copy.json';

const quick = [
  { href: '/catalog?scope=cms', title: 'Материалы архива', text: 'История, календари и документы для чтения.', icon: '01' },
  { href: '/catalog?scope=fund', title: 'Справочник фондов', text: 'Названия организаций, номера фондов и их переименования.', icon: '02' },
  { href: '/catalog?scope=newspaper', title: 'Газетный справочник', text: 'Какие газеты и за какие годы хранятся в архиве.', icon: '03' },
  { href: '/branches', title: 'Филиалы и контакты', text: 'Найдите свой филиал и узнайте, как обратиться в архив.', icon: '04' },
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
      <div className="container hero-layout">
       <div className="hero-copy reveal">
        <p className="eyebrow">{t('Государственный архив ВКО')}</p>
        <h1 id="hero-title">{t('История ближе, чем кажется')}</h1>
        <p className="lead">{copy.heroText}</p>
        <form className="hero-search" action="/catalog" method="get" role="search" aria-label={t('Поиск по архиву')}>
          <label htmlFor="hero-q" className="visually-hidden">{t('Что вы ищете')}</label>
          <input id="hero-q" name="q" className="input" type="search" maxLength={100} autoComplete="off" placeholder={copy.searchPlaceholder} />
          <button type="submit" className="btn btn-primary">{t('Найти')}</button>
        </form>
        {docs.length>0&&<div className="row small" style={{ marginTop: 'var(--space-4)' }}>
          <span className="muted">{t('Типы документов:')}</span>
          {(Object.keys(typeLabel) as (keyof typeof typeLabel)[]).map(type => <Link key={type} href={`/catalog?type=${type}`}>{t(typeLabel[type])}</Link>)}
        </div>}
        <div className="hero-links"><span className="small muted">{t('Начните с темы:')}</span><Link href="/catalog?scope=cms&q=история">{t('История архива')}</Link><Link href="/catalog?scope=cms&q=2026">{t('Календарь 2026')}</Link></div>
       </div>
       <div className="hero-visual reveal"><ArchivePhoto lang={lang} priority/></div>
      </div>
    </section>

    <div className="container page home-page">
      <HomeDiscovery/>
      <section className="section" aria-labelledby="quick-title">
        <div className="section-heading"><p className="eyebrow">{t('Путеводитель')}</p><h2 id="quick-title">{t('Что вы хотите найти?')}</h2></div>
        <div className="quick-grid">
          {quick.map(q => (
            <Link key={q.href} href={q.href} className="card card-flat quick-card">
              <span className="quick-number" aria-hidden="true">{q.icon}</span><h3>{t(q.title)} <span aria-hidden="true">→</span></h3>
              <p className="muted small" style={{ margin: 0 }}>{t(q.text)}</p>
            </Link>
          ))}
        </div>
      </section>

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
        <div className="about-strip">
          <div><p className="eyebrow">{t('Сохраняем память региона')}</p><h2 id="about-title">{t('Об архиве')}</h2><p>{copy.aboutSource}</p></div>
          <div className="stack"><Link className="btn btn-secondary" href="/about">{t('История и структура')} →</Link><Link href="/guide">{t('Как пользоваться сайтом')}</Link></div>
        </div>
      </section>
    </div>
  </>;
}
