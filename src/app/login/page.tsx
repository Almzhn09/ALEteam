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
      <p className="muted">{t('Вход нужен, чтобы комментировать документы, отправлять жалобы, задавать вопросы ИИ-помощнику и модерировать обсуждения. Публичная регистрация в прототипе закрыта.')}</p>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
