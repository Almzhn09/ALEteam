import { Suspense } from 'react';
import { LoginForm } from './LoginForm';
import { Breadcrumbs } from '@/components/ui';

export const metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <Breadcrumbs items={[{ label: 'Вход' }]} />
      <h1>Вход</h1>
      <p className="muted">Вход нужен, чтобы комментировать документы, отправлять жалобы, задавать вопросы ИИ-помощнику и модерировать обсуждения. Публичная регистрация в прототипе закрыта.</p>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
