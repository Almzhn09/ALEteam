'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationItem, NotificationSettings, Page } from '@/contracts/api';
import { apiGet, apiSend } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useI18n } from '@/lib/lang';
import { statusLabel } from '@/lib/labels';
import { ErrorNotice, Loading } from './ui';

export function Notifications() {
  const { user } = useSession();
  const { t, formatDate } = useI18n();
  const [data, setData] = useState<(Page<NotificationItem> & { unread: number }) | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [owner, setOwner] = useState<string | null>(null);
  const active = useRef(user?.id); active.current = user?.id;
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!user) return;
    const attempt = ++generation.current;
    try {
      const [messages, preferences] = await Promise.all([
        apiGet<Page<NotificationItem> & { unread: number; ownerId: string }>(`/me/notifications?page=${page}&pageSize=20`),
        apiGet<{ item: NotificationSettings }>('/me/notification-settings'),
      ]);
      if (active.current !== user.id || messages.ownerId !== user.id || attempt !== generation.current) return;
      setData(messages); setSettings(preferences.item); setOwner(user.id); setError(null);
    } catch (e) { if (active.current === user.id && attempt === generation.current) setError(e); }
  }, [user, page]);
  useEffect(() => { void load(); }, [load]);
  async function change(work: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await work(); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  }
  function updateSettings(next: NotificationSettings) {
    const previous = settings;
    setSettings(next);
    void change(async () => {
      try { return await apiSend('/me/notification-settings', 'PATCH', next); }
      catch (e) { setSettings(previous); throw e; }
    });
  }
  if (!user) return null;
  return <section className="panel stack" aria-labelledby="notifications-title">
    <div className="row spread">
      <h2 id="notifications-title">{t('Уведомления')}{owner === user.id && data ? ` (${data.unread})` : ''}</h2>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()} disabled={busy}>{t('Обновить')}</button>
    </div>
    <p className="small muted">{t('Уведомления доступны только вам. Отключение влияет на новые события; уже полученные сохраняются.')}</p>
    {!!error && <ErrorNotice error={error} onRetry={() => void load()} />}
    {owner !== user.id || !data || !settings ? <Loading rows={1} /> : <>
      <fieldset disabled={busy} className="stack">
        <legend>{t('Настройки уведомлений')}</legend>
        <label><input type="checkbox" checked={settings.notifyReplies} onChange={e => updateSettings({ ...settings, notifyReplies: e.target.checked })} /> {t('Ответы на мои комментарии')}</label>
        <label><input type="checkbox" checked={settings.notifyModeration} onChange={e => updateSettings({ ...settings, notifyModeration: e.target.checked })} /> {t('Решения модератора по моим комментариям')}</label>
      </fieldset>
      {data.unread > 0 && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void change(() => apiSend('/me/notifications', 'PATCH', { read: true }))}>{t('Отметить все прочитанными')}</button>}
      {data.items.length === 0 ? <p className="muted">{t('Уведомлений пока нет.')}</p> : <ul className="comment-list">
        {data.items.map(n => <li className="comment" key={n.id}>
          <p>{n.kind === 'COMMENT_REPLY' ? t('На ваш комментарий ответили.') : `${t('Модератор изменил статус вашего комментария:')} ${n.status ? t(statusLabel[n.status]) : ''}`}</p>
          <p className="small muted"><time dateTime={n.createdAt}>{formatDate(n.createdAt)}</time> · {n.readAt ? t('Прочитано') : t('Новое')}</p>
          <div className="row">
            <Link href={n.kind === 'COMMENT_REPLY' ? `/documents/${encodeURIComponent(n.documentId)}#comment-${n.commentId}` : '/me#my-comments'}>{t('Посмотреть')}</Link>
            {!n.readAt && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void change(() => apiSend(`/me/notifications/${n.id}`, 'PATCH', { read: true }))}>{t('Отметить прочитанным')}</button>}
          </div>
        </li>)}
      </ul>}
      <nav className="row" aria-label={t('Страницы уведомлений')}>
        <button className="btn btn-secondary btn-sm" disabled={page === 1 || busy} onClick={() => setPage(p => p - 1)}>{t('Назад')}</button>
        <span>{page}</span>
        <button className="btn btn-secondary btn-sm" disabled={page * 20 >= data.total || busy} onClick={() => setPage(p => p + 1)}>{t('Далее')}</button>
      </nav>
    </>}
  </section>;
}
