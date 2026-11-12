'use client';
import Link from 'next/link';
import { useState } from 'react';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading } from './ui';

export function RecognizedText({ fileId }: { fileId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<{ text: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  async function load() {
    setError(null);
    try { setData((await apiGet<{ item: { text: string } }>(`/files/${encodeURIComponent(fileId)}/ocr`)).item); } catch (e) { setError(e); }
  }
  return <details className="panel" onToggle={e => { if (e.currentTarget.open && !data && !error) void load(); }}>
    <summary>{t('Распознанный текст (OCR)')}</summary>
    <p className="small muted">{t('Автоматическое распознавание может содержать ошибки. Сравните текст с изображением; исходный документ не изменён.')}</p>
    {error ? <ErrorNotice error={error} onRetry={() => void load()} /> : data ? <p className="pre-wrap" lang="ru">{data.text}</p> : <Loading rows={1} />}
  </details>;
}
export function SimilarDocuments({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  async function load() {
    setError(null);
    try { setItems((await apiGet<{ items: { id: string; title: string }[] }>(`/documents/${encodeURIComponent(documentId)}/similar`)).items); } catch (e) { setError(e); }
  }
  return <details className="panel" onToggle={e => { if (e.currentTarget.open && !items && !error) void load(); }}>
    <summary>{t('Похожие документы')}</summary>
    <p className="small muted">{t('Подборка по совпадающим словам. Проверьте описания документов.')}</p>
    {error ? <ErrorNotice error={error} onRetry={() => void load()} /> : !items ? <Loading rows={1} /> : items.length ? <ul>
      {items.map(item => <li key={item.id}><Link lang="ru" href={`/documents/${encodeURIComponent(item.id)}`}>{item.title}</Link></li>)}
    </ul> : <p>{t('Похожие материалы пока не найдены.')}</p>}
  </details>;
}
