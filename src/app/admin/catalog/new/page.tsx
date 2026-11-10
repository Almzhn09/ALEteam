'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { Notice } from '@/components/ui';
import { FormError } from '../../AdminShell';
import { DocumentFields, emptyDoc, metadataPayload } from '../DocumentForm';

function NewDocument() {
  const { t } = useI18n();
  const router = useRouter();
  const fundId = useSearchParams().get('fundId') ?? '';
  const [form, setForm] = useState(emptyDoc);
  const [cases, setCases] = useState<{ id: string; label: string }[]>([]);
  const [isDemo, setIsDemo] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (fundId) apiGet<{ items: { id: string; number: string; title: string }[] }>(`/admin/catalog/cases?pageSize=50&fundId=${fundId}`).then(r => setCases(r.items.map(c => ({ id: c.id, label: `№ ${c.number}. ${c.title}` }))), () => setCases([])); }, [fundId]);
  if (!fundId) return <Notice tone="warn"><p>{t('Сначала выберите фонд в каталоге.')}</p></Notice>;
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const { item } = await apiSend<{ item: { id: string } }>('/admin/catalog/documents', 'POST', { ...metadataPayload(form), fundId, isDemo, internalNotes: notes.trim() || null });
      router.push(`/admin/catalog/${item.id}`);
    } catch (err) { setError(err); setBusy(false); }
  }
  return <>
    <h1 style={{ margin: 0 }}>{t('Новая карточка')}</h1>
    <form className="stack" onSubmit={submit} noValidate>
      <DocumentFields value={form} onChange={setForm} structural cases={cases} />
      <div className="field"><label htmlFor="doc-notes">{t('Служебная заметка (не публикуется)')}</label><input id="doc-notes" className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <label className="row" style={{ gap: 'var(--space-2)' }}><input type="checkbox" checked={isDemo} onChange={e => setIsDemo(e.target.checked)} /> {t('Демонстрационный материал')}</label>
      <FormError error={error} />
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t('Сохранение…') : t('Создать черновик')}</button></div>
    </form>
  </>;
}
export default function Page() { return <Suspense><NewDocument /></Suspense>; }
