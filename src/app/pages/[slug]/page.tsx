import { ContentDetail, detailMetadata } from '@/components/ContentDetail';
import { getT } from '@/lib/i18n-server';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { const { slug } = await params; return detailMetadata(slug, `/pages/${slug}`, ['PAGE']); }
export default async function CmsPage({ params }: Props) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  return <ContentDetail slug={slug} path={`/pages/${slug}`} kinds={['PAGE']} crumb={{ href: '/about', label: t('Об архиве') }} />;
}
