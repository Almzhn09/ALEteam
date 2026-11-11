import {Suspense} from 'react';
import {MaterialFiles} from './MaterialFiles';
import {ExplainDocument,RelatedMaterials} from './DiscoveryMaterials';
import {cmsAttachmentRefs} from '@/server/cms-attachments';
import {FollowTopic} from './TopicSubscriptions';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { ContentKind, PublicContentItem,ContentLocale } from '@/contracts/cms';
import { Body, NoTranslation, Provenance, Related, RelatedLinks } from '@/components/content';
import { Share } from '@/components/Share';
import { Breadcrumbs, DemoBadge } from '@/components/ui';
import { dayFormatter, type Lang } from '@/lib/i18n';
import { getLang, getT } from '@/lib/i18n-server';
import { contentMetadata } from '@/lib/seo';
import { allContentById, getDocument, getLocalized } from '@/server/public-read';

export async function detailMetadata(slug: string, path: string, kinds: readonly ContentKind[],contentLocale?:ContentLocale) {
  const lang = contentLocale??await getLang();
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

export async function ContentDetail({ slug, path, kinds, crumb, children,contentLocale }: { slug: string; path: string; kinds: readonly ContentKind[]; crumb: { href: string; label: string }; children?: (item: PublicContentItem) => ReactNode;contentLocale?:ContentLocale }) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const { item, available } = await getLocalized(slug, contentLocale??lang, kinds);
  if (!item) {
    if (!available.length) notFound();
    return <NoTranslation available={available} t={t} crumbs={[crumb, { label: t('Нет перевода') }]} path={path} />;
  }
  const links = await related(item, lang);
  const p = item.payload;
  const originals=await cmsAttachmentRefs(item.id,item.locale);
  return (
    <div className="container page measure-narrow stack">
      <Breadcrumbs items={[crumb, { label: p.title }]} />
      <nav className="reader-jumps row" aria-label={t('На этой странице')}>
        <a href="#material-body">{t('Читать материал')}</a>
        {originals.length>0&&<a href="#material-originals">{t('Оригиналы документов')}</a>}
        <a href="#material-explanation">{t('Понятнее о документе')}</a>
      </nav>
      <article id="material-body" className="stack" lang={item.locale}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {p.date && <time className="small muted" dateTime={p.date}>{dayFormatter(lang)(p.date)}</time>}
          {p.category && <span className="badge badge-neutral">{t(({history:'История',calendar:'Календарь памятных дат',contacts:'Контакты',compliance:'Комплаенс',structure:'Структура',branches:'Филиалы',fonds:'Справочник фондов',services:'Услуги'} as Record<string,string>)[p.category]??p.category)}</span>}
          <DemoBadge show={item.isDemo} />
        </div>
        <h1 style={{ marginBottom: 0 }}>{p.title}</h1>
        {item.locale!==lang&&<p className="small muted">{t('Материал показан на языке источника.')}</p>}
        <Body item={item} />
        {children?.(item)}
      </article>
      <MaterialFiles materialId={item.id} contentLocale={item.locale} initialFiles={originals}/>
      <div id="material-explanation"><ExplainDocument kind="cms" documentId={item.id}/></div>
      <RelatedMaterials kind="cms" documentId={item.id}/>
      {p.category&&<div className="panel stack"><h2>{t('Не пропустить новое')}</h2><Suspense><FollowTopic contentLocale={item.locale} selection={{filters:{scope:'cms',category:p.category}}}/></Suspense></div>}
      <Related documents={links.documents} content={links.content} t={t} />
      <RelatedLinks links={p.links} t={t} />
      <details className="card card-flat"><summary>{t('Сведения о публикации')}</summary><Provenance item={item} t={t} /></details>
      <Share title={p.title} path={path} />
    </div>
  );
}
