import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ContentKind, PublicContentItem,ContentLocale } from '@/contracts/cms';
import { Body, Provenance, Related, RelatedLinks } from '@/components/content';
import { ExplainDocument, RelatedMaterials } from '@/components/DiscoveryMaterials';
import { MaterialAttachments } from '@/components/MaterialAttachments';
import { Share } from '@/components/Share';
import { Breadcrumbs, DemoBadge } from '@/components/ui';
import { dayFormatter, langName, type Lang } from '@/lib/i18n';
import { getLang, getT } from '@/lib/i18n-server';
import { sectionOf } from '@/lib/sections';
import { contentMetadata } from '@/lib/seo';
import { allContentById, getDocument, getLocalized } from '@/server/public-read';

/** The publication in the requested language or, failing that, in the language it exists in (marked on the page). */
async function resolve(slug: string, lang: ContentLocale, kinds: readonly ContentKind[]) {
  const own = await getLocalized(slug, lang, kinds);
  if (own.item || !own.available.length) return own.item;
  const fallback = (['ru', 'kk', 'en'] as const).find(l => own.available.includes(l)) ?? own.available[0] as ContentLocale;
  return (await getLocalized(slug, fallback, kinds)).item;
}

export async function detailMetadata(slug: string, path: string, kinds: readonly ContentKind[],contentLocale?:ContentLocale) {
  const item = await resolve(slug, contentLocale ?? await getLang(), kinds);
  return item ? contentMetadata(item, path) : { robots: { index: false } };
}

export async function related(item: PublicContentItem, lang: Lang) {
  const [byId, docs] = await Promise.all([allContentById(lang), Promise.all(item.payload.documentIds.map(id => getDocument(id, lang)))]);
  return {
    documents: docs.filter(d => !!d).map(d => ({ id: d!.id, title: d!.title, reference: d!.reference })),
    content: [...item.payload.contentIds].flatMap(id => byId.get(id) ?? []),
  };
}

export async function ContentDetail({ slug, path, kinds, crumb, children,contentLocale }: { slug: string; path: string; kinds: readonly ContentKind[]; crumb: { href: string; label: string }; children?: (item: PublicContentItem) => ReactNode;contentLocale?:ContentLocale }) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const item = await resolve(slug, contentLocale ?? lang, kinds);
  if (!item) notFound();
  const links = await related(item, lang);
  const p = item.payload;
  const section = sectionOf(p.category);
  const crumbs = section && crumb.href === '/' ? [{ href: section.href, label: t(section.title) }] : [crumb];
  const explainable = item.kind !== 'SETTING' && p.body.length > 200;
  return (
    <div className="container page stack-lg material-page">
      <Breadcrumbs items={[...crumbs, { label: p.title }]} />
      <header className="material-head">
        <div className="row meta-row">
          {section && <span className="eyebrow">{t(section.title)}</span>}
          {p.date && <time className="small muted" dateTime={p.date}>{dayFormatter(lang)(p.date)}</time>}
          <DemoBadge show={item.isDemo} />
        </div>
        <h1 lang={item.locale}>{p.title}</h1>
        {item.locale !== lang && <p className="source-language small">{t('Материал на языке источника')}: {langName[item.locale as Lang] ?? item.locale}</p>}
      </header>
      <div className="material-layout">
        <article className="stack material-body" lang={item.locale}>
          <Body item={item} />
          {children?.(item)}
        </article>
        <aside className="material-aside stack">
          <MaterialAttachments id={item.id} locale={item.locale} />
          <section className="card card-flat" aria-label={t('Сведения о публикации')}><Provenance item={item} t={t} /></section>
          <Share title={p.title} path={path} />
        </aside>
      </div>
      {explainable && <ExplainDocument material={{ kind: 'cms', id: item.id }} />}
      <Related documents={links.documents} content={links.content} t={t} />
      <RelatedLinks links={p.links} t={t} />
      <RelatedMaterials material={{ kind: 'cms', id: item.id }} />
    </div>
  );
}
