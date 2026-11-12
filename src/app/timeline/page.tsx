import { Timeline } from './Timeline';
import { Breadcrumbs } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Шкала времени') }; }

export default async function TimelinePage() {
  const t = await getT();
  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: t('Шкала времени') }]} />
      <h1>{t('Шкала времени')}</h1>
      <p className="lead">{t('Материалы каталога по десятилетиям. Даты и сведения взяты из карточек документов — откройте карточку, чтобы проверить источник.')}</p>
      <Timeline />
    </div>
  );
}
