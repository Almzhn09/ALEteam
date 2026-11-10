'use client';
import { useId, type ReactNode } from 'react';
import type { DocumentType } from '@/contracts/api';
import { typeLabel } from '@/lib/labels';
import { useI18n } from '@/lib/lang';

export interface DocForm {
  title: string; description: string; rights: string; sourceUrl: string; sourceNote: string; authorName: string; organization: string; locality: string;
  storageLocation: string; accessConditions: string; category: string; tags: string;
  reference: string; caseId: string; year: string; yearTo: string; type: DocumentType; originalLanguage: string; leafCount: string; allowDigitalCopy: boolean;
}
export const emptyDoc: DocForm = { title: '', description: '', rights: '', sourceUrl: '', sourceNote: '', authorName: '', organization: '', locality: '', storageLocation: '', accessConditions: '', category: '', tags: '', reference: '', caseId: '', year: '', yearTo: '', type: 'LETTER', originalLanguage: '', leafCount: '', allowDigitalCopy: false };
const nullable = (v: string) => (v.trim() ? v.trim() : null);
const TEXT_KEYS = ['sourceUrl', 'sourceNote', 'authorName', 'organization', 'locality', 'storageLocation', 'accessConditions', 'category'] as const;
export function textPayload(f: DocForm) {
  return { title: f.title.trim(), description: f.description.trim(), rights: f.rights.trim(), ...Object.fromEntries(TEXT_KEYS.map(k => [k, nullable(f[k])])), tags: f.tags.split(',').map(x => x.trim()).filter(Boolean) };
}
export function metadataPayload(f: DocForm) {
  return { ...textPayload(f), reference: f.reference.trim(), caseId: nullable(f.caseId), year: Number(f.year), yearTo: f.yearTo.trim() ? Number(f.yearTo) : null, type: f.type, originalLanguage: nullable(f.originalLanguage), leafCount: f.leafCount.trim() ? Number(f.leafCount) : null };
}
export function formFrom(payload: Record<string, unknown>): DocForm {
  const s = (k: string) => (payload[k] === null || payload[k] === undefined ? '' : String(payload[k]));
  return { ...emptyDoc, ...Object.fromEntries(Object.keys(emptyDoc).filter(k => !['tags', 'type', 'allowDigitalCopy'].includes(k)).map(k => [k, s(k)])), tags: Array.isArray(payload.tags) ? (payload.tags as string[]).join(', ') : '', type: (payload.type as DocumentType) ?? 'LETTER', allowDigitalCopy: payload.allowDigitalCopy === true } as DocForm;
}

function F({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: (id: string) => ReactNode }) {
  const { t } = useI18n(); const id = useId();
  return <div className={`field${wide ? ' wide' : ''}`}><label htmlFor={id} className={required ? 'required' : undefined}>{t(label)}</label>{children(id)}</div>;
}

export function DocumentFields({ value, onChange, structural, cases, disabled }: { value: DocForm; onChange(v: DocForm): void; structural: boolean; cases: { id: string; label: string }[]; disabled?: boolean }) {
  const { t } = useI18n();
  const input = (k: keyof DocForm, type = 'text') => (id: string) => <input id={id} className="input" type={type} value={value[k] as string} onChange={e => onChange({ ...value, [k]: e.target.value })} />;
  return (
    <fieldset disabled={disabled}><legend className="visually-hidden">{t('Поля материала')}</legend>
      <div className="form-grid">
        <F wide required label="Заголовок">{input('title')}</F>
        <F wide required label="Описание">{id => <textarea id={id} className="textarea" rows={5} value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} />}</F>
        <F wide required label="Права использования">{input('rights')}</F>
        {structural && <>
          <F required label="Архивный шифр">{input('reference')}</F>
          <F label="Дело">{id => <select id={id} className="select" value={value.caseId} onChange={e => onChange({ ...value, caseId: e.target.value })}><option value="">{t('Не указано')}</option>{cases.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}</F>
          <F required label="Год">{input('year', 'number')}</F>
          <F label="Год по">{input('yearTo', 'number')}</F>
          <F required label="Тип документа">{id => <select id={id} className="select" value={value.type} onChange={e => onChange({ ...value, type: e.target.value as DocumentType })}>{Object.entries(typeLabel).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>}</F>
          <F label="Язык оригинала">{input('originalLanguage')}</F>
          <F label="Количество листов">{input('leafCount', 'number')}</F>
        </>}
        <F label="Автор">{input('authorName')}</F>
        <F label="Организация">{input('organization')}</F>
        <F label="Населённый пункт">{input('locality')}</F>
        <F label="Категория">{input('category')}</F>
        <F label="Темы">{input('tags')}</F>
        <F label="Место хранения">{input('storageLocation')}</F>
        <F wide label="Условия доступа">{input('accessConditions')}</F>
        <F label="Ссылка на источник">{input('sourceUrl', 'url')}</F>
        <F label="Происхождение">{input('sourceNote')}</F>
      </div>
    </fieldset>
  );
}
