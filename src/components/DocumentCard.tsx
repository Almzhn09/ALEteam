'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { DocumentSummary } from '@/contracts/api';
import { useFavorites } from '@/lib/favorites';
import { typeLabel } from '@/lib/labels';
import { DemoBadge } from './ui';

export function FavoriteButton({ doc, small }: { doc: DocumentSummary; small?: boolean }) {
  const favorites = useFavorites();
  const [failed, setFailed] = useState(false);
  if (!favorites.hydrated) return null;
  const saved = favorites.has(doc.id);
  function toggle() {
    try { if (saved) favorites.remove(doc.id); else favorites.add(doc); setFailed(false); }
    catch { setFailed(true); }
  }
  return (
    <span className="fav-btn">
      <button type="button" className={`btn ${saved ? 'btn-secondary' : 'btn-ghost'}${small ? ' btn-sm' : ''}`} aria-pressed={saved} onClick={toggle}
        aria-label={`${saved ? 'Убрать из избранного' : 'Добавить в избранное'}: ${doc.title}`}>
        <span aria-hidden="true">{saved ? '★' : '☆'}</span> {saved ? 'В избранном' : 'В избранное'}
      </button>
      {failed && <span className="field-error" role="alert"> Хранилище браузера недоступно.</span>}
    </span>
  );
}

export function DocumentCard({ doc, fundName }: { doc: DocumentSummary; fundName?: string }) {
  return (
    <article className="card card-flat doc-card">
      <div className="row spread" style={{ marginBottom: 'var(--space-2)' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="badge badge-neutral">{typeLabel[doc.type]}</span>
          <DemoBadge show={doc.isDemo} />
        </div>
        <FavoriteButton doc={doc} small />
      </div>
      <h3><Link href={`/documents/${encodeURIComponent(doc.id)}`}>{doc.title}</Link></h3>
      <p className="muted small" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{doc.description}</p>
      <dl className="meta">
        <div><dt>Год:</dt><dd>{doc.year}</dd></div>
        <div><dt>Шифр:</dt><dd className="mono">{doc.reference}</dd></div>
        {fundName && <div><dt>Фонд:</dt><dd>{fundName}</dd></div>}
      </dl>
    </article>
  );
}
