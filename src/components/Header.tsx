'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { useFavorites } from '@/lib/favorites';
import { errorText } from '@/lib/api';

const links = [
  { href: '/catalog', label: 'Каталог' },
  { href: '/favorites', label: 'Избранное' },
  { href: '/assistant', label: 'ИИ-помощник' },
  { href: '/about', label: 'Об архиве' },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, user, signOut } = useSession();
  const favorites = useFavorites();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    try { await signOut(); router.push('/'); }
    catch (error) { alert(errorText(error)); }
    finally { setBusy(false); }
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="Электронный архив — на главную">
          <span className="brand-mark" aria-hidden="true">ЭА</span>
          <span>Электронный архив<small>Восточно-Казахстанская область · прототип</small></span>
        </Link>
        <button ref={toggle} type="button" className="btn btn-secondary btn-sm nav-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(v => !v)}>
          {open ? 'Закрыть' : 'Меню'}
        </button>
        <div className="nav-wrap" id="site-nav" data-open={open}>
          <nav className="nav" aria-label="Основная навигация">
            {links.map(l => (
              <Link key={l.href} href={l.href} aria-current={current(l.href)}>
                {l.label}
                {l.href === '/favorites' && favorites.hydrated && favorites.items.length > 0 && <span className="muted"> ({favorites.items.length})</span>}
              </Link>
            ))}
            {user?.role === 'MODERATOR' && <Link href="/moderation" aria-current={current('/moderation')}>Модерация</Link>}
          </nav>
          <div className="user-chip">
            {state.status === 'loading' && <span className="muted small">Проверка входа…</span>}
            {user && <>
              <Link href="/me" className="small" aria-current={current('/me')}>{user.name}{user.role === 'MODERATOR' ? ' · модератор' : ''}</Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={logout} disabled={busy}>Выйти</button>
            </>}
            {(state.status === 'guest' || state.status === 'error') && (
              <Link className="btn btn-primary btn-sm" href={`/login?returnTo=${encodeURIComponent(pathname)}`}>Войти</Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
