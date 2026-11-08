import Link from 'next/link';
import { RecentDocuments } from './RecentDocuments';
import { typeLabel } from '@/lib/labels';
import { getT } from '@/lib/i18n-server';

const quick = [
  { href: '/catalog', title: 'Каталог документов', text: 'Поиск по тексту и архивному шифру, фильтры по периоду, типу и фонду.' },
  { href: '/assistant', title: 'Спросить ИИ-помощника', text: 'Найти материалы и разобраться в работе архива — с проверяемыми ссылками на карточки.' },
  { href: '/timeline', title: 'Шкала времени', text: 'Материалы по десятилетиям: от ранних документов к современным.' },
  { href: '/favorites', title: 'Избранное', text: 'Сохраняйте документы и возвращайтесь к ним позже — на этом устройстве.' },
];

export default async function Home() {
  const t = await getT();
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="container">
        <h1 id="hero-title">{t('Электронный архив')}</h1>
        <p className="lead">{t('Ищите архивные документы, просматривайте карточки и сканы, сохраняйте находки и обсуждайте материалы.')}</p>
        <form className="hero-search" action="/catalog" method="get" role="search" aria-label={t('Поиск по архиву')}>
          <label htmlFor="hero-q" className="visually-hidden">{t('Что вы ищете')}</label>
          <input id="hero-q" name="q" className="input" type="search" maxLength={200} autoComplete="off"
            placeholder={t('Например: библиотека или DEMO-Ф2-О1-Д1')} />
          <button type="submit" className="btn btn-primary">{t('Найти')}</button>
        </form>
        <div className="row small" style={{ marginTop: 'var(--space-4)' }}>
          <span className="muted">{t('Типы документов:')}</span>
          {(Object.keys(typeLabel) as (keyof typeof typeLabel)[]).map(type => (
            <Link key={type} href={`/catalog?type=${type}`}>{t(typeLabel[type])}</Link>
          ))}
        </div>
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

      <section className="section" aria-labelledby="recent-title">
        <div className="row spread" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 id="recent-title" style={{ margin: 0 }}>{t('Материалы каталога')}</h2>
          <Link href="/catalog?sort=year_desc">{t('Все материалы')} →</Link>
        </div>
        <RecentDocuments />
      </section>

      <section className="section" aria-labelledby="about-title">
        <div className="panel prose">
          <h2 id="about-title">{t('Об архиве')}</h2>
          <p>{t('Прототип обновлённого интерфейса Государственного архива Восточно-Казахстанской области. Адрес, режим работы и услуги проверены по официальному сайту 8 ноября 2026 года.')}</p>
          <p style={{ margin: 0 }}>{t('Официальная информация:')} <a href="http://e-arhiv.vko.gov.kz/ru" rel="noopener noreferrer" target="_blank">e-arhiv.vko.gov.kz<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a> · <Link href="/about">{t('Подробнее и помощь')}</Link></p>
        </div>
      </section>
    </div>
  </>;
}
