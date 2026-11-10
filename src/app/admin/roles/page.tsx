'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError } from '../AdminShell';

interface Role { id: string; name: string; permissions: { permission: string }[] }

export default function RolesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<{ items: Role[]; permissions: string[] } | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState('');
  const load = useCallback(async () => { setLoadError(null); try { setData(await apiGet('/admin/roles')); } catch (e) { setLoadError(e); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (loadError) return <ErrorNotice error={loadError} onRetry={() => void load()} />;
  if (!data) return <Loading />;
  async function save(role: Role, permissions: string[]) {
    setError(null); setSaved('');
    try { await apiSend('/admin/roles', 'PUT', { id: role.id, name: role.name, permissions }); setSaved(role.name); }
    catch (e) { setError(e); }
    await load();
  }
  return <>
    <h1 style={{ margin: 0 }}>{t('Роли и права')}</h1>
    <FormError error={error} />
    {saved && <Notice tone="success" live><p>{t('Роль обновлена: {name}.', { name: saved })}</p></Notice>}
    {data.items.map(role => {
      const current = role.permissions.map(p => p.permission);
      return <fieldset key={role.id} className="card card-flat">
        <legend className="label">{role.name}</legend>
        <div className="permission-grid">{data.permissions.map(p => <label key={p} className="row small" style={{ gap: 'var(--space-1)' }}>
          <input type="checkbox" checked={current.includes(p)} onChange={e => void save(role, e.target.checked ? [...current, p] : current.filter(x => x !== p))} /> <span className="mono">{p}</span>
        </label>)}</div>
      </fieldset>;
    })}
  </>;
}
