import { Suspense } from 'react';
import { Moderation } from './Moderation';
import { Breadcrumbs, Loading } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Модерация') }; }

export default async function ModerationPage() {
  const t = await getT();
  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      <Breadcrumbs items={[{ label: t('Модерация') }]} />
      <h1>{t('Кабинет модератора')}</h1>
      <Suspense fallback={<Loading />}><Moderation /></Suspense>
    </div>
  );
}
