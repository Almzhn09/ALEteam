'use client';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import type { ContentKind, ContentPayload, ContentPayloadInput, PublicationState } from '@/contracts/cms';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { FormError } from './AdminShell';

export const kindLabel: Record<ContentKind, string> = {
  PAGE: 'Страница', FAQ: 'Вопрос и ответ', NEWS: 'Новость', COLLECTION: 'Коллекция', PERSON: 'Личность', EVENT: 'Событие', MEMOIR: 'Воспоминание',
  EXHIBITION: 'Выставка', EXHIBIT: 'Экспонат', BRANCH_PROFILE: 'Профиль филиала', SETTING: 'Настройка сайта',
};
export const stateLabel: Record<PublicationState, string> = {
  DRAFT: 'Черновик', IN_REVIEW: 'На проверке', CHANGES_REQUESTED: 'Требует доработки', APPROVED: 'Одобрено', PUBLISHED: 'Опубликовано', ARCHIVED: 'В архиве',
};
export function StateBadge({ status }: { status: PublicationState }) {
  const { t } = useI18n();
  return <span className={`badge badge-${status}`}>{t(stateLabel[status])}</span>;
}

export const emptyPayload = (): ContentPayload => ({ title: '', body: '', rights: '', tags: [], documentIds: [], contentIds: [], fileIds: [], exhibitIds: [], seoKeywords: [], links: [] });
const csv = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);
const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
const text = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

// The API rejects empty optional strings, so unset fields are omitted rather than sent blank.
export function cleanPayload(p: ContentPayload): ContentPayloadInput {
  return { title: p.title.trim(), body: p.body.trim(), rights: p.rights.trim(), sourceUrl: text(p.sourceUrl), sourceNote: text(p.sourceNote), date: text(p.date), yearFrom: p.yearFrom, yearTo: p.yearTo,
    category: text(p.category), tags: p.tags, documentIds: p.documentIds, contentIds: p.contentIds, fileIds: p.fileIds, exhibitIds: p.exhibitIds,
    address: text(p.address), phone: text(p.phone), email: text(p.email), hours: text(p.hours), latitude: p.latitude, longitude: p.longitude,
    seoDescription: text(p.seoDescription), seoKeywords: p.seoKeywords, links: p.links };
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: (id: string) => ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  return <div className={`field${wide ? ' wide' : ''}`}><label htmlFor={id} className={required ? 'required' : undefined}>{t(label)}</label>{children(id)}</div>;
}

