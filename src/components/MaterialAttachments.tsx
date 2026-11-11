'use client';
// R-F02/R-F04: published files of a CMS material (/api/discovery/materials/cms/:id/attachments). Bytes are served
// by /api/material-files with no-store, so a withdrawn file disappears on the next load; no copy is kept here.
import { useEffect, useState } from 'react';
import type { AttachmentRef } from '@/contracts/real-content';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { visuals } from '@/lib/visuals';
import { ErrorNotice } from './ui';

const typeName = (mime: string) => mime === 'application/pdf' ? 'PDF' : mime.includes('wordprocessingml') ? 'DOCX' : mime === 'image/png' ? 'PNG' : mime === 'image/jpeg' ? 'JPEG' : mime;
const size = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const isImage = (mime: string) => /^image\/(png|jpeg)$/.test(mime);

export function MaterialAttachments({ id, locale }: { id: string; locale: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<AttachmentRef[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError(null);
    apiGet<{ items: AttachmentRef[] }>(`/discovery/materials/cms/${encodeURIComponent(id)}/attachments?locale=${locale}`, abort.signal)
      .then(r => setItems(r.items), e => { if (e.name !== 'AbortError') { setError(e); setItems([]); } });
    return () => abort.abort();
  }, [id, locale, attempt]);
  if (error) return <ErrorNotice error={error} onRetry={() => retry(a => a + 1)} />;
  if (!items?.length) return null;
  const masters = items.filter(a => a.variant === 'master');
  const previewOf = (master: AttachmentRef) => items.find(a => a.variant === 'preview' && a.parentId === master.id);
  const images = masters.filter(a => isImage(a.mimeType));
  const files = masters.filter(a => !isImage(a.mimeType));
  const hint = t('(откроется в новой вкладке)');
  return (
    <section className="stack attachments" aria-labelledby={`files-${id}`}>
      <h2 id={`files-${id}`}>{t('Файлы материала')}</h2>
      {images.length > 0 && <div className="attachment-images">
        {images.map(img => {
          const known = visuals.find(v => v.sha256 === img.sha256);
          return <figure key={img.id} className="attachment-figure">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.href} alt={known ? t(known.alt) : ''} width={known?.width} height={known?.height} loading="lazy" decoding="async" />
            <figcaption className="small">{known ? t(known.caption) : img.source.label}{known && <span className="muted"> · {t('Фото:')} {t(known.credit)}</span>}</figcaption>
          </figure>;
        })}
      </div>}
      {files.length > 0 && <ul className="attachment-list">
        {files.map(file => {
          const preview = previewOf(file);
          const inline = file.mimeType === 'application/pdf';
          return <li key={file.id} className="attachment-card">
            {preview && <a href={file.href} target="_blank" rel="noopener noreferrer" className="attachment-thumb" tabIndex={-1} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.href} alt="" loading="lazy" decoding="async" />
            </a>}
            <div className="attachment-body">
              <p className="attachment-name">{file.name}</p>
              <p className="small muted">{typeName(file.mimeType)} · {size(file.bytes)}{file.source.page ? ` · ${t('с. {n}', { n: file.source.page })}` : ''}</p>
              <div className="row">
                {inline && <a className="btn btn-secondary btn-sm" href={file.href} target="_blank" rel="noopener noreferrer">{t('Открыть')}<span className="visually-hidden"> {file.name} {hint}</span></a>}
                {file.downloadable && <a className="btn btn-secondary btn-sm" href={`${file.href}?download=1`} download>{t('Скачать')}<span className="visually-hidden"> {file.name}</span></a>}
              </div>
            </div>
          </li>;
        })}
      </ul>}
    </section>
  );
}
