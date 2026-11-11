import Link from 'next/link';
import { Breadcrumbs, DemoBadge } from '@/components/ui';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { guides } from '@/server/guides';
import { listContent } from '@/server/public-read';

export async function generateMetadata() {
  const t = await getT();
  return { title: t('Справка и частые вопросы'), description: t('Термины архивного дела, структура учёта и ответы на частые вопросы.'), alternates: languageAlternates('/help') };
}

// Help: the archive's own FAQ when published, and the short guides the AI assistant cites (anchors are stable).
export default async function HelpPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [faq, pages] = await Promise.all([listContent(lang, 'FAQ'), listContent(lang, 'PAGE')]);
  const articles = pages.filter(p => p.payload.category === 'help');
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ label: t('Справка и частые вопросы') }]} />
      <header className="page-head">
        <h1>{t('Справка и частые вопросы')}</h1>
        <p className="lead">{t('Как искать, чем фонд отличается от документа и как читать сведения об источнике.')}</p>
      </header>
      <section className="source-note measure" aria-labelledby="structure-title">
        <h2 id="structure-title" className="h3">{t('Как устроен архивный учёт')}</h2>
        <p>{t('Документы хранятся по цепочке: архив → фонд → опись → дело → документ. Архивный шифр указывает место документа в этой цепочке. Справочник фондов на сайте содержит номера и названия фондов, но не описи, дела или цифровые копии.')}</p>
      </section>
      <section className="stack" aria-labelledby="guides-title">
        <h2 id="guides-title">{t('Справочные статьи')}</h2>
        <div className="guide-grid">
          {guides.map(guide => <article key={guide.id} id={guide.id} lang="ru" className="card card-flat anchor-target">
            <h3>{guide.title}</h3><p>{guide.text}</p>
          </article>)}
        </div>
      </section>
      {articles.length > 0 && <section aria-labelledby="articles-title" className="stack">
        <h2 id="articles-title">{t('Статьи справки')}</h2>
        <ul>{articles.map(a => <li key={a.id}><Link href={`/materials/${a.slug}`}>{a.payload.title}</Link></li>)}</ul>
      </section>}
      {faq.length > 0 && <section aria-labelledby="faq-title" className="stack measure">
        <h2 id="faq-title">{t('Частые вопросы')}</h2>
        {faq.map(item => (
          <details key={item.id} className="card card-flat" lang={item.locale}>
            <summary><strong>{item.payload.title}</strong> <DemoBadge show={item.isDemo} /></summary>
            <p className="pre-wrap">{item.payload.body}</p>
          </details>
        ))}
      </section>}
      <p><Link href="/guide">{t('Как пользоваться сайтом')} →</Link> · <Link href="/branches">{t('Контакты филиалов')} →</Link></p>
    </div>
  );
}
