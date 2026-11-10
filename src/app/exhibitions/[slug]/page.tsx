import { ContentDetail, detailMetadata } from '@/components/ContentDetail';
import { ExhibitViewer, type ExhibitView } from '@/components/ExhibitViewer';
import { getLang, getT } from '@/lib/i18n-server';
import { allContentById, getDocument } from '@/server/public-read';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { const { slug } = await params; return detailMetadata(slug, `/exhibitions/${slug}`, ['EXHIBITION']); }

async function Exhibits({ ids }: { ids: string[] }) {
  const [lang, t] = await Promise.all([getLang(), getT()]);
  const byId = await allContentById(lang);
  const exhibits: ExhibitView[] = await Promise.all(ids.flatMap(id => byId.get(id) ?? []).map(async e => ({
    id: e.id, title: e.payload.title, body: e.payload.body, rights: e.payload.rights, source: e.payload.sourceNote ?? null, sourceUrl: e.payload.sourceUrl ?? null,
    fileIds: e.payload.fileIds, isDemo: e.isDemo, locale: e.locale,
    documents: (await Promise.all(e.payload.documentIds.map(d => getDocument(d, lang)))).filter(d => !!d).map(d => ({ id: d!.id, title: d!.title })),
    links: e.payload.links.filter(l => /^https?:\/\//i.test(l.url)),
  })));
  if (!exhibits.length) return <p className="muted">{t('В экспозиции пока нет опубликованных экспонатов на этом языке.')}</p>;
  return <ExhibitViewer exhibits={exhibits} />;
}

export default async function Exhibition({ params }: Props) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  return <ContentDetail slug={slug} path={`/exhibitions/${slug}`} kinds={['EXHIBITION']} crumb={{ href: '/exhibitions', label: t('Онлайн-выставки') }}>
    {item => <Exhibits ids={item.payload.exhibitIds} />}
  </ContentDetail>;
}
