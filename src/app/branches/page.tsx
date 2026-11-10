import { BranchExplorer } from '@/components/BranchExplorer';
import { EmptyList } from '@/components/content';
import { Breadcrumbs } from '@/components/ui';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { listContent } from '@/server/public-read';

export async function generateMetadata() {
  const t = await getT();
  return { title: t('Филиалы и подразделения'), description: t('Адреса, контакты, график работы и маршруты до филиалов архива.'), alternates: languageAlternates('/branches') };
}

export default async function BranchesPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const branches = (await listContent(lang, 'BRANCH_PROFILE')).sort((a, b) => a.payload.title.localeCompare(b.payload.title));
  return (
    <div className="container page stack">
      <Breadcrumbs items={[{ label: t('Филиалы и подразделения') }]} />
      <h1>{t('Филиалы и подразделения')}</h1>
      {branches.length ? <BranchExplorer branches={branches} /> : <EmptyList t={t} filtered={false} />}
    </div>
  );
}
