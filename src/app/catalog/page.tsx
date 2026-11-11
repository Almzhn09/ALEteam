import { Suspense } from 'react';
import { ArchiveSearch } from './ArchiveSearch';
import { Breadcrumbs, Loading } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Каталог') }; }

export default async function CatalogPage() {
  const t = await getT();
  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: t('Каталог') }]} />
      <div className="section-heading"><p className="eyebrow">{t('Исследуйте архив')}</p><h1>{t('Поиск по архиву')}</h1></div>
      <Suspense fallback={<Loading />}><ArchiveSearch /></Suspense>
    </div>
  );
}
