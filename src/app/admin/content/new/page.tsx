'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { contentKinds, locales, type ContentKind, type ContentLocale, type ContentPayload, type Page, type StaffContentItem } from '@/contracts/cms';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { langName } from '@/lib/i18n-core';
import { FormError, useStaff } from '../../AdminShell';
import { PayloadForm, cleanPayload, emptyPayload, kindLabel } from '../../editorial';

export default function NewContentPage() {
  const { t } = useI18n();
  const staff = useStaff();
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const [kind, setKind] = useState<ContentKind>('NEWS');
  const [locale, setLocale] = useState<ContentLocale>('ru');
  const [branchId, setBranchId] = useState('');
  const [isDemo, setIsDemo] = useState(true);
  const [payload, setPayload] = useState<ContentPayload>(emptyPayload);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [exhibits, setExhibits] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const ids = { slug: useId(), kind: useId(), locale: useId(), branch: useId() };
  useEffect(() => {
    apiGet<Page<{ id: string; name: string }>>('/admin/branches?pageSize=50').then(r => setBranches(r.items), () => setBranches([]));
    apiGet<Page<StaffContentItem>>('/admin/content?kind=EXHIBIT&pageSize=50').then(r => setExhibits(r.items.map(i => ({ id: i.id, title: i.revisions[0]?.payload.title ?? i.slug }))), () => setExhibits([]));
  }, []);
  const available = contentKinds.filter(k => k !== 'SETTING' || staff.can('settings.manage'));
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const { item } = await apiSend<{ item: StaffContentItem }>('/admin/content', 'POST', { slug: slug.trim(), kind, branchId: branchId || null, isDemo, locale, payload: cleanPayload(payload) });
      router.push(`/admin/content/${item.id}`);
    } catch (err) { setError(err); setBusy(false); }
  }
  return <>
    <h1 style={{ margin: 0 }}>{t('Новый материал')}</h1>
    <form className="stack" onSubmit={submit} noValidate>
      <div className="card card-flat form-grid">
        <div className="field"><label htmlFor={ids.slug} className="required">{t('Адрес (латиница, цифры, дефис)')}</label><input id={ids.slug} className="input" value={slug} maxLength={100} onChange={e => setSlug(e.target.value.toLowerCase())} /></div>
        <div className="field"><label htmlFor={ids.kind}>{t('Тип материала')}</label><select id={ids.kind} className="select" value={kind} onChange={e => setKind(e.target.value as ContentKind)}>{available.map(k => <option key={k} value={k}>{t(kindLabel[k])}</option>)}</select></div>
        <div className="field"><label htmlFor={ids.locale}>{t('Язык первой редакции')}</label><select id={ids.locale} className="select" value={locale} onChange={e => setLocale(e.target.value as ContentLocale)}>{locales.map(l => <option key={l} value={l}>{langName[l]}</option>)}</select></div>
        <div className="field"><label htmlFor={ids.branch} className={kind === 'BRANCH_PROFILE' ? 'required' : undefined}>{t('Филиал')}</label><select id={ids.branch} className="select" value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">{t('Весь архив')}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <label className="row wide" style={{ gap: 'var(--space-2)' }}><input type="checkbox" checked={isDemo} onChange={e => setIsDemo(e.target.checked)} /> {t('Демонстрационный материал')}</label>
      </div>
      <PayloadForm kind={kind} value={payload} onChange={setPayload} exhibits={exhibits} />
      <FormError error={error} />
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Сохранение…') : t('Создать черновик')}</button></div>
    </form>
  </>;
}
