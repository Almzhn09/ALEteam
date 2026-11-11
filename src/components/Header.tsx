'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { useFavorites } from '@/lib/favorites';
import { apiGet, errorText } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { DisplayPreferences, type DisplayTheme, type TextSize } from './DisplayPreferences';
import { TourButton } from './Tour';
import { AssistantWidget } from './AssistantWidget';
import { LANGS, langName, type Lang } from '@/lib/i18n-core';

// Sections of the published corpus (R-F02). Empty legacy sections stay reachable by URL but are not advertised.
const links = [
  { href: '/about', label: 'Об архиве' },
  { href: '/calendar', label: 'Памятные даты' },
  { href: '/directories', label: 'Справочники' },
  { href: '/services', label: 'Услуги' },
  { href: '/branches', label: 'Филиалы' },
  { href: '/help', label: 'Справка' },
];
type Theme = 'system' | 'light' | 'dark';

function LanguageSelect() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  function change(next: Lang) {
    setLang(next);
    // A stale ?lang= would be re-applied by the proxy, so it is removed from the address.
    if (params.has('lang')) {
      const rest = new URLSearchParams(params.toString()); rest.delete('lang');
      router.replace(rest.size ? `${pathname}?${rest}` : pathname);
    }
    router.refresh();
  }
  return <>
    <label htmlFor={id} className="visually-hidden">{t('Язык')}</label>
    <select id={id} className="select select-compact" value={lang} onChange={e => change(e.target.value as Lang)}>
      {LANGS.map(l => <option key={l} value={l} lang={l}>{langName[l]}</option>)}
    </select>
  </>;
}

export function Header({ initialTheme, initialSize }: { initialTheme: DisplayTheme; initialSize: TextSize }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { state, user, signOut } = useSession();
  const favorites = useFavorites();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [staff, setStaff] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const account = useRef<HTMLDetailsElement>(null);
  const searchId = useId();
  useEffect(() => {
    const node = header.current;
    if (!node) return;
    const update = () => document.documentElement.style.setProperty('--header-height', `${node.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update); observer.observe(node);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--header-height'); };
  }, []);

  useEffect(() => { setOpen(false); account.current?.removeAttribute('open'); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  // Only decides whether to offer the link; the server re-checks every admin request.
  useEffect(() => {
    if (!user) { setStaff(false); return; }
    let live = true;
    apiGet('/admin/me').then(() => { if (live) setStaff(true); }, () => { if (live) setStaff(false); });
    return () => { live = false; };
  }, [user]);

  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined;
  async function logout() {
    setBusy(true); setLogoutError('');
    try { await signOut(); router.push('/'); }
    catch (error) { setLogoutError(errorText(error, t)); }
    finally { setBusy(false); }
  }

  return (
    <header className="site-header" ref={header}>
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={t('Электронный архив — на главную')}>
          <span className="brand-mark" aria-hidden="true">ЭА</span>
          <span>{t('Электронный архив')}<small>{t('Восточно-Казахстанская область')}</small></span>
        </Link>
        <form className="header-search" action="/search" method="get" role="search" aria-label={t('Поиск по сайту и справочникам')}>
          <label htmlFor={searchId} className="visually-hidden">{t('Поиск по сайту и справочникам')}</label>
          <input id={searchId} name="q" className="input" type="search" maxLength={200} autoComplete="off" placeholder={t('Поиск')} />
          <button type="submit" className="btn btn-primary btn-sm">{t('Найти')}</button>
        </form>
        <div className="header-tools">
          <Suspense><LanguageSelect /></Suspense>
          <DisplayPreferences initialTheme={initialTheme} initialSize={initialSize} />
          <TourButton />
          <AssistantWidget />
        </div>
        <button ref={toggle} type="button" className="btn btn-secondary btn-sm menu-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(v => !v)}>
          {open ? t('Закрыть') : t('Меню')}
        </button>
        <div className="nav-wrap" id="site-nav" data-open={open}>
          <form className="menu-search" action="/search" method="get" role="search" aria-label={t('Поиск по сайту и справочникам')}>
            <label htmlFor={`${searchId}-menu`} className="visually-hidden">{t('Поиск по сайту и справочникам')}</label>
            <input id={`${searchId}-menu`} name="q" className="input" type="search" maxLength={200} autoComplete="off" placeholder={t('Поиск')} />
            <button type="submit" className="btn btn-primary btn-sm">{t('Найти')}</button>
          </form>
          <nav className="nav" aria-label={t('Основная навигация')}>
            {links.map(l => <Link key={l.href} href={l.href} aria-current={current(l.href)}>{t(l.label)}</Link>)}
          </nav>
          <div className="user-chip">
            <Link href="/favorites" className="small" aria-current={current('/favorites')}>
              <span aria-hidden="true">★</span> {t('Избранное')}{favorites.hydrated && favorites.items.length > 0 && <span className="muted"> ({favorites.items.length})</span>}
            </Link>
            {state.status === 'loading' && <span className="muted small">{t('Проверка входа…')}</span>}
            {user && (
              <details className="account-menu" ref={account} onKeyDown={e => { if (e.key === 'Escape') { account.current?.removeAttribute('open'); account.current?.querySelector('summary')?.focus(); } }}>
                <summary className="btn btn-secondary btn-sm">{user.name}</summary>
                <ul className="account-panel">
                  <li><Link href="/me" aria-current={current('/me')}>{t('Личный кабинет')}</Link></li>
                  <li><Link href="/me#topic-subscriptions">{t('Мои подписки')}</Link></li>
                  {user.role === 'MODERATOR' && <li><Link href="/moderation" aria-current={current('/moderation')}>{t('Модерация')}</Link></li>}
                  {staff && <li><Link href="/admin" aria-current={current('/admin')}>{t('Управление')}</Link></li>}
                  <li><button type="button" className="btn btn-ghost btn-sm" onClick={logout} disabled={busy}>{t('Выйти')}</button></li>
                </ul>
              </details>
            )}
            {logoutError && <span className="field-error" role="alert">{logoutError}</span>}
            {(state.status === 'guest' || state.status === 'error') && (
              <Link className="btn btn-primary btn-sm" href={`/login?returnTo=${encodeURIComponent(pathname)}`}>{t('Войти')}</Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
