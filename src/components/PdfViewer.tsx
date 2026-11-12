'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { ArchiveFile } from '@/contracts/api';
import { fileUrl } from '@/lib/api';
import { useI18n } from '@/lib/lang';

// /api/files forbids framing, so the validated PDF is fetched and shown from a same-page blob.
// Loaded on request: a card never downloads a PDF just by being opened.
export function PdfViewer({ file, title, href }: { file: Pick<ArchiveFile,'id'|'name'>; title: string; href?:string }) {
  return <PdfPreview key={`${file.id}:${href ?? ''}`} file={file} title={title} href={href} />;
}

function PdfPreview({ file, title, href }: { file: Pick<ArchiveFile,'id'|'name'>; title: string; href?:string }) {
  const { t } = useI18n();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  // 'missing': the server says the file is not there or not allowed (404/403/410) — a new tab or a retry would fail the same way.
  const [failed, setFailed] = useState<false | 'missing' | 'error'>(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open && restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let objectUrl = ''; const controller = new AbortController();
    setFailed(false);
    fetch(href??fileUrl(file.id), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(r => { if ([403, 404, 410].includes(r.status)) throw new Error('missing'); if (!r.ok || r.headers.get('content-type')?.split(';')[0].trim() !== 'application/pdf') throw new Error('file'); return r.blob(); })
      .then(blob => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      })
      .catch(e => { if (e?.name !== 'AbortError') setFailed(e?.message === 'missing' ? 'missing' : 'error'); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(''); };
  }, [open, file.id, href, attempt]);
  return <>
    {!open && <button ref={trigger} type="button" className="btn btn-secondary btn-sm" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(true)}>{t('Просмотреть PDF')}<span className="visually-hidden"> {file.name}</span></button>}
    {open && <div id={id} className="pdf-frame stack">
      <div className="row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { restoreFocus.current = true; setOpen(false); }}>{t('Закрыть просмотр')}</button>
        {failed !== 'missing' && <a className="btn btn-secondary btn-sm" href={href ?? fileUrl(file.id)} target="_blank" rel="noopener noreferrer">{t('Открыть в новой вкладке')}<span className="visually-hidden"> {file.name}</span></a>}
      </div>
      {failed === 'missing' ? <p className="field-error" role="alert">{t('Файл сейчас недоступен на сервере. Сообщите об этом архиву или попробуйте позже.')}</p>
        : failed ? <div className="stack"><p className="field-error" role="alert">{t('Не удалось загрузить файл. Попробуйте открыть его в новой вкладке.')}</p><div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt(n => n + 1)}>{t('Повторить')}</button></div></div>
        : url ? <iframe src={url} title={`${title}: ${file.name}`} /> : <p className="muted small" role="status">{t('Загрузка…')}</p>}
    </div>}
  </>;
}
