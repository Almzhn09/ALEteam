import { Suspense } from 'react';
import { ContentManager } from './ContentManager';
import { Breadcrumbs, Loading } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Управление новостями и подборками') }; }

export default async function ContentManagerPage() {
  const t = await getT();
  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      <Breadcrumbs items={[{ href: '/moderation', label: t('Модерация') }, { label: t('Новости и подборки') }]} />
      <h1>{t('Управление новостями и подборками')}</h1>
      <Suspense fallback={<Loading />}><ContentManager /></Suspense>
    </div>
  );
}
