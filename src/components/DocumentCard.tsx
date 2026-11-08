'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { DocumentSummary } from '@/contracts/api';
import { useFavorites } from '@/lib/favorites';
import { typeLabel } from '@/lib/labels';
import { useI18n } from '@/lib/lang';
import { DemoBadge, Ru } from './ui';

export function FavoriteButton({ doc, small }: { doc: DocumentSummary; small?: boolean }) {
  const { t } = useI18n();
  const favorites = useFavorites();
  const [failed, setFailed] = useState(false);
  if (!favorites.hydrated) return null;
  const saved = favorites.has(doc.id);
  async function toggle() {
    try { if (saved) await favorites.remove(doc.id); else await favorites.add(doc); setFailed(false); }
    catch { setFailed(true); }
  }
  return (
    <span className="fav-btn">
      <button type="button" className={`btn ${saved ? 'btn-secondary' : 'btn-ghost'}${small ? ' btn-sm' : ''}`} aria-pressed={saved} onClick={toggle} disabled={favorites.busy || !!favorites.error}
        aria-label={`${saved ? t('Убрать из избранного') : t('Добавить в избранное')}: ${doc.title}`}>
        <span aria-hidden="true">{saved ? '★' : '☆'}</span> {saved ? t('В избранном') : t('В избранное')}
      </button>
      {failed && <span className="field-error" role="alert"> {t('Не удалось изменить избранное')}</span>}
    </span>
  );
}

export function DocumentCard({ doc, fundName }: { doc: DocumentSummary; fundName?: string }) {
  const { t } = useI18n();
  return (
    <article className="card card-flat doc-card">
      <div className="row spread" style={{ marginBottom: 'var(--space-2)' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="badge badge-neutral">{t(typeLabel[doc.type])}</span>
          <DemoBadge show={doc.isDemo} />
        </div>
        <FavoriteButton doc={doc} small />
      </div>
      <h3><Link href={`/documents/${encodeURIComponent(doc.id)}`} lang="ru">{doc.title}</Link></h3>
      <Ru as="p" className="muted small clamp-2">{doc.description}</Ru>
      <dl className="meta">
        <div><dt>{t('Год:')}</dt><dd>{doc.year}</dd></div>
        <div><dt>{t('Шифр:')}</dt><dd className="mono">{doc.reference}</dd></div>
        {fundName && <div><dt>{t('Фонд:')}</dt><dd lang="ru">{fundName}</dd></div>}
      </dl>
    </article>
  );
}
