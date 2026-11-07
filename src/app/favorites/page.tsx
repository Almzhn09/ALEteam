'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useFavorites } from '@/lib/favorites';
import { formatDate, typeLabel } from '@/lib/labels';
import { Breadcrumbs, DemoBadge, Loading, Notice } from '@/components/ui';

export default function FavoritesPage() {
  const favorites = useFavorites();
  const [failed, setFailed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const run = (fn: () => void) => { try { fn(); setFailed(false); } catch { setFailed(true); } };

  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: 'Избранное' }]} />
      <div className="row spread">
        <h1>Избранное</h1>
        {favorites.items.length > 1 && (confirmClear
          ? <span className="row" role="group" aria-label="Подтверждение очистки">
              <span className="small">Удалить все {favorites.items.length}?</span>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => { run(favorites.clear); setConfirmClear(false); }}>Да, очистить</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(false)}>Отмена</button>
            </span>
          : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>Очистить список</button>)}
      </div>
      <p className="lead">Список хранится только в этом браузере и не синхронизируется между устройствами.</p>

      {!favorites.hydrated ? <Loading rows={2} label="Загрузка избранного" />
        : !favorites.available ? (
          <Notice tone="warn" title="Хранилище браузера недоступно">
            <p>Избранное не может быть сохранено: возможно, включён приватный режим или запрещено хранение данных сайтов. Разрешите хранение данных и обновите страницу.</p>
          </Notice>
        ) : favorites.items.length === 0 ? (
          <div className="card card-flat empty">
            <h2>Здесь пока пусто</h2>
            <p className="muted">Нажмите «☆ В избранное» в каталоге или на странице документа, чтобы сохранить материал.</p>
            <Link className="btn btn-primary" href="/catalog">Перейти в каталог</Link>
          </div>
        ) : (
          <ul className="result-list" aria-label="Сохранённые документы">
            {favorites.items.map(f => (
              <li key={f.id} className="card card-flat row spread">
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    {f.type in typeLabel && <span className="badge badge-neutral">{typeLabel[f.type]}</span>}
                    <DemoBadge show={f.isDemo} />
                  </div>
                  <h2 style={{ fontSize: '1.1rem', marginBottom: 'var(--space-1)' }}><Link href={`/documents/${encodeURIComponent(f.id)}`}>{f.title}</Link></h2>
                  <p className="small muted" style={{ margin: 0 }}><span className="mono">{f.reference}</span> · {f.year} · сохранено {formatDate(f.savedAt)}</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => run(() => favorites.remove(f.id))} aria-label={`Удалить из избранного: ${f.title}`}>Удалить</button>
              </li>
            ))}
          </ul>
        )}
      {failed && <div style={{ marginTop: 'var(--space-4)' }}><Notice tone="error" title="Не удалось изменить избранное" live><p>Хранилище браузера недоступно.</p></Notice></div>}
    </div>
  );
}
