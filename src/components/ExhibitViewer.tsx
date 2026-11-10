'use client';
import Link from 'next/link';
import { useState, type KeyboardEvent } from 'react';
import { fileUrl } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { DemoBadge } from './ui';

export interface ExhibitView {
  id: string; title: string; body: string; rights: string; source: string | null; sourceUrl: string | null;
  fileIds: string[]; isDemo: boolean; locale: string; documents: { id: string; title: string }[]; links: { label: string; url: string }[];
}

function Media({ id, alt }: { id: string; alt: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  // File metadata is not part of the exhibit: a non-image copy falls back to a link.
  if (failed) return <a className="btn btn-secondary btn-sm" href={fileUrl(id)} target="_blank" rel="noopener noreferrer">{t('Открыть файл')}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>;
  return <a href={fileUrl(id)} target="_blank" rel="noopener noreferrer"><img src={fileUrl(id)} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className="exhibit-image" /></a>;
}

// Only the current exhibit is mounted, so its neighbours' files are not downloaded.
export function ExhibitViewer({ exhibits }: { exhibits: ExhibitView[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const exhibit = exhibits[index];
  const go = (delta: number) => setIndex(i => Math.min(exhibits.length - 1, Math.max(0, i + delta)));
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  }
  return (
    <section className="viewer" aria-roledescription={t('экспозиция')} aria-label={t('Экспонаты')} onKeyDown={onKey}>
      <div className="viewer-toolbar">
        <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => go(-1)} disabled={index === 0} aria-label={t('Предыдущий экспонат')}>←</button>
        <span className="small" aria-live="polite">{t('Экспонат {n} из {total}', { n: index + 1, total: exhibits.length })}</span>
        <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => go(1)} disabled={index === exhibits.length - 1} aria-label={t('Следующий экспонат')}>→</button>
      </div>
      <article key={exhibit.id} className="exhibit stack" lang={exhibit.locale}>
        <div className="row" style={{ gap: 'var(--space-2)' }}><h2 style={{ margin: 0, fontSize: '1.25rem' }}>{exhibit.title}</h2><DemoBadge show={exhibit.isDemo} /></div>
        {exhibit.fileIds.map(id => <Media key={id} id={id} alt={exhibit.title} />)}
        <p className="pre-wrap">{exhibit.body}</p>
        <p className="small muted" style={{ margin: 0 }}>{t('Права')}: {exhibit.rights}{exhibit.source ? ` · ${exhibit.source}` : ''}</p>
        {exhibit.sourceUrl && /^https?:\/\//i.test(exhibit.sourceUrl) && <a className="small" href={exhibit.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Открыть источник')}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>}
        {exhibit.documents.length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>{exhibit.documents.map(d => <li key={d.id}><Link href={`/documents/${encodeURIComponent(d.id)}`}>{d.title}</Link></li>)}</ul>}
        {exhibit.links.map(l => <a key={l.url} className="small" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>)}
      </article>
      {exhibits.length > 1 && (
        <div className="thumbs" role="group" aria-label={t('Экспонаты')}>
          {exhibits.map((e, i) => <button key={e.id} type="button" aria-current={i === index} onClick={() => setIndex(i)} aria-label={`${i + 1}: ${e.title}`} style={{ width: 44, height: 44, fontWeight: 700, color: 'var(--text)' }}>{i + 1}</button>)}
        </div>
      )}
    </section>
  );
}
