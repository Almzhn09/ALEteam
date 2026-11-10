import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ContentKind, PublicContentItem } from '@/contracts/cms';
import { Body, NoTranslation, Provenance, Related, RelatedLinks } from '@/components/content';
import { Share } from '@/components/Share';
import { Breadcrumbs, DemoBadge } from '@/components/ui';
import { dayFormatter, type Lang } from '@/lib/i18n';
import { getLang, getT } from '@/lib/i18n-server';
import { contentMetadata } from '@/lib/seo';
import { allContentById, getDocument, getLocalized } from '@/server/public-read';

export async function detailMetadata(slug: string, path: string, kinds: readonly ContentKind[]) {
  const lang = await getLang();
  const { item, available } = await getLocalized(slug, lang, kinds);
  if (item) return contentMetadata(item, path);
  return available.length ? { title: (await getT())('Нет перевода на выбранный язык'), robots: { index: false } } : { robots: { index: false } };
}

export async function related(item: PublicContentItem, lang: Lang) {
  const [byId, docs] = await Promise.all([allContentById(lang), Promise.all(item.payload.documentIds.map(id => getDocument(id, lang)))]);
  return {
    documents: docs.filter(d => !!d).map(d => ({ id: d!.id, title: d!.title, reference: d!.reference })),
    content: [...item.payload.contentIds].flatMap(id => byId.get(id) ?? []),
  };
}

export async function ContentDetail({ slug, path, kinds, crumb, children }: { slug: string; path: string; kinds: readonly ContentKind[]; crumb: { href: string; label: string }; children?: (item: PublicContentItem) => ReactNode }) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const { item, available } = await getLocalized(slug, lang, kinds);
  if (!item) {
    if (!available.length) notFound();
    return <NoTranslation available={available} t={t} crumbs={[crumb, { label: t('Нет перевода') }]} path={path} />;
  }
  const links = await related(item, lang);
  const p = item.payload;
  return (
    <div className="container page stack" style={{ maxWidth: 880 }}>
      <Breadcrumbs items={[crumb, { label: p.title }]} />
      <article className="stack" lang={item.locale}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {p.date && <time className="small muted" dateTime={p.date}>{dayFormatter(lang)(p.date)}</time>}
          {p.category && <span className="badge badge-neutral">{p.category}</span>}
          <DemoBadge show={item.isDemo} />
        </div>
        <h1 style={{ marginBottom: 0 }}>{p.title}</h1>
        <Body item={item} />
        {children?.(item)}
      </article>
      <Related documents={links.documents} content={links.content} t={t} />
      <RelatedLinks links={p.links} t={t} />
      <section className="card card-flat" aria-label={t('Сведения о публикации')}><Provenance item={item} t={t} /></section>
      <Share title={p.title} path={path} />
    </div>
  );
}
