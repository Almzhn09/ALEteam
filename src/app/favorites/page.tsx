'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useFavorites } from '@/lib/favorites';
import { typeLabel } from '@/lib/labels';
import { useI18n } from '@/lib/lang';
import { Breadcrumbs, DemoBadge, Loading, Notice } from '@/components/ui';

export default function FavoritesPage() {
  const { t, formatDate } = useI18n();
  const favorites = useFavorites();
  const [failed, setFailed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const run = (fn: () => void) => { try { fn(); setFailed(false); } catch { setFailed(true); } };

  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: t('Избранное') }]} />
      <div className="row spread">
        <h1>{t('Избранное')}</h1>
        {favorites.items.length > 1 && (confirmClear
          ? <span className="row" role="group" aria-label={t('Подтверждение очистки')}>
              <span className="small">{t('Удалить все {n}?', { n: favorites.items.length })}</span>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => { run(favorites.clear); setConfirmClear(false); }}>{t('Да, очистить')}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(false)}>{t('Отмена')}</button>
            </span>
          : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>{t('Очистить список')}</button>)}
      </div>
      <p className="lead">{t('Список хранится только в этом браузере и не синхронизируется между устройствами.')}</p>

      {!favorites.hydrated ? <Loading rows={2} label={t('Загрузка избранного')} />
        : !favorites.available ? (
          <Notice tone="warn" title={t('Хранилище браузера недоступно')}>
            <p>{t('Избранное не может быть сохранено: возможно, включён приватный режим или запрещено хранение данных сайтов. Разрешите хранение данных и обновите страницу.')}</p>
          </Notice>
        ) : favorites.items.length === 0 ? (
          <div className="card card-flat empty">
            <h2>{t('Здесь пока пусто')}</h2>
            <p className="muted">{t('Нажмите «☆ В избранное» в каталоге или на странице документа, чтобы сохранить материал.')}</p>
            <Link className="btn btn-primary" href="/catalog">{t('Перейти в каталог')}</Link>
          </div>
        ) : (
          <ul className="result-list" aria-label={t('Сохранённые документы')}>
            {favorites.items.map(f => (
              <li key={f.id} className="card card-flat row spread">
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    {f.type in typeLabel && <span className="badge badge-neutral">{t(typeLabel[f.type])}</span>}
                    <DemoBadge show={f.isDemo} />
                  </div>
                  <h2 style={{ fontSize: '1.1rem', marginBottom: 'var(--space-1)' }}><Link href={`/documents/${encodeURIComponent(f.id)}`} lang="ru">{f.title}</Link></h2>
                  <p className="small muted" style={{ margin: 0 }}><span className="mono">{f.reference}</span> · {f.year} · {t('сохранено')} {formatDate(f.savedAt)}</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(() => favorites.remove(f.id))} aria-label={`${t('Удалить из избранного')}: ${f.title}`}>{t('Удалить')}</button>
              </li>
            ))}
          </ul>
        )}
      {failed && <div style={{ marginTop: 'var(--space-4)' }}><Notice tone="error" title={t('Не удалось изменить избранное')} live><p>{t('Хранилище браузера недоступно.')}</p></Notice></div>}
    </div>
  );
}
