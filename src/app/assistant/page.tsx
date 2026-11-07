import { Suspense } from 'react';
import { Assistant } from './Assistant';
import { Breadcrumbs } from '@/components/ui';

export const metadata = { title: 'ИИ-помощник' };

export default function AssistantPage() {
  return (
    <div className="container page" style={{ maxWidth: 880 }}>
      <Breadcrumbs items={[{ label: 'ИИ-помощник' }]} />
      <h1>ИИ-помощник</h1>
      <p className="lead">Помогает найти материалы архива и объясняет термины. Каждый ответ опирается на документы каталога — проверяйте сведения по ссылкам на источники.</p>
      <Suspense><Assistant /></Suspense>
    </div>
  );
}
