import { Suspense } from 'react';
import { Catalog } from './Catalog';
import { Breadcrumbs, Loading } from '@/components/ui';

export const metadata = { title: 'Каталог' };

export default function CatalogPage() {
  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: 'Каталог' }]} />
      <h1>Каталог документов</h1>
      <Suspense fallback={<Loading label="Загрузка каталога" />}><Catalog /></Suspense>
    </div>
  );
}
