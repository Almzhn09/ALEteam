import { Suspense } from 'react';
import { Catalog } from './Catalog';
import { Breadcrumbs, Loading } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Каталог') }; }

export default async function CatalogPage() {
  const t = await getT();
  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: t('Каталог') }]} />
      <h1>{t('Каталог документов')}</h1>
      <Suspense fallback={<Loading />}><Catalog /></Suspense>
    </div>
  );
}
