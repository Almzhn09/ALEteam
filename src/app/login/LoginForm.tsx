'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiClientError, MOCK_MODE, errorText } from '@/lib/api';
import { MOCK_PASSWORD } from '@/lib/mock';
import { safeReturnTo, useSession } from '@/lib/session';
import { Notice } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const { user, signIn, signOut } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Введите email и пароль.'); return; }
    setBusy(true); setError('');
    try {
      await signIn(email.trim(), password);
      router.replace(returnTo);
    } catch (err) {
      // Do not reveal whether the email exists.
      setError(err instanceof ApiClientError && err.status === 401 ? 'Неверный email или пароль.'
        : err instanceof ApiClientError && err.status === 429 ? 'Слишком много попыток входа. Подождите минуту и повторите.'
        : errorText(err));
      setPassword('');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setBusy(false); }
  }

  if (user) return (
    <Notice tone="success" title={`Вы вошли как ${user.name}`}>
      <p>Роль: {user.role === 'MODERATOR' ? 'модератор' : 'автор'}.</p>
      <div className="row">
        <Link className="btn btn-primary btn-sm" href={returnTo}>Продолжить</Link>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>Выйти</button>
      </div>
    </Notice>
  );

  return (
    <form className="card stack" onSubmit={submit} noValidate aria-describedby={error ? `${id}-err` : undefined}>
      {error && <div ref={errorRef} tabIndex={-1} id={`${id}-err`}><Notice tone="error" title="Не удалось войти" live><p>{error}</p></Notice></div>}
      <div className="field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!error} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-password`}>Пароль</label>
        <input id={`${id}-password`} className="input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!error} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" /> Вход…</> : 'Войти'}</button>
      {MOCK_MODE && <p className="small muted" style={{ margin: 0 }}>Режим моков: author@example.test или moderator@example.test, пароль <code>{MOCK_PASSWORD}</code>.</p>}
    </form>
  );
}
