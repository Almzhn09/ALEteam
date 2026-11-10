import { BranchFacts, BranchRoute } from '@/components/BranchExplorer';
import { ContentDetail, detailMetadata } from '@/components/ContentDetail';
import { getT } from '@/lib/i18n-server';

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { const { slug } = await params; return detailMetadata(slug, `/branches/${slug}`, ['BRANCH_PROFILE']); }
export default async function BranchPage({ params }: Props) {
  const [{ slug }, t] = await Promise.all([params, getT()]);
  return <ContentDetail slug={slug} path={`/branches/${slug}`} kinds={['BRANCH_PROFILE']} crumb={{ href: '/branches', label: t('Филиалы и подразделения') }}>
    {item => <>
      <BranchFacts item={item} />
      {item.payload.latitude !== undefined && item.payload.longitude !== undefined && <BranchRoute title={item.payload.title} target={{ latitude: item.payload.latitude, longitude: item.payload.longitude }} />}
    </>}
  </ContentDetail>;
}
