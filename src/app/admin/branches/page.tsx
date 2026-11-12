'use client';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { DemoBadge, ErrorNotice, Loading } from '@/components/ui';
import { FormError, useStaff } from '../AdminShell';

interface Branch { id: string; code: string; name: string; isDemo: boolean; isPublic: boolean; updatedAt: string }
export default function BranchesAdmin() {
  const { t } = useI18n();
  const staff = useStaff();
  const [items, setItems] = useState<Branch[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState({ code: '', name: '', isDemo: true });
  const ids = { code: useId(), name: useId() };
  const load = useCallback(async () => { setLoadError(null); try { setItems((await apiGet<{ items: Branch[] }>('/admin/branches?pageSize=50')).items); } catch (e) { setLoadError(e); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(work: () => Promise<unknown>) { setError(null); try { await work(); } catch (e) { setError(e); } await load(); }
  function create(e: FormEvent) { e.preventDefault(); void run(async () => { await apiSend('/admin/branches', 'POST', form); setForm({ code: '', name: '', isDemo: true }); }); }
  return <>
    <h1 style={{ margin: 0 }}>{t('Филиалы')}</h1>
    <p className="muted small" style={{ margin: 0 }}>{t('Новый филиал создаётся закрытым. Контакты и координаты задаются в материале «Профиль филиала»; на сайте филиал виден, когда он открыт и его профиль опубликован.')}</p>
    <FormError error={error} />
    {loadError ? <ErrorNotice error={loadError} onRetry={() => void load()} /> : !items ? <Loading /> : (
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t('Код')}</th><th scope="col">{t('Название')}</th><th scope="col">{t('Состояние')}</th><th scope="col"><span className="visually-hidden">{t('Действия')}</span></th></tr></thead>
        <tbody>{items.map(b => <tr key={b.id}><td className="mono">{b.code}</td><td>{b.name} <DemoBadge show={b.isDemo} /></td><td>{b.isPublic ? t('Открыт') : t('Закрыт')}</td>
          <td>{staff.can('branches.manage', b.id) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void run(() => apiSend(`/admin/branches/${b.id}`, 'PATCH', { code: b.code, name: b.name, isDemo: b.isDemo, isPublic: !b.isPublic, expectedUpdatedAt: b.updatedAt }))}>{b.isPublic ? t('Закрыть') : t('Открыть')}<span className="visually-hidden">: {b.name}</span></button>}</td></tr>)}</tbody>
      </table></div>
    )}
    {staff.can('branches.manage') && <form className="card card-flat stack" onSubmit={create}>
      <h2 style={{ fontSize: '1.15rem' }}>{t('Новый филиал')}</h2>
      <div className="form-grid">
        <div className="field"><label htmlFor={ids.code} className="required">{t('Код')}</label><input id={ids.code} className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
        <div className="field"><label htmlFor={ids.name} className="required">{t('Название')}</label><input id={ids.name} className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <label className="row wide" style={{ gap: 'var(--space-2)' }}><input type="checkbox" checked={form.isDemo} onChange={e => setForm(f => ({ ...f, isDemo: e.target.checked }))} /> {t('Демонстрационный материал')}</label>
      </div>
      <div><button type="submit" className="btn btn-primary">{t('Создать')}</button></div>
    </form>}
  </>;
}
