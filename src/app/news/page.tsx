import { Suspense } from 'react';
import { News } from './News';
import { Breadcrumbs, Loading } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Новости и подборки') }; }

export default async function NewsPage() {
  const t = await getT();
  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      <Breadcrumbs items={[{ label: t('Новости и подборки') }]} />
      <h1>{t('Новости и подборки')}</h1>
      <Suspense fallback={<Loading />}><News /></Suspense>
    </div>
  );
}
