import { ContentDetail, detailMetadata } from '@/components/ContentDetail';
import { getT } from '@/lib/i18n-server';

const kinds = ['COLLECTION', 'PERSON', 'EVENT', 'MEMOIR'] as const;
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { const { slug } = await params; return detailMetadata(slug, `/memory/${slug}`, kinds); }
export default async function MemoryItem({ params }: Props) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  return <ContentDetail slug={slug} path={`/memory/${slug}`} kinds={kinds} crumb={{ href: '/memory', label: t('Большой архив памяти') }} />;
}
