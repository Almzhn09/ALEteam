'use client';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../AdminShell';

interface User { id: string; name: string; email: string; isActive: boolean; createdAt: string }
interface Role { id: string; name: string }
interface Branch { id: string; name: string }

export default function UsersPage() {
  const { t } = useI18n();
  const staff = useStaff();
  const canAssign = staff.can('staff.roles.manage');
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [grant, setGrant] = useState({ userId: '', roleId: '', branchId: '' });
  const ids = { name: useId(), email: useId(), password: useId(), user: useId(), role: useId(), branch: useId() };
  const load = useCallback(async () => {
    setLoadError(null);
    try { setUsers((await apiGet<{ items: User[] }>('/admin/users?pageSize=50')).items); } catch (e) { setLoadError(e); }
  }, []);
  useEffect(() => {
    void load();
    if (canAssign) apiGet<{ items: Role[] }>('/admin/roles').then(r => setRoles(r.items), () => setRoles([]));
    apiGet<{ items: Branch[] }>('/admin/branches?pageSize=50').then(r => setBranches(r.items), () => setBranches([]));
  }, [load, canAssign]);
  async function run(work: () => Promise<unknown>, message: string) {
    setError(null); setDone('');
    try { await work(); setDone(message); await load(); } catch (e) { setError(e); }
  }
  function create(e: FormEvent) { e.preventDefault(); void run(async () => { await apiSend('/admin/users', 'POST', form); setForm({ name: '', email: '', password: '' }); }, t('Учётная запись создана.')); }
  function assign(method: 'POST' | 'DELETE') { void run(() => apiSend('/admin/assignments', method, { userId: grant.userId, roleId: grant.roleId, branchId: grant.branchId || null }), method === 'POST' ? t('Роль назначена.') : t('Роль отозвана.')); }
  return <>
    <h1 style={{ margin: 0 }}>{t('Сотрудники')}</h1>
    <FormError error={error} />
    {done && <Notice tone="success" live><p>{done}</p></Notice>}
    {loadError ? <ErrorNotice error={loadError} onRetry={() => void load()} /> : !users ? <Loading /> : (
      <div className="table-wrap"><table className="table">
        <thead><tr><th scope="col">{t('Имя')}</th><th scope="col">E-mail</th><th scope="col">{t('Состояние')}</th><th scope="col"><span className="visually-hidden">{t('Действия')}</span></th></tr></thead>
        <tbody>{users.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.isActive ? t('Активен') : t('Отключён')}</td>
          <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => void run(() => apiSend(`/admin/users/${u.id}`, 'PATCH', { isActive: !u.isActive }), u.isActive ? t('Учётная запись отключена, сессии завершены.') : t('Учётная запись включена.'))}>{u.isActive ? t('Отключить') : t('Включить')}<span className="visually-hidden">: {u.name}</span></button></td></tr>)}</tbody>
      </table></div>
    )}
    {canAssign && users && <section className="card card-flat stack" aria-labelledby="assign-title">
      <h2 id="assign-title" style={{ fontSize: '1.15rem' }}>{t('Назначение роли')}</h2>
      <div className="form-grid">
        <div className="field"><label htmlFor={ids.user}>{t('Сотрудник')}</label><select id={ids.user} className="select" value={grant.userId} onChange={e => setGrant(g => ({ ...g, userId: e.target.value }))}><option value="">{t('Выберите…')}</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select></div>
        <div className="field"><label htmlFor={ids.role}>{t('Роль')}</label><select id={ids.role} className="select" value={grant.roleId} onChange={e => setGrant(g => ({ ...g, roleId: e.target.value }))}><option value="">{t('Выберите…')}</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div className="field"><label htmlFor={ids.branch}>{t('Область')}</label><select id={ids.branch} className="select" value={grant.branchId} onChange={e => setGrant(g => ({ ...g, branchId: e.target.value }))}><option value="">{t('Весь архив')}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      </div>
      <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={!grant.userId || !grant.roleId} onClick={() => assign('POST')}>{t('Назначить')}</button><button type="button" className="btn btn-secondary btn-sm" disabled={!grant.userId || !grant.roleId} onClick={() => assign('DELETE')}>{t('Отозвать')}</button></div>
    </section>}
    <form className="card card-flat stack" onSubmit={create}>
      <h2 style={{ fontSize: '1.15rem' }}>{t('Новый сотрудник')}</h2>
      <div className="form-grid">
        <div className="field"><label htmlFor={ids.name} className="required">{t('Имя')}</label><input id={ids.name} className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="field"><label htmlFor={ids.email} className="required">E-mail</label><input id={ids.email} className="input" type="email" autoComplete="off" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
        <div className="field"><label htmlFor={ids.password} className="required">{t('Пароль (от 12 символов)')}</label><input id={ids.password} className="input" type="password" autoComplete="new-password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
      </div>
      <div><button type="submit" className="btn btn-primary">{t('Создать')}</button></div>
    </form>
  </>;
}
