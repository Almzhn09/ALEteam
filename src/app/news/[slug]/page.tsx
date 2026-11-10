import { ContentDetail, detailMetadata } from '@/components/ContentDetail';
import { getT } from '@/lib/i18n-server';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { const { slug } = await params; return detailMetadata(slug, `/news/${slug}`, ['NEWS']); }
export default async function NewsItem({ params }: Props) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  return <ContentDetail slug={slug} path={`/news/${slug}`} kinds={['NEWS']} crumb={{ href: '/news', label: t('Новости и события') }} />;
}
