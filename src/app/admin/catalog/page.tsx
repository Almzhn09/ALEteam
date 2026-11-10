'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { DemoBadge, ErrorNotice, Loading, Notice } from '@/components/ui';
import { typeLabel } from '@/lib/labels';
import { FormError, useStaff } from '../AdminShell';

interface Node { id: string; number: string | null; name?: string; title?: string; fundId?: string; inventoryId?: string; branchId?: string | null }
interface Doc { id: string; title: string; reference: string; year: number; isPublic: boolean; isDemo: boolean; deletedAt: string | null; fundId: string; updatedAt: string }
const list = <T,>(kind: string, query = '') => apiGet<{ items: T[] }>(`/admin/catalog/${kind}?pageSize=50${query}`).then(r => r.items);

function Quick({ title, fields, onSubmit, disabled }: { title: string; fields: { key: string; label: string }[]; onSubmit(values: Record<string, string>): Promise<void>; disabled?: boolean }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const id = useId();
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await onSubmit(values); setValues({}); } catch (err) { setError(err); }
  }
  return (
    <details className="card card-flat"><summary>{t(title)}</summary>
      <form className="stack" onSubmit={submit} style={{ marginTop: 'var(--space-3)' }}>
        <fieldset disabled={disabled}><div className="form-grid">{fields.map(f => <div className="field" key={f.key}><label htmlFor={`${id}${f.key}`} className="required">{t(f.label)}</label><input id={`${id}${f.key}`} className="input" value={values[f.key] ?? ''} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} /></div>)}</div></fieldset>
        <FormError error={error} />
        <div><button type="submit" className="btn btn-primary btn-sm" disabled={disabled}>{t('Создать')}</button></div>
      </form>
    </details>
  );
}
const name = (n: Node) => `${n.number ? `№ ${n.number}. ` : ''}${n.name ?? n.title ?? ''}`;
function Column({ title, children }: { title: string; children: ReactNode }) { return <section className="stack" aria-label={title}><h2 style={{ fontSize: '1.05rem', margin: 0 }}>{title}</h2>{children}</section>; }

