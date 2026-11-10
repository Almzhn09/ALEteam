'use client';
import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { locales, type ContentLocale, type ContentPayload, type ContentRevision, type Page, type StaffContentItem } from '@/contracts/cms';
import { ApiClientError, apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { langName } from '@/lib/i18n';
import { DemoBadge, ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../../AdminShell';
import { PayloadForm, RevisionWorkflow, StateBadge, cleanPayload, emptyPayload, kindLabel } from '../../editorial';

const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'];
const FINISHED = ['PUBLISHED', 'ARCHIVED'];

export default function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const staff = useStaff();
  const [item, setItem] = useState<StaffContentItem | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [locale, setLocale] = useState<ContentLocale>('ru');
  const [form, setForm] = useState<ContentPayload>(emptyPayload);
  const [formKey, setFormKey] = useState('');
  // Set after a 409: the next reload must not overwrite what the user typed.
  const [keepDraft, setKeepDraft] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exhibits, setExhibits] = useState<{ id: string; title: string }[]>([]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await apiGet<Page<StaffContentItem>>(`/admin/content/${encodeURIComponent(id)}`);
      if (!r.items.length) setMissing(true); else setItem(r.items[0]);
    } catch (e) { setLoadError(e); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { apiGet<Page<StaffContentItem>>('/admin/content?kind=EXHIBIT&pageSize=50').then(r => setExhibits(r.items.map(i => ({ id: i.id, title: i.revisions[0]?.payload.title ?? i.slug }))), () => setExhibits([])); }, []);

  const latest: ContentRevision | undefined = item?.revisions.find(r => r.locale === locale);
  useEffect(() => {
    const key = latest ? `${latest.id}:${latest.updatedAt}` : `new:${locale}`;
    if (key === formKey) return;
    if (keepDraft && latest && formKey.startsWith(`${latest.id}:`)) { setFormKey(key); return; }
    // A refresh of the same revision keeps the success message; another revision or language clears it.
    const sameRevision = !!latest && formKey.startsWith(`${latest.id}:`);
    setFormKey(key); setForm(latest ? { ...emptyPayload(), ...latest.payload } : emptyPayload()); if (!sameRevision) setSaved(false);
  }, [latest, locale, formKey]);

  if (loadError) return <ErrorNotice error={loadError} onRetry={() => void load()} />;
  if (missing) return <Notice tone="error" title={t('Материал не найден')}><p>{t('Он не существует или недоступен в вашей области.')}</p></Notice>;
  if (!item) return <Loading />;

  const can = (permission: string) => staff.can(permission, item.branchId);
  const writePermission = 'content.write';
  const editable = !!latest && EDITABLE.includes(latest.status) && can(writePermission);
  const canStartNew = (!latest || FINISHED.includes(latest.status)) && can(writePermission);
  // Reference text is copied only on request; machine translation is never implied.
  const sources = locales.filter(l => l !== locale && item.revisions.some(r => r.locale === l));

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try {
      if (editable) await apiSend(`/admin/revisions/${latest!.id}`, 'PATCH', { expectedUpdatedAt: latest!.updatedAt, payload: cleanPayload(form) });
      else await apiSend(`/admin/content/${item!.id}/revisions`, 'POST', { locale, payload: cleanPayload(form) });
      setKeepDraft(false); setSaved(true); await load();
    } catch (err) {
      setError(err);
      if (err instanceof ApiClientError && err.status === 409) { setKeepDraft(true); await load(); }
    } finally { setBusy(false); }
  }
  return <>
    <p className="small" style={{ margin: 0 }}><Link href="/admin/content">← {t('Материалы')}</Link></p>
    <div className="row" style={{ gap: 'var(--space-2)' }}><h1 style={{ margin: 0 }}>{latest?.payload.title || item.slug}</h1><span className="badge badge-neutral">{t(kindLabel[item.kind])}</span><DemoBadge show={item.isDemo} /></div>
    <div className="locale-tabs" role="group" aria-label={t('Язык редакции')}>
      {locales.map(l => {
        const rev = item.revisions.find(r => r.locale === l);
        return <button key={l} type="button" className="btn btn-secondary btn-sm" aria-pressed={l === locale} onClick={() => { setLocale(l); setError(null); setKeepDraft(false); }}>{langName[l]}{rev ? <>&nbsp;<StateBadge status={rev.status} /></> : ` · ${t('нет')}`}</button>;
      })}
    </div>
    {latest && <RevisionWorkflow revision={latest} can={can} writePermission={writePermission} onChanged={load} />}
    <form className="stack" onSubmit={save} noValidate>
      {!latest && sources.length > 0 && <div className="row"><span className="small muted">{t('Подставить текст для перевода:')}</span>{sources.map(l => <button key={l} type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...emptyPayload(), ...item.revisions.find(r => r.locale === l)!.payload })}>{langName[l]}</button>)}</div>}
      {latest && !editable && !canStartNew && <Notice tone="info"><p>{t('В этом состоянии редакцию изменить нельзя.')}</p></Notice>}
      <PayloadForm key={formKey} kind={item.kind} value={form} onChange={setForm} exhibits={exhibits} disabled={!editable && !canStartNew} />
      <FormError error={error} />
      {keepDraft && <Notice tone="warn" live><p>{t('На сервере появилась более новая версия. Ваш текст остался в форме: сохраните его, чтобы заменить версию на сервере, или загрузите серверную версию.')}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setKeepDraft(false); setFormKey(''); setError(null); }}>{t('Загрузить серверную версию')}</button></Notice>}
      {saved && <Notice tone="success" live><p>{t('Сохранено.')}</p></Notice>}
      <div className="row">
        {(editable || canStartNew) && <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Сохранение…') : editable ? t('Сохранить') : t('Создать новую редакцию')}</button>}
        <button type="button" className="btn btn-secondary" aria-expanded={preview} onClick={() => setPreview(v => !v)}>{t('Предпросмотр')}</button>
      </div>
    </form>
    {preview && <section className="card" aria-label={t('Предпросмотр')} lang={locale}>
      <p className="small muted">{t('Так текст увидит посетитель. Это не публикация.')}</p>
      <h2>{form.title}</h2><p className="pre-wrap">{form.body}</p>
      <p className="small muted" style={{ margin: 0 }}>{t('Права')}: {form.rights}{form.sourceNote ? ` · ${form.sourceNote}` : ''}</p>
    </section>}
  </>;
}
