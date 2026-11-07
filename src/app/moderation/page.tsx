import { Suspense } from 'react';
import { Moderation } from './Moderation';
import { Breadcrumbs, Loading } from '@/components/ui';

export const metadata = { title: 'Модерация' };

export default function ModerationPage() {
  return (
    <div className="container page" style={{ maxWidth: 960 }}>
      <Breadcrumbs items={[{ label: 'Модерация' }]} />
      <h1>Кабинет модератора</h1>
      <Suspense fallback={<Loading />}><Moderation /></Suspense>
    </div>
  );
}
