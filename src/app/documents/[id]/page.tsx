import { notFound } from 'next/navigation';
import { DocumentView, type PublicDocument } from './DocumentView';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates, siteUrl } from '@/lib/seo';
import { getDocument } from '@/server/public-read';

type Props = { params: Promise<{ id: string }> };

// A card without a published translation is shown in Russian and says so: it is never presented as translated.
async function load(id: string) {
  const lang = await getLang();
  const own = await getDocument(id, lang);
  if (own) return { doc: own, translated: true };
  const russian = lang === 'ru' ? null : await getDocument(id, 'ru');
  return { doc: russian, translated: false };
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { doc } = await load(id);
  if (!doc) return { title: (await getT())('Документ не найден'), robots: { index: false } };
  const description = doc.description.slice(0, 160);
  return { title: doc.title, description, alternates: languageAlternates(`/documents/${encodeURIComponent(id)}`, doc.availableLocales),
    openGraph: { title: doc.title, description, url: `/documents/${encodeURIComponent(id)}`, type: 'article', locale: doc.locale } };
}

export default async function DocumentPage({ params }: Props) {
  const { id } = await params;
  const { doc, translated } = await load(id);
  if (!doc) notFound();
  const data = { '@context': 'https://schema.org', '@type': 'ArchiveComponent', name: doc.title, description: doc.description, identifier: doc.reference,
    temporalCoverage: doc.yearTo ? `${doc.year}/${doc.yearTo}` : String(doc.year), inLanguage: doc.locale, url: `${siteUrl()}/documents/${encodeURIComponent(id)}` };
  return <>
    {/* JSON.stringify output with "<" escaped cannot terminate the script element. */}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
    <DocumentView doc={JSON.parse(JSON.stringify(doc)) as PublicDocument} translated={translated} />
  </>;
}
