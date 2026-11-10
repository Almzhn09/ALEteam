import Link from 'next/link';
import { TourButton } from '@/components/Tour';
import { tourSteps } from '@/lib/tour-steps';
import { Breadcrumbs } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';

export async function generateMetadata() {
  const t = await getT();
  return { title: t('Как пользоваться сайтом'), description: t('Четыре коротких шага: поиск, документ, ИИ-помощник и настройки вида сайта.'), alternates: languageAlternates('/guide') };
}

export default async function GuidePage() {
  const t = await getT();
  return (
    <div className="container page measure-narrow stack">
      <Breadcrumbs items={[{ label: t('Как пользоваться сайтом') }]} />
      <div>
        <h1>{t('Как пользоваться сайтом')}</h1>
        <p className="lead">{t('Четыре коротких шага: поиск, документ, ИИ-помощник и настройки вида сайта. Обучение необязательно, его можно пройти в любой момент.')}</p>
        <TourButton className="btn btn-primary" label={t('Пройти короткий тур')} />
      </div>
      <ol className="guide-steps">
        {tourSteps.map((step, i) => (
          <li key={step.id} className="card card-flat">
            <h2><span className="step-number" aria-hidden="true">{i + 1}</span>{t(step.title)}</h2>
            <p>{t(step.text)}</p>
            {step.href && <Link href={step.href}>{t(step.action!)} →</Link>}
          </li>
        ))}
      </ol>
      <p><Link href="/help">{t('Справка и частые вопросы')} →</Link></p>
    </div>
  );
}
