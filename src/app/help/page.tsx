import Link from 'next/link';
import { EmptyList } from '@/components/content';
import { Breadcrumbs, DemoBadge } from '@/components/ui';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { listContent } from '@/server/public-read';

export async function generateMetadata() {
  const t = await getT();
  return { title: t('Справка и частые вопросы'), description: t('Термины архивного дела, структура учёта и ответы на частые вопросы.'), alternates: languageAlternates('/help') };
}

export default async function HelpPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [faq, pages] = await Promise.all([listContent(lang, 'FAQ'), listContent(lang, 'PAGE')]);
  const articles = pages.filter(p => p.payload.category === 'help');
  return (
    <div className="container page measure-narrow stack">
      <Breadcrumbs items={[{ label: t('Справка и частые вопросы') }]} />
      <h1>{t('Справка и частые вопросы')}</h1>
      <section className="panel" aria-labelledby="structure-title">
        <h2 id="structure-title" style={{ fontSize: '1.15rem' }}>{t('Как устроен архивный учёт')}</h2>
        <p style={{ margin: 0 }}>{t('Документы хранятся по цепочке: архив → фонд → опись → дело → документ. Архивный шифр указывает место документа в этой цепочке.')}</p>
      </section>
      {articles.length > 0 && <section aria-labelledby="articles-title" className="stack">
        <h2 id="articles-title">{t('Статьи справки')}</h2>
        <ul>{articles.map(a => <li key={a.id}><Link href={`/pages/${a.slug}`}>{a.payload.title}</Link></li>)}</ul>
      </section>}
      <section aria-labelledby="faq-title" className="stack">
        <h2 id="faq-title">{t('Частые вопросы')}</h2>
        {faq.length ? faq.map(item => (
          <details key={item.id} className="card card-flat" lang={item.locale}>
            <summary><strong>{item.payload.title}</strong> <DemoBadge show={item.isDemo} /></summary>
            <p className="pre-wrap" style={{ marginTop: 'var(--space-3)' }}>{item.payload.body}</p>
          </details>
        )) : <EmptyList t={t} filtered={false} />}
      </section>
      <p><Link href="/branches">{t('Контакты филиалов')} →</Link></p>
    </div>
  );
}
