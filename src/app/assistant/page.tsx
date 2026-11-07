import { Suspense } from 'react';
import { Assistant } from './Assistant';
import { Breadcrumbs } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('ИИ-помощник') }; }

export default async function AssistantPage() {
  const t = await getT();
  return (
    <div className="container page" style={{ maxWidth: 880 }}>
      <Breadcrumbs items={[{ label: t('ИИ-помощник') }]} />
      <h1>{t('ИИ-помощник')}</h1>
      <p className="lead">{t('Помогает найти материалы архива и объясняет термины. Каждый ответ опирается на документы каталога — проверяйте сведения по ссылкам на источники.')}</p>
      <Suspense><Assistant /></Suspense>
    </div>
  );
}
