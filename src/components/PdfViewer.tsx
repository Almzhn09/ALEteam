'use client';
import { useEffect, useState } from 'react';
import type { ArchiveFile } from '@/contracts/api';
import { fileUrl } from '@/lib/api';
import { useI18n } from '@/lib/lang';

// /api/files forbids framing, so the validated PDF is fetched and shown from a same-page blob.
// Loaded on request: a card never downloads a PDF just by being opened.
export function PdfViewer({ file, title }: { file: ArchiveFile; title: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    let objectUrl = ''; const controller = new AbortController();
    setFailed(false);
    fetch(fileUrl(file.id), { credentials: 'same-origin', signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('file'); return r.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); setUrl(objectUrl); })
      .catch(e => { if (e?.name !== 'AbortError') setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(''); };
  }, [open, file.id]);
  if (!open) return <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>{t('Просмотреть PDF')}<span className="visually-hidden"> {file.name}</span></button>;
  return (
    <div className="pdf-frame">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>{t('Закрыть просмотр')}</button>
      {failed ? <p className="field-error" role="alert">{t('Не удалось загрузить файл. Попробуйте открыть его в новой вкладке.')}</p>
        : url ? <iframe src={url} title={`${title}: ${file.name}`} /> : <p className="muted small" role="status">{t('Загрузка…')}</p>}
    </div>
  );
}
