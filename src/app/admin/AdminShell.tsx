'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { StaffGrant } from '@/contracts/cms';
import { ApiClientError, apiGet, errorText } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { useSession } from '@/lib/session';
import { ErrorNotice, Loading, Notice } from '@/components/ui';

interface Staff { id: string; name: string; grants: StaffGrant[]; can(permission: string, branchId?: string | null): boolean }
const StaffContext = createContext<Staff | null>(null);
export function useStaff() { const value = useContext(StaffContext); if (!value) throw new Error('useStaff outside AdminShell'); return value; }

const sections = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/content', label: 'Материалы', any: ['content.read'] },
  { href: '/admin/queue', label: 'Очередь согласования', any: ['content.review', 'content.publish'] },
  { href: '/admin/catalog', label: 'Каталог', any: ['catalog.read'] },
  { href: '/admin/uploads', label: 'Файлы цифровых копий', any: ['catalog.read'] },
  { href: '/admin/imports', label: 'Импорт каталога', any: ['catalog.read'] },
  { href: '/admin/branches', label: 'Филиалы', any: ['branches.manage'] },
  { href: '/admin/users', label: 'Сотрудники', any: ['staff.users.manage'] },
  { href: '/admin/roles', label: 'Роли и права', any: ['staff.roles.manage'] },
  { href: '/admin/audit', label: 'Журнал действий', any: ['audit.read'] },
  { href: '/admin/analytics', label: 'Аналитика', any: ['analytics.read'] },
];

// Navigation reflects grants for convenience only: every request is authorized by the server again.
export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { state } = useSession();
  const [staff, setStaff] = useState<Omit<Staff, 'can'> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setStaff((await apiGet<{ item: Omit<Staff, 'can'> }>('/admin/me')).item); }
    catch (e) { setError(e); setStaff(null); }
  }, []);
  useEffect(() => { if (state.status !== 'loading') void load(); }, [state, load]);

  const shell = (body: ReactNode) => <div className="container page stack">{body}</div>;
  if (error instanceof ApiClientError && error.status === 401) return shell(
    <Notice tone="info" title={t('Требуется вход')}>
      <p>{t('Войдите под учётной записью сотрудника. Сессия завершается при длительном бездействии.')}</p>
      <Link className="btn btn-primary btn-sm" href={`/login?returnTo=${encodeURIComponent(pathname)}`}>{t('Войти')}</Link>
    </Notice>);
  if (error instanceof ApiClientError && error.status === 403) return shell(
    <Notice tone="error" title={t('Нет доступа')}><p>{t('У этой учётной записи нет прав сотрудника, либо роль была отозвана.')}</p></Notice>);
  if (error) return shell(<ErrorNotice error={error} onRetry={() => void load()} />);
  if (!staff) return shell(<Loading rows={2} label={t('Проверка прав…')} />);

  const can = (permission: string, branchId?: string | null) => staff.grants.some(g => g.permission === permission && (g.branchId === null || (!!branchId && g.branchId === branchId)));
  const any = (permission: string) => staff.grants.some(g => g.permission === permission);
  const visible = sections.filter(s => !s.any || s.any.some(any));
  return (
    <StaffContext value={{ ...staff, can }}>
      <div className="container page admin-layout">
        <nav className="admin-nav" aria-label={t('Разделы управления')}>
          <ul>{visible.map(s => <li key={s.href}><Link href={s.href} aria-current={(s.href === '/admin' ? pathname === s.href : pathname.startsWith(s.href)) ? 'page' : undefined}>{t(s.label)}</Link></li>)}</ul>
        </nav>
        <div className="stack" style={{ minWidth: 0 }}>{children}</div>
      </div>
    </StaffContext>
  );
}

export function FormError({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const fields = error instanceof ApiClientError ? error.fields : undefined;
  return (
    <Notice tone="error" title={error instanceof ApiClientError && error.status === 409 ? t('Конфликт изменений') : t('Не удалось сохранить')} live>
      <p>{errorText(error, t)}</p>
      {fields?.length ? <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>{fields.map(f => <li key={`${f.path}${f.code}`}><code>{f.path || '—'}</code></li>)}</ul> : null}
    </Notice>
  );
}
