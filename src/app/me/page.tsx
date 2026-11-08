'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OwnComment, Page } from '@/contracts/api';
import { apiGet } from '@/lib/api';
import { reasonText, statusLabel } from '@/lib/labels';
import { useI18n } from '@/lib/lang';
import { useSession } from '@/lib/session';
import { Breadcrumbs, ErrorNotice, Loading, Notice } from '@/components/ui';
import { Notifications } from '@/components/Notifications';

export default function MePage() {
  const { state, user } = useSession();
  const { t, formatDate } = useI18n();
  const [data, setData] = useState<Page<OwnComment> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const active = useRef(user?.id); active.current = user?.id;
  const load = useCallback(() => {
    if (!user) return;
    setError(null);
    apiGet<Page<OwnComment> & { ownerId: string }>('/me/comments?pageSize=50').then(result => {
      if (active.current === user.id && result.ownerId === user.id) { setData(result); setOwner(user.id); }
    }, e => { if (active.current === user.id) setError(e); });
  }, [user]);
  useEffect(() => { if (user) load(); }, [user, load]);

  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: t('Мои комментарии') }]} />
      <h1 id="my-comments">{t('Мои комментарии')}</h1>
      {state.status === 'loading' ? <Loading rows={1} />
        : !user ? (
          <Notice tone="info" title={t('Требуется вход')}>
            <p>{t('Войдите, чтобы увидеть свои комментарии и статусы их проверки.')}</p>
            <Link className="btn btn-primary btn-sm" href="/login?returnTo=%2Fme">{t('Войти')}</Link>
          </Notice>
        ) : (
          <div className="stack">
            <p className="muted">{user.name} · {user.email} · {user.role === 'MODERATOR' ? t('модератор') : t('автор')}</p>
            <Notifications />
            {error ? <ErrorNotice error={error} onRetry={load} />
              : !data || owner !== user.id ? <Loading rows={2} />
              : data.items.length === 0 ? <p className="muted">{t('Вы ещё не оставляли комментариев.')}</p>
              : (
                <ul className="comment-list">
                  {data.items.map(c => (
                    <li key={c.id} className="comment">
                      <div className="comment-head">
                        <span className={`badge badge-${c.status}`}>{t(statusLabel[c.status])}</span>
                        <span className="small muted"><time dateTime={c.createdAt}>{formatDate(c.createdAt)}</time> · <Link href={`/documents/${encodeURIComponent(c.documentId)}#comments`}>{t('к документу')}</Link></span>
                      </div>
                      <p className="pre-wrap">{c.body}</p>
                      {c.status !== 'PUBLISHED' && <p className="small muted" style={{ margin: 0 }}>{t(c.status === 'HIDDEN' ? 'Комментарий скрыт модератором.' : reasonText[c.reason] ?? '')}</p>}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}
    </div>
  );
}
