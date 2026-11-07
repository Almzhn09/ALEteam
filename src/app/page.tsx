import Link from 'next/link';
import { RecentDocuments } from './RecentDocuments';
import { typeLabel } from '@/lib/labels';

const quick = [
  { href: '/catalog', title: 'Каталог документов', text: 'Поиск по тексту и архивному шифру, фильтры по периоду, типу и фонду.' },
  { href: '/assistant', title: 'Спросить ИИ-помощника', text: 'Найти материалы и разобраться в работе архива — с проверяемыми ссылками на карточки.' },
  { href: '/favorites', title: 'Избранное', text: 'Сохраняйте документы и возвращайтесь к ним позже — на этом устройстве.' },
  { href: '/about', title: 'Как пользоваться архивом', text: 'Правила доступа, помощь и ссылка на официальные контакты архива.' },
];

export default function Home() {
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="container">
        <h1 id="hero-title">Электронный архив</h1>
        <p className="lead">Ищите архивные документы, просматривайте карточки и сканы, сохраняйте находки и обсуждайте материалы.</p>
        <form className="hero-search" action="/catalog" method="get" role="search" aria-label="Поиск по архиву">
          <label htmlFor="hero-q" className="visually-hidden">Что вы ищете</label>
          <input id="hero-q" name="q" className="input" type="search" maxLength={200} autoComplete="off"
            placeholder="Например: библиотека или DEMO-Ф2-О1-Д1" />
          <button type="submit" className="btn btn-primary">Найти</button>
        </form>
        <div className="row small" style={{ marginTop: 'var(--space-4)' }}>
          <span className="muted">Типы документов:</span>
          {(Object.keys(typeLabel) as (keyof typeof typeLabel)[]).map(t => (
            <Link key={t} href={`/catalog?type=${t}`}>{typeLabel[t]}</Link>
          ))}
        </div>
      </div>
    </section>

    <div className="container page">
      <section aria-labelledby="quick-title">
        <h2 id="quick-title" className="visually-hidden">Быстрые действия</h2>
        <div className="quick-grid">
          {quick.map(q => (
            <Link key={q.href} href={q.href} className="card card-flat quick-card">
              <h3>{q.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>{q.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="recent-title">
        <div className="row spread" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 id="recent-title" style={{ margin: 0 }}>Материалы каталога</h2>
          <Link href="/catalog?sort=year_desc">Все материалы →</Link>
        </div>
        <RecentDocuments />
      </section>

      <section className="section" aria-labelledby="about-title">
        <div className="panel prose">
          <h2 id="about-title">Об архиве</h2>
          <p>Это прототип обновлённого интерфейса. Проверенные сведения об архиве, режим работы, контакты и перечень услуг будут добавлены после аудита исходного сайта — мы не публикуем непроверенных фактов.</p>
          <p style={{ margin: 0 }}>Официальная информация: <a href="http://e-arhiv.vko.gov.kz/ru" rel="noopener noreferrer" target="_blank">e-arhiv.vko.gov.kz<span className="visually-hidden"> (откроется в новой вкладке)</span></a> · <Link href="/about">Подробнее и помощь</Link></p>
        </div>
      </section>
    </div>
  </>;
}
