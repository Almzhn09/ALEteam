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
import {ArchiveIcon} from './ArchiveDecor';
import referenceCopy from '../../data/artur/reference-design/copy.json';
import referenceBlocks from '../../data/artur/reference-design/blocks.json';
import { LANGS, langName, type Lang } from '@/lib/i18n-core';

const navigation = referenceBlocks.navigation;

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
  const { t,lang } = useI18n();
  const copy=referenceCopy[lang];
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

  const params = useSearchParams();
  useEffect(() => { setOpen(false); header.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(node=>node.open=false); }, [pathname,params]);
  useEffect(() => {
    const outside=(event:PointerEvent)=>{if(header.current&&!header.current.contains(event.target as Node)){setOpen(false);header.current.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(node=>node.open=false);}};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  }, []);
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
    <header className="site-header reference-header" ref={header} onKeyDown={event=>{
      if(event.key!=='Escape')return;
      const details=(event.target as HTMLElement).closest('details');
      if(details?.open){details.open=false;details.querySelector('summary')?.focus();event.preventDefault();event.stopPropagation();}
      else if(open){setOpen(false);toggle.current?.focus();}
    }}>
      <div className="container header-inner">
        <Link href="/" className="brand" title={t('Электронный архив — на главную')}>
          <span className="brand-mark" aria-hidden="true">ЭА</span>
          <span><span className="brand-long">{copy.brand}</span><span className="brand-short">{copy.shortBrand}</span><small>{copy.branchSubtitle}</small></span>
        </Link>
        <div className="header-tools">
          <details className="site-search" onToggle={event=>{if(event.currentTarget.open)event.currentTarget.querySelector('input')?.focus();}}>
            <summary className="btn btn-secondary btn-icon" aria-label={t('Поиск по архиву')}><ArchiveIcon kind="search"/></summary>
            <form className="header-search" action="/search" method="get" role="search" aria-label={t('Поиск по архиву')}>
              <label htmlFor={searchId} className="visually-hidden">{t('Поиск по архиву')}</label>
              <input id={searchId} name="q" className="input" type="search" maxLength={100} autoComplete="off" placeholder={t('Поиск по архиву')}/>
              <button type="submit" className="btn btn-primary btn-sm">{t('Найти')}</button>
            </form>
          </details>
          <Suspense><LanguageSelect /></Suspense>
          <DisplayPreferences initialTheme={initialTheme} initialSize={initialSize} />
          <TourButton />
          <AssistantWidget />
        </div>
        <button ref={toggle} type="button" className="btn btn-secondary btn-sm menu-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(v => !v)}>
          {open ? t('Закрыть') : t('Меню')}
        </button>
        <div className="nav-wrap" id="site-nav" data-open={open}>
          <nav className="nav" aria-label={t('Основная навигация')}>
            {navigation.map(group=>group.children?<details className="nav-group" key={group.label} data-active={group.children.some(link=>current(link.href.split('?')[0]))} onToggle={event=>{if(event.currentTarget.open){const selected=event.currentTarget;selected.parentElement?.querySelectorAll<HTMLDetailsElement>('.nav-group[open]').forEach(node=>{if(node!==selected)node.open=false;});}}}>
              <summary>{t(group.label)}<span className="nav-chevron" aria-hidden="true">⌄</span></summary>
              <ul className="nav-group-panel">{group.children.map(link=><li key={link.href}><Link href={link.href} aria-current={current(link.href)}>{t(link.label)}</Link></li>)}</ul>
            </details>:<Link key={group.label} href={group.href!} aria-current={current(group.href!.split('?')[0])}>{t(group.label)}</Link>)}
          </nav>
          <div className="user-chip">
            <Link href="/favorites" className="small" aria-current={current('/favorites')}>
              <span aria-hidden="true">★</span> {t('Избранное')}{favorites.hydrated && favorites.items.length > 0 && <span className="muted"> ({favorites.items.length})</span>}
            </Link>
            {state.status === 'loading' && <span className="visually-hidden" role="status">{t('Проверка входа…')}</span>}
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
            {/* The public login link also renders during the session check. It stays usable
                without JS and has exactly the same dimensions after an anonymous /me response. */}
            {(state.status === 'loading' || state.status === 'guest' || state.status === 'error') && (
              <Link className="btn btn-primary btn-sm" aria-busy={state.status === 'loading'} href={`/login?returnTo=${encodeURIComponent(pathname)}`}>{t('Войти')}</Link>
            )}
          </div>
        </div>
      </div>
      <noscript><style>{`.nav-wrap {display:block!important;position:static!important;max-height:none!important}.menu-toggle {display:none!important}`}</style></noscript>
    </header>
  );
}
