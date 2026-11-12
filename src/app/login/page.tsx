import { Suspense } from 'react';
import { LoginForm } from './LoginForm';
import { Breadcrumbs } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Вход') }; }

export default async function LoginPage() {
  const t = await getT();
  return (
    <div className="container page measure-form">
      <Breadcrumbs items={[{ label: t('Вход') }]} />
      <h1>{t('Вход')}</h1>
      <p className="muted">{t('Войдите или создайте аккаунт, чтобы комментировать материалы и подписываться на новые публикации.')}</p>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
