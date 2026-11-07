'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { OwnComment, Page } from '@/contracts/api';
import { apiGet } from '@/lib/api';
import { formatDate, reasonText, statusLabel } from '@/lib/labels';
import { useSession } from '@/lib/session';
import { Breadcrumbs, ErrorNotice, Loading, Notice } from '@/components/ui';

export default function MePage() {
  const { state, user } = useSession();
  const [data, setData] = useState<Page<OwnComment> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setError(null);
    apiGet<Page<OwnComment>>('/me/comments?pageSize=50').then(setData, setError);
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: 'Мои комментарии' }]} />
      <h1>Мои комментарии</h1>
      {state.status === 'loading' ? <Loading rows={1} />
        : !user ? (
          <Notice tone="info" title="Требуется вход">
            <p>Войдите, чтобы увидеть свои комментарии и статусы их проверки.</p>
            <Link className="btn btn-primary btn-sm" href="/login?returnTo=%2Fme">Войти</Link>
          </Notice>
        ) : (
          <div className="stack">
            <p className="muted">{user.name} · {user.email} · {user.role === 'MODERATOR' ? 'модератор' : 'автор'}</p>
            {error ? <ErrorNotice error={error} onRetry={load} />
              : !data ? <Loading rows={2} />
              : data.items.length === 0 ? <p className="muted">Вы ещё не оставляли комментариев.</p>
              : (
                <ul className="comment-list">
                  {data.items.map(c => (
                    <li key={c.id} className="comment">
                      <div className="comment-head">
                        <span className={`badge badge-${c.status}`}>{statusLabel[c.status]}</span>
                        <span className="small muted"><time dateTime={c.createdAt}>{formatDate(c.createdAt)}</time> · <Link href={`/documents/${encodeURIComponent(c.documentId)}#comments`}>к документу</Link></span>
                      </div>
                      <p className="pre-wrap">{c.body}</p>
                      {c.status !== 'PUBLISHED' && <p className="small muted" style={{ margin: 0 }}>{c.status === 'HIDDEN' ? 'Комментарий скрыт модератором.' : reasonText[c.reason] ?? ''}</p>}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}
    </div>
  );
}