export function ExhibitOrder({ value, onChange, options }: { value: string[]; onChange(v: string[]): void; options: { id: string; title: string }[] }) {
  const { t } = useI18n();
  const id = useId();
  const title = (x: string) => options.find(o => o.id === x)?.title ?? x;
  const move = (i: number, d: number) => { const n = [...value]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  const free = options.filter(o => !value.includes(o.id));
  return (
    <div className="stack wide" style={{ gridColumn: '1 / -1' }}>
      <span className="label">{t('Экспонаты по порядку')}</span>
      <ol className="order-list">
        {value.map((x, i) => (
          <li key={x}><span>{i + 1}. {title(x)}</span>
            <span className="row" style={{ gap: 'var(--space-1)' }}>
              <button type="button" className="btn btn-secondary btn-sm btn-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${t('Выше')}: ${title(x)}`}>↑</button>
              <button type="button" className="btn btn-secondary btn-sm btn-icon" disabled={i === value.length - 1} onClick={() => move(i, 1)} aria-label={`${t('Ниже')}: ${title(x)}`}>↓</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(value.filter(v => v !== x))} aria-label={`${t('Убрать')}: ${title(x)}`}>{t('Убрать')}</button>
            </span></li>
        ))}
      </ol>
      {free.length > 0 && <div className="field"><label htmlFor={id}>{t('Добавить экспонат')}</label>
        <select id={id} className="select" value="" onChange={e => e.target.value && onChange([...value, e.target.value])}><option value="">{t('Выберите…')}</option>{free.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select></div>}
    </div>
  );
}

export function PayloadForm({ kind, value, onChange, exhibits, disabled }: { kind: ContentKind; value: ContentPayload; onChange(p: ContentPayload): void; exhibits: { id: string; title: string }[]; disabled?: boolean }) {
  const { t } = useI18n();
  const set = <K extends keyof ContentPayload>(key: K, v: ContentPayload[K]) => onChange({ ...value, [key]: v });
  const input = (key: 'title' | 'rights' | 'sourceUrl' | 'sourceNote' | 'category' | 'address' | 'phone' | 'email' | 'hours' | 'seoDescription', type = 'text') => (id: string) =>
    <input id={id} className="input" type={type} value={value[key] ?? ''} onChange={e => set(key, e.target.value)} />;
  const list = (key: 'tags' | 'documentIds' | 'contentIds' | 'fileIds' | 'seoKeywords') => (id: string) =>
    <input id={id} className="input" defaultValue={value[key].join(', ')} onBlur={e => set(key, csv(e.target.value))} aria-describedby="csv-hint" />;
  const number = (key: 'yearFrom' | 'yearTo' | 'latitude' | 'longitude', step = '1') => (id: string) =>
    <input id={id} className="input" type="number" step={step} value={value[key] ?? ''} onChange={e => set(key, num(e.target.value))} />;
  const isBranch = kind === 'BRANCH_PROFILE';
  return (
    <fieldset disabled={disabled}>
      <legend className="visually-hidden">{t('Поля материала')}</legend>
      <div className="form-grid">
        <Field wide required label="Заголовок">{input('title')}</Field>
        <Field wide required label="Текст">{id => <textarea id={id} className="textarea" rows={8} value={value.body} onChange={e => set('body', e.target.value)} />}</Field>
        <Field wide required label="Права использования">{input('rights')}</Field>
        <Field label="Ссылка на источник">{input('sourceUrl', 'url')}</Field>
        <Field label="Происхождение">{input('sourceNote')}</Field>
        <Field label="Дата">{id => <input id={id} className="input" type="date" value={value.date ?? ''} onChange={e => set('date', e.target.value)} />}</Field>
        <Field label="Год с">{number('yearFrom')}</Field>
        <Field label="Год по">{number('yearTo')}</Field>
        <Field label="Категория">{input('category')}</Field>
        <Field label="Темы">{list('tags')}</Field>
        {isBranch && <>
          <Field wide required label="Адрес">{input('address')}</Field>
          <Field required label="Телефон">{input('phone')}</Field>
          <Field required label="E-mail">{input('email', 'email')}</Field>
          <Field required wide label="Время работы">{input('hours')}</Field>
          <Field required label="Широта">{number('latitude', 'any')}</Field>
          <Field required label="Долгота">{number('longitude', 'any')}</Field>
        </>}
        {kind === 'EXHIBITION' && <ExhibitOrder value={value.exhibitIds} onChange={v => set('exhibitIds', v)} options={exhibits} />}
        <Field label="ID файлов">{list('fileIds')}</Field>
        <Field label="ID документов">{list('documentIds')}</Field>
        <Field label="ID связанных материалов">{list('contentIds')}</Field>
        <Field wide label="Ссылки (название | адрес, по одной в строке)">{id => (
          <textarea id={id} className="textarea" rows={3} defaultValue={value.links.map(l => `${l.label} | ${l.url}`).join('\n')}
            onBlur={e => set('links', e.target.value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(([a, b]) => a && b).map(([label, url]) => ({ label, url })))} />
        )}</Field>
        <Field wide label="Описание для поисковиков">{input('seoDescription')}</Field>
        <Field wide label="Ключевые слова">{list('seoKeywords')}</Field>
      </div>
      <p id="csv-hint" className="hint">{t('Списки указываются через запятую. Поля со звёздочкой обязательны.')}</p>
    </fieldset>
  );
}

interface Event { id: string; fromStatus: PublicationState; toStatus: PublicationState; reason: string; createdAt: string }
type Transition = { to: Exclude<PublicationState, 'DRAFT'>; label: string; permission: string };
const transitions: Partial<Record<PublicationState, Transition[]>> = {
  DRAFT: [{ to: 'IN_REVIEW', label: 'Отправить на проверку', permission: 'write' }],
  CHANGES_REQUESTED: [{ to: 'IN_REVIEW', label: 'Отправить на проверку', permission: 'write' }],
  IN_REVIEW: [{ to: 'CHANGES_REQUESTED', label: 'Вернуть на доработку', permission: 'content.review' }, { to: 'APPROVED', label: 'Одобрить', permission: 'content.review' }],
  APPROVED: [{ to: 'PUBLISHED', label: 'Опубликовать', permission: 'content.publish' }],
  PUBLISHED: [{ to: 'ARCHIVED', label: 'Снять с публикации', permission: 'content.publish' }],
};

export function RevisionWorkflow({ revision, can, writePermission, onChanged }: {
  revision: { id: string; status: PublicationState; updatedAt: string }; can(permission: string): boolean; writePermission: string; onChanged(): Promise<void> | void;
}) {
  const { t, formatDate } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const id = useId();
  const loadEvents = useCallback(() => { apiGet<{ items: Event[] }>(`/admin/revisions/${revision.id}/events?pageSize=50`).then(r => setEvents(r.items), () => setEvents([])); }, [revision.id]);
  useEffect(() => { loadEvents(); }, [loadEvents, revision.updatedAt]);
  async function go(to: Transition['to']) {
    if (reason.trim().length < 3) return setError(new Error('reason'));
    setBusy(true); setError(null);
    try {
      await apiSend(`/admin/revisions/${revision.id}/transition`, 'POST', { status: to, expectedUpdatedAt: revision.updatedAt, reason: reason.trim() });
      setReason(''); await onChanged();
    } catch (e) { setError(e); await onChanged(); } finally { setBusy(false); }
  }
  const options = (transitions[revision.status] ?? []).filter(x => can(x.permission === 'write' ? writePermission : x.permission));
  return (
    <section className="card card-flat stack" aria-label={t('Согласование')}>
      <div className="row" style={{ gap: 'var(--space-2)' }}><strong>{t('Состояние')}:</strong> <StateBadge status={revision.status} /></div>
      {options.length > 0 && <>
        <div className="field"><label htmlFor={id} className="required">{t('Причина или комментарий')}</label><input id={id} className="input" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></div>
        <div className="row">{options.map(x => <button key={x.to} type="button" className={`btn btn-sm ${x.to === 'CHANGES_REQUESTED' ? 'btn-secondary' : 'btn-primary'}`} disabled={busy} onClick={() => void go(x.to)}>{t(x.label)}</button>)}</div>
      </>}
      {error instanceof Error && error.message === 'reason' ? <p className="field-error" role="alert">{t('Укажите причину: от 3 до 500 символов.')}</p> : <FormError error={error} />}
      {events && events.length > 0 && <details><summary>{t('История согласования')} ({events.length})</summary>
        <ol className="small">{events.map(e => <li key={e.id}>{formatDate(e.createdAt)}: {t(stateLabel[e.fromStatus])} → {t(stateLabel[e.toStatus])} — {e.reason}</li>)}</ol></details>}
    </section>
  );
}
