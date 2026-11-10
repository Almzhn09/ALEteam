'use client';
import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { locales, type ContentLocale, type PublicationState } from '@/contracts/cms';
import { ApiClientError, apiGet, apiSend } from '@/lib/api';
import { langName } from '@/lib/i18n';
import { useI18n } from '@/lib/lang';
import { DemoBadge, ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../../AdminShell';
import { RevisionWorkflow, StateBadge } from '../../editorial';
import { DocumentFields, emptyDoc, formFrom, metadataPayload, textPayload } from '../DocumentForm';
import { UploadList } from '../Uploads';

interface Revision { id: string; locale: ContentLocale; status: PublicationState; payload: Record<string, unknown>; updatedAt: string }
interface Doc { id: string; title: string; reference: string; isPublic: boolean; isDemo: boolean; deletedAt: string | null; updatedAt: string; internalNotes: string | null; fundId: string; allowDigitalCopy: boolean; fund: { branchId: string | null }; contentItem: { revisions: Revision[] } | null }
const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'];
const FINISHED = ['PUBLISHED', 'ARCHIVED'];

export default function DocumentEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const staff = useStaff();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [locale, setLocale] = useState<ContentLocale>('ru');
  const [form, setForm] = useState(emptyDoc);
  const [formKey, setFormKey] = useState('');
  // Set after a 409: the next reload must not overwrite what the user typed.
  const [keepDraft, setKeepDraft] = useState(false);
  const [cases, setCases] = useState<{ id: string; label: string }[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoadError(null);
    try { const { item } = await apiGet<{ item: Doc }>(`/admin/catalog/documents/${encodeURIComponent(id)}`); setDoc(item); setNotes(item.internalNotes ?? ''); }
    catch (e) { setLoadError(e); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (doc?.fundId) apiGet<{ items: { id: string; number: string; title: string }[] }>(`/admin/catalog/cases?pageSize=50&fundId=${doc.fundId}`).then(r => setCases(r.items.map(c => ({ id: c.id, label: `№ ${c.number}. ${c.title}` }))), () => setCases([])); }, [doc?.fundId]);
  const revisions = doc?.contentItem?.revisions ?? [];
  const latest = revisions.find(r => r.locale === locale);
  useEffect(() => {
    const key = latest ? `${latest.id}:${latest.updatedAt}` : `new:${locale}`;
    if (key === formKey) return;
    if (keepDraft && latest && formKey.startsWith(`${latest.id}:`)) { setFormKey(key); return; }
    // A refresh of the same revision keeps the success message; another revision or language clears it.
    const sameRevision = !!latest && formKey.startsWith(`${latest.id}:`);
    setFormKey(key); setForm(latest?.payload ? formFrom(latest.payload) : emptyDoc); if (!sameRevision) setSaved('');
  }, [latest, locale, formKey]);

  if (loadError) return loadError instanceof ApiClientError && loadError.status === 404 ? <Notice tone="error" title={t('Документ не найден')}><p>{t('Он не существует или недоступен в вашей области.')}</p></Notice> : <ErrorNotice error={loadError} onRetry={() => void load()} />;
  if (!doc) return <Loading />;
  const branch = doc.fund.branchId;
  const can = (permission: string) => staff.can(permission, branch);
  const writable = can('catalog.write') && !doc.deletedAt;
  const editable = !!latest && EDITABLE.includes(latest.status) && writable;
  const canStartNew = (!latest || FINISHED.includes(latest.status)) && writable;
  const structural = locale === 'ru';
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true); setError(null); setSaved('');
    try { await work(); setKeepDraft(false); setSaved(message); await load(); }
    catch (err) { setError(err); if (err instanceof ApiClientError && err.status === 409) { setKeepDraft(true); await load(); } }
    finally { setBusy(false); }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    const payload = structural ? { ...metadataPayload(form), allowDigitalCopy: form.allowDigitalCopy } : textPayload(form);
    void act(() => editable ? apiSend(`/admin/revisions/${latest!.id}`, 'PATCH', { expectedUpdatedAt: latest!.updatedAt, payload })
      : apiSend(`/admin/catalog/documents/${doc!.id}/revisions`, 'POST', { locale, payload }), t('Сохранено.'));
  }
  return <>
    <p className="small" style={{ margin: 0 }}><Link href="/admin/catalog">← {t('Каталог')}</Link></p>
    <div className="row" style={{ gap: 'var(--space-2)' }}><h1 style={{ margin: 0 }}>{doc.title}</h1><DemoBadge show={doc.isDemo} /></div>
    <p className="small muted" style={{ margin: 0 }}><span className="mono">{doc.reference}</span> · {doc.deletedAt ? t('В корзине') : doc.isPublic ? t('Опубликован') : t('Закрыт')}{doc.isPublic && <> · <Link href={`/documents/${doc.id}`}>{t('Открыть на сайте')}</Link></>}</p>
    <div className="locale-tabs" role="group" aria-label={t('Язык редакции')}>
      {locales.map(l => { const r = revisions.find(x => x.locale === l); return <button key={l} type="button" className="btn btn-secondary btn-sm" aria-pressed={l === locale} onClick={() => { setLocale(l); setError(null); setKeepDraft(false); }}>{langName[l]}{r ? <>&nbsp;<StateBadge status={r.status} /></> : ` · ${t('нет')}`}</button>; })}
    </div>
    {latest && <RevisionWorkflow revision={latest} can={can} writePermission="catalog.write" onChanged={load} />}
    <form className="stack" onSubmit={save} noValidate>
      <DocumentFields key={formKey} value={form} onChange={setForm} structural={structural} cases={cases} disabled={!editable && !canStartNew} />
      {structural && <label className="row" style={{ gap: 'var(--space-2)' }}><input type="checkbox" checked={form.allowDigitalCopy} disabled={!editable && !canStartNew} onChange={e => setForm(f => ({ ...f, allowDigitalCopy: e.target.checked }))} /> {t('Разрешить публичный показ цифровой копии')}</label>}
      <FormError error={error} />
      {keepDraft && <Notice tone="warn" live><p>{t('На сервере появилась более новая версия. Ваш текст остался в форме: сохраните его, чтобы заменить версию на сервере, или загрузите серверную версию.')}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setKeepDraft(false); setFormKey(''); setError(null); }}>{t('Загрузить серверную версию')}</button></Notice>}
      {saved && <Notice tone="success" live><p>{saved}</p></Notice>}
      {(editable || canStartNew) && <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Сохранение…') : editable ? t('Сохранить') : t('Создать новую редакцию')}</button></div>}
    </form>
    <section className="stack" aria-labelledby="uploads-title">
      <h2 id="uploads-title">{t('Файлы цифровой копии')}</h2>
      <UploadList documentId={doc.id} branchId={branch} writable={writable} />
    </section>
    {can('catalog.write') && <section className="card card-flat stack" aria-label={t('Служебные действия')}>
      <div className="field"><label htmlFor="doc-notes">{t('Служебная заметка (не публикуется)')}</label><input id="doc-notes" className="input" value={notes} onChange={e => setNotes(e.target.value)} disabled={!!doc.deletedAt} /></div>
      <div className="row">
        {!doc.deletedAt && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => apiSend(`/admin/catalog/documents/${doc.id}`, 'PATCH', { internalNotes: notes.trim() || null, expectedUpdatedAt: doc.updatedAt }), t('Заметка сохранена.'))}>{t('Сохранить заметку')}</button>}
        {!doc.deletedAt ? <button type="button" className="btn btn-danger btn-sm" disabled={busy || doc.isPublic} onClick={() => void act(() => apiSend(`/admin/catalog/documents/${doc.id}`, 'DELETE', { expectedUpdatedAt: doc.updatedAt }), t('Карточка перемещена в корзину.'))}>{t('В корзину')}</button>
          : <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void act(() => apiSend(`/admin/catalog/documents/${doc.id}/restore`, 'POST', { expectedUpdatedAt: doc.updatedAt }), t('Карточка восстановлена и остаётся закрытой.'))}>{t('Восстановить')}</button>}
      </div>
    </section>}
  </>;
}
