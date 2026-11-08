'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { EditorContentItem, Page } from '@/contracts/api';
import { ApiClientError, apiGet, apiSend, errorText } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { useSession } from '@/lib/session';
import { DemoBadge, ErrorNotice, Loading, Notice, Ru } from '@/components/ui';

export function ContentManager() {
  const { t } = useI18n();
  const { state, user } = useSession();
  const [data, setData] = useState<Page<EditorContentItem> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await apiGet<Page<EditorContentItem>>('/editor/content?pageSize=50')); }
    catch (e) { setError(e); }
  }, []);
  useEffect(() => { if (user) void load(); }, [user, load]);

  async function toggle(item: EditorContentItem) {
    setBusy(item.id); setMessage(null);
    try {
      await apiSend(`/editor/content/${encodeURIComponent(item.id)}`, 'PATCH', { isVisible: !item.isVisible, expectedUpdatedAt: item.updatedAt });
      setMessage({ tone: 'success', text: t(item.isVisible ? 'Материал скрыт.' : 'Материал показан.') });
      await load();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof ApiClientError && e.status === 409 ? t('Материал уже изменён. Список обновлён — проверьте его ещё раз.') : errorText(e, t) });
      if (e instanceof ApiClientError && e.status === 409) await load();
    } finally { setBusy(''); }
  }

  if (state.status === 'loading') return <Loading rows={1} label={t('Проверка входа…')} />;
  if (!user || (error instanceof ApiClientError && error.status === 401)) return (
    <Notice tone="info" title={t('Требуется вход')}>
      <p>{t('Кабинет доступен только модераторам.')}</p>
      <Link className="btn btn-primary btn-sm" href="/login?returnTo=%2Fmoderation%2Fcontent">{t('Войти')}</Link>
    </Notice>
  );
  if (user.role !== 'MODERATOR' || (error instanceof ApiClientError && error.status === 403)) return (
    <Notice tone="error" title={t('Нет доступа')}><p>{t('У вашей учётной записи нет роли модератора. Если роль была отозвана, обратитесь к администратору.')}</p></Notice>
  );

  return (
    <div className="stack">
      <p className="muted small">{t('Скрытые материалы не показываются посетителям и не удаляются.')}</p>
      {message && <Notice tone={message.tone} live><p>{message.text}</p></Notice>}
      {error ? <ErrorNotice error={error} onRetry={() => void load()} />
        : !data ? <Loading />
        : (
          <ul className="result-list">
            {data.items.map(item => (
              <li key={item.id} className="card card-flat row spread">
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    <span className="badge badge-neutral">{t(item.kind === 'NEWS' ? 'Новость' : 'Подборка')}</span>
                    <span className={`badge badge-${item.isVisible ? 'PUBLISHED' : 'HIDDEN'}`}>{t(item.isVisible ? 'Показывается' : 'Скрыт')}</span>
                    <DemoBadge show={item.isDemo} />
                  </div>
                  <Ru>{item.title}</Ru>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === item.id} onClick={() => void toggle(item)}
                  aria-label={`${t(item.isVisible ? 'Скрыть' : 'Показать')}: ${item.title}`}>{t(item.isVisible ? 'Скрыть' : 'Показать')}</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
