'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiClientError, MOCK_MODE, errorText } from '@/lib/api';
import { MOCK_PASSWORD } from '@/lib/mock';
import { safeReturnTo, useSession } from '@/lib/session';
import { Notice } from '@/components/ui';
import { useI18n } from '@/lib/lang';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const { user, signIn, signOut } = useSession();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError(t('Введите email и пароль.')); return; }
    setBusy(true); setError('');
    try {
      await signIn(email.trim(), password);
      router.replace(returnTo);
    } catch (err) {
      // Do not reveal whether the email exists.
      setError(err instanceof ApiClientError && err.status === 401 ? t('Неверный email или пароль.')
        : err instanceof ApiClientError && err.status === 429 ? t('Слишком много попыток входа. Подождите минуту и повторите.')
        : errorText(err, t));
      setPassword('');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setBusy(false); }
  }

  if (user) return (
    <Notice tone="success" title={t('Вы вошли как {name}', { name: user.name })}>
      <p>{t('Роль:')} {user.role === 'MODERATOR' ? t('модератор') : t('автор')}.</p>
      <div className="row">
        <Link className="btn btn-primary btn-sm" href={returnTo}>{t('Продолжить')}</Link>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>{t('Выйти')}</button>
      </div>
    </Notice>
  );

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-describedby={error ? `${id}-err` : undefined}>
      {error && <div ref={errorRef} tabIndex={-1} id={`${id}-err`}><Notice tone="error" title={t('Не удалось войти')} live><p>{error}</p></Notice></div>}
      <div className="field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!error} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-password`}>{t('Пароль')}</label>
        <input id={`${id}-password`} className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" /> {t('Вход…')}</> : t('Войти')}</button>
      <p className="small">{t('Ещё нет аккаунта?')} <Link href={`/register?returnTo=${encodeURIComponent(returnTo)}`}>{t('Создать аккаунт')}</Link></p>
      {MOCK_MODE && <p className="small muted" style={{ margin: 0 }}>{t('Режим моков:')} author@example.test / moderator@example.test, {t('пароль')} <code>{MOCK_PASSWORD}</code>.</p>}
    </form>
  );
}