export default function CatalogAdmin() {
  const { t } = useI18n();
  const staff = useStaff();
  const [funds, setFunds] = useState<Node[] | null>(null);
  const [inventories, setInventories] = useState<Node[]>([]);
  const [cases, setCases] = useState<Node[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [fund, setFund] = useState('');
  const [inventory, setInventory] = useState('');
  const [trash, setTrash] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [branch, setBranch] = useState('');
  const branchId = useId();
  const canWrite = staff.grants.some(g => g.permission === 'catalog.write');
  const loadFunds = useCallback(async () => { setError(null); try { setFunds(await list<Node>('funds')); } catch (e) { setError(e); } }, []);
  const loadFund = useCallback(async () => {
    if (!fund) { setInventories([]); setCases([]); setDocs([]); return; }
    try {
      const [i, c, d] = await Promise.all([list<Node>('inventories', `&fundId=${fund}`), list<Node>('cases', `&fundId=${fund}`), list<Doc>('documents', `&fundId=${fund}${trash ? '&includeDeleted=1' : ''}`)]);
      setInventories(i); setCases(c); setDocs(d);
    } catch (e) { setError(e); }
  }, [fund, trash]);
  useEffect(() => { void loadFunds(); apiGet<{ items: { id: string; name: string }[] }>('/admin/branches?pageSize=50').then(r => setBranches(r.items), () => setBranches([])); }, [loadFunds]);
  useEffect(() => { setInventory(''); }, [fund]);
  useEffect(() => { void loadFund(); }, [loadFund]);
  if (error) return <ErrorNotice error={error} onRetry={() => void loadFunds()} />;
  if (!funds) return <Loading />;
  const visibleCases = inventory ? cases.filter(c => c.inventoryId === inventory) : cases;
  const pick = (selected: boolean) => `btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`;
  return <>
    <h1 style={{ margin: 0 }}>{t('Каталог')}</h1>
    <Notice tone="info" title={t('Загрузка файлов и импорт пока недоступны')}><p>{t('Для загрузки сканов, карантина и импорта CSV/XLSX ещё нет серверных функций. Карточки создаются и согласуются здесь.')}</p></Notice>
    <Column title={t('Фонды')}>
      <div className="row">{funds.map(f => <button key={f.id} type="button" className={pick(f.id === fund)} aria-pressed={f.id === fund} onClick={() => setFund(f.id)}>{name(f)}</button>)}</div>
      {canWrite && <div className="field" style={{ maxWidth: 320 }}><label htmlFor={branchId}>{t('Филиал нового фонда')}</label><select id={branchId} className="select" value={branch} onChange={e => setBranch(e.target.value)}><option value="">{t('Выберите…')}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
      {canWrite && <Quick title="Новый фонд" disabled={!branch} fields={[{ key: 'number', label: 'Номер' }, { key: 'name', label: 'Название' }, { key: 'description', label: 'Описание' }]}
        onSubmit={async v => { await apiSend('/admin/catalog/funds', 'POST', { branchId: branch, number: v.number, name: v.name, description: v.description }); await loadFunds(); }} />}
    </Column>
    {fund && <>
      <Column title={t('Описи')}>
        <div className="row">{inventories.map(i => <button key={i.id} type="button" className={pick(i.id === inventory)} aria-pressed={i.id === inventory} onClick={() => setInventory(v => v === i.id ? '' : i.id)}>{name(i)}</button>)}</div>
        {canWrite && <Quick title="Новая опись" fields={[{ key: 'number', label: 'Номер' }, { key: 'title', label: 'Название' }]} onSubmit={async v => { await apiSend('/admin/catalog/inventories', 'POST', { fundId: fund, number: v.number, title: v.title }); await loadFund(); }} />}
      </Column>
      <Column title={t('Дела')}>
        {visibleCases.length ? <ul className="small" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>{visibleCases.map(c => <li key={c.id}>{name(c)}</li>)}</ul> : <p className="muted small">{t('Дел пока нет.')}</p>}
        {canWrite && <Quick title="Новое дело" disabled={!inventory} fields={[{ key: 'number', label: 'Номер' }, { key: 'title', label: 'Название' }]} onSubmit={async v => { await apiSend('/admin/catalog/cases', 'POST', { fundId: fund, inventoryId: inventory, number: v.number, title: v.title }); await loadFund(); }} />}
      </Column>
      <Column title={t('Документы')}>
        <div className="row">
          {canWrite && <Link className="btn btn-primary btn-sm" href={`/admin/catalog/new?fundId=${fund}`}>{t('Новая карточка')}</Link>}
          <label className="row small" style={{ gap: 'var(--space-1)' }}><input type="checkbox" checked={trash} onChange={e => setTrash(e.target.checked)} /> {t('Показать корзину')}</label>
        </div>
        {!docs.length ? <p className="muted small">{t('Документов пока нет.')}</p> : <div className="table-wrap"><table className="table">
          <thead><tr><th scope="col">{t('Заголовок')}</th><th scope="col">{t('Шифр')}</th><th scope="col">{t('Год')}</th><th scope="col">{t('Состояние')}</th></tr></thead>
          <tbody>{docs.map(d => <tr key={d.id}><td><Link href={`/admin/catalog/${d.id}`}>{d.title}</Link> <DemoBadge show={d.isDemo} /></td><td className="mono small">{d.reference}</td><td>{d.year}</td><td>{d.deletedAt ? t('В корзине') : d.isPublic ? t('Опубликован') : t('Закрыт')}</td></tr>)}</tbody>
        </table></div>}
      </Column>
    </>}
    <p className="small muted">{Object.values(typeLabel).length > 0 ? t('Новая карточка всегда закрыта; публикация проходит согласование.') : ''}</p>
  </>;
}
