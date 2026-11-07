import Link from 'next/link';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Страница не найдена') }; }

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="container page empty">
      <p className="badge badge-neutral">{t('Ошибка 404')}</p>
      <h1>{t('Страница не найдена')}</h1>
      <p className="lead" style={{ margin: '0 auto var(--space-5)' }}>{t('Возможно, адрес набран с ошибкой или материал больше не опубликован.')}</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link className="btn btn-primary" href="/catalog">{t('Перейти в каталог')}</Link>
        <Link className="btn btn-secondary" href="/">{t('На главную')}</Link>
      </div>
    </div>
  );
}
