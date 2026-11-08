'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { useFavorites } from '@/lib/favorites';
import { errorText } from '@/lib/api';
import { useI18n } from '@/lib/lang';

const links = [
  { href: '/catalog', label: 'Каталог' },
  { href: '/timeline', label: 'Шкала времени' },
  { href: '/favorites', label: 'Избранное' },
  { href: '/assistant', label: 'ИИ-помощник' },
  { href: '/about', label: 'Об архиве' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const { state, user, signOut } = useSession();
  const favorites = useFavorites();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined;
  async function logout() {
    setBusy(true); setLogoutError('');
    try { await signOut(); router.push('/'); }
    catch (error) { setLogoutError(errorText(error, t)); }
    finally { setBusy(false); }
  }
  function switchLang() {
    setLang(lang === 'ru' ? 'kk' : 'ru');
    router.refresh(); // re-render server parts (headings, metadata) in the new language
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={t('Электронный архив — на главную')}>
          <span className="brand-mark" aria-hidden="true">ЭА</span>
          <span>{t('Электронный архив')}<small>{t('Восточно-Казахстанская область · прототип')}</small></span>
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={switchLang}
          lang={lang === 'ru' ? 'kk' : 'ru'} aria-label={lang === 'ru' ? 'Қазақ тіліне ауысу' : 'Переключить на русский язык'}>
          {lang === 'ru' ? 'ҚАЗ' : 'РУС'}
        </button>
        <button ref={toggle} type="button" className="btn btn-secondary btn-sm nav-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(v => !v)}>
          {open ? t('Закрыть') : t('Меню')}
        </button>
        <div className="nav-wrap" id="site-nav" data-open={open}>
          <nav className="nav" aria-label={t('Основная навигация')}>
            {links.map(l => (
              <Link key={l.href} href={l.href} aria-current={current(l.href)}>
                {t(l.label)}
                {l.href === '/favorites' && favorites.hydrated && favorites.items.length > 0 && <span className="muted"> ({favorites.items.length})</span>}
              </Link>
            ))}
            {user?.role === 'MODERATOR' && <Link href="/moderation" aria-current={current('/moderation')}>{t('Модерация')}</Link>}
          </nav>
          <div className="user-chip">
            {state.status === 'loading' && <span className="muted small">{t('Проверка входа…')}</span>}
            {user && <>
              <Link href="/me" className="small" aria-current={current('/me')}>{user.name}{user.role === 'MODERATOR' ? ` · ${t('модератор')}` : ''}</Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={logout} disabled={busy}>{t('Выйти')}</button>
              {logoutError && <span className="field-error" role="alert">{logoutError}</span>}
            </>}
            {(state.status === 'guest' || state.status === 'error') && (
              <Link className="btn btn-primary btn-sm" href={`/login?returnTo=${encodeURIComponent(pathname)}`}>{t('Войти')}</Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
