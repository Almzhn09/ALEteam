'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { CommentStatus, ModerationInput, ModerationQueueItem, Page } from '@/contracts/api';
import { ApiClientError, apiGet, apiSend, errorText } from '@/lib/api';
import { reasonText, statusLabel } from '@/lib/labels';
import { useI18n } from '@/lib/lang';
import { useSession } from '@/lib/session';
import { ErrorNotice, Loading, Notice, Pagination } from '@/components/ui';

const PAGE_SIZE = 20;
const tabs: { status?: CommentStatus; label: string }[] = [
  { label: 'Очередь' }, { status: 'PENDING', label: 'На проверке' }, { status: 'PUBLISHED', label: 'Опубликованные' },
  { status: 'REJECTED', label: 'Отклонённые' }, { status: 'HIDDEN', label: 'Скрытые' },
];
const actions: { status: ModerationInput['status']; label: string; hint: string }[] = [
  { status: 'PUBLISHED', label: 'Опубликовать', hint: 'Комментарий станет виден всем; используется и для восстановления.' },
  { status: 'REJECTED', label: 'Отклонить', hint: 'Нарушает правила; автор увидит статус «Отклонён».' },
  { status: 'HIDDEN', label: 'Скрыть', hint: 'Убрать опубликованный комментарий из обсуждения.' },
];

export function Moderation() {
  const { state, user } = useSession();
  const { t } = useI18n();
  const params = useSearchParams();
  const statusParam = params.get('status');
  const status = tabs.find(t => t.status === statusParam)?.status;
  const pageParam = Number(params.get('page'));
  const page = Number.isInteger(pageParam) && pageParam >= 1 && pageParam <= 10000 ? pageParam : 1;
  const [data, setData] = useState<Page<ModerationQueueItem> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string>('');

  const href = (s: CommentStatus | undefined, p = 1) => {
    const q = new URLSearchParams(); if (s) q.set('status', s); if (p > 1) q.set('page', String(p));
    return `/moderation${q.size ? `?${q}` : ''}`;
  };
  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) }); if (status) q.set('status', status);
      setData(await apiGet<Page<ModerationQueueItem>>(`/moderation/comments?${q}`));
    } catch (e) { setError(e); }
  }, [page, status]);
  useEffect(() => { if (user) { setData(null); void load(); } }, [user, load]);

  if (state.status === 'loading') return <Loading rows={1} label={t('Проверка входа…')} />;
  if (!user || (error instanceof ApiClientError && error.status === 401)) return (
    <Notice tone="info" title={t('Требуется вход')}>
      <p>{t('Кабинет доступен только модераторам.')}</p>
      <Link className="btn btn-primary btn-sm" href="/login?returnTo=%2Fmoderation">{t('Войти')}</Link>
    </Notice>
  );
  if (user.role !== 'MODERATOR' || (error instanceof ApiClientError && error.status === 403)) return (
    <Notice tone="error" title={t('Нет доступа')}>
      <p>{t('У вашей учётной записи нет роли модератора. Если роль была отозвана, обратитесь к администратору.')}</p>
      <Link href="/">{t('На главную')}</Link>
    </Notice>
  );

  return (
    <div className="stack">
      <p style={{ margin: 0 }}><Link href="/moderation/content">{t('Управление новостями и подборками')} →</Link></p>
      <nav aria-label={t('Фильтр очереди')}>
        <div className="tabs">
          {tabs.map(tab => <Link key={tab.label} href={href(tab.status)} aria-current={tab.status === status ? 'page' : undefined}>{t(tab.label)}</Link>)}
        </div>
      </nav>
      <p className="muted small">{status ? t('Все комментарии со статусом «{status}».', { status: t(statusLabel[status]) }) : t('Комментарии, ожидающие проверки, и опубликованные комментарии с незакрытыми жалобами.')} {t('Причина решения обязательна и сохраняется в журнале; публично она не показывается.')}</p>
      {notice && <Notice tone="success" live><p>{notice}</p></Notice>}
      <div className="row spread">
        <p role="status" style={{ margin: 0 }}>{data ? <>{t('Записей:')} <strong>{data.total}</strong></> : ''}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setNotice(''); void load(); }}>{t('Обновить')}</button>
      </div>
      {error ? <ErrorNotice error={error} onRetry={() => void load()} />
        : !data ? <Loading label={t('Загрузка очереди')} />
        : data.items.length === 0 ? <div className="card card-flat empty"><h2>{t('Очередь пуста')}</h2><p className="muted">{t('Новых комментариев и жалоб нет.')}</p></div>
        : (
          <>
            <ul className="comment-list">
              {data.items.map(item => (
                <QueueItem key={item.id} item={item} onDecided={(msg) => { setNotice(msg); void load(); }} onStale={() => void load()} />
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} href={p => href(status, p)} />
          </>
        )}
    </div>
  );
}

interface Decision { id: string; fromStatus: CommentStatus; toStatus: CommentStatus; reason: string; createdAt: string; moderatorId: string }

function QueueItem({ item, onDecided, onStale }: { item: ModerationQueueItem; onDecided(msg: string): void; onStale(): void }) {
  const { t, formatDate } = useI18n();
  const [target, setTarget] = useState<ModerationInput['status'] | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Decision[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const id = useId();

  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!target) return setError(t('Выберите решение.'));
    if (reason.trim().length < 3 || reason.trim().length > 500) return setError(t('Укажите причину: от 3 до 500 символов.'));
    setBusy(true); setError('');
    try {
      await apiSend(`/moderation/comments/${encodeURIComponent(item.id)}`, 'PATCH',
        { status: target, reason: reason.trim(), expectedUpdatedAt: item.updatedAt } satisfies ModerationInput);
      onDecided(t('Решение сохранено: {status} — комментарий автора «{name}».', { status: t(statusLabel[target]).toLowerCase(), name: item.author.name }));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) { setError(t('Комментарий уже изменён другим модератором. Очередь обновлена — проверьте запись ещё раз.')); onStale(); }
      else setError(errorText(err, t));
    } finally { setBusy(false); }
  }

  async function loadHistory() {
    if (history) return setHistory(null);
    setHistoryError('');
    try { setHistory((await apiGet<Page<Decision>>(`/moderation/comments/${encodeURIComponent(item.id)}/history?pageSize=20`)).items); }
    catch (err) { setHistoryError(errorText(err, t)); }
  }

  const options = actions.filter(a => a.status !== item.status);
  return (
    <li className="card card-flat queue-item stack" aria-labelledby={`${id}-head`}>
      <div className="comment-head" id={`${id}-head`}>
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <span className={`badge badge-${item.status}`}>{t(statusLabel[item.status])}</span>
          <strong>{item.author.name}</strong>
        </span>
        <span className="small muted"><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time> · <Link href={`/documents/${encodeURIComponent(item.documentId)}#comments`} target="_blank">{t('документ')} {item.documentId}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></Link></span>
      </div>
      <div className="body">{item.body}</div>
      <p className="small muted" style={{ margin: 0 }}>{t('Автоматическая проверка:')} {t(reasonText[item.reason] ?? item.reason)} <span className="mono">({item.moderationVersion})</span></p>
      {item.reports.length > 0 && (
        <div className="notice notice-warn">
          <div>
            <strong className="notice-title">{t('Жалобы ({n})', { n: item.reports.length })}</strong>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
              {item.reports.map(r => <li key={r.id} className="pre-wrap">{r.reason} <span className="muted small">— {formatDate(r.createdAt)}</span></li>)}
            </ul>
          </div>
        </div>
      )}
      <form className="decision" onSubmit={decide} noValidate>
        <fieldset>
          <legend className="label">{t('Решение')}</legend>
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            {options.map(a => (
              <label key={a.status} className="btn btn-secondary btn-sm" style={target === a.status ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined} title={t(a.hint)}>
                <input type="radio" name={`${id}-target`} value={a.status} checked={target === a.status} onChange={() => setTarget(a.status)} />
                {item.status === 'HIDDEN' && a.status === 'PUBLISHED' ? t('Восстановить') : t(a.label)}
              </label>
            ))}
          </div>
          {target && <p className="hint" style={{ margin: 'var(--space-2) 0 0' }}>{t(actions.find(a => a.status === target)?.hint ?? '')}</p>}
        </fieldset>
        <div className="field">
          <label htmlFor={`${id}-reason`}>{t('Причина решения')}</label>
          <input id={`${id}-reason`} className="input" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder={t('Например: оскорбление участника')} aria-invalid={!!error} />
        </div>
        {error && <p className="field-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div className="row">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? t('Сохранение…') : t('Сохранить решение')}</button>
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={!!history} onClick={() => void loadHistory()}>{history ? t('Скрыть журнал') : t('Журнал решений')}</button>
        </div>
      </form>
      {historyError && <p className="field-error" role="alert">{historyError}</p>}
      {history && (history.length === 0 ? <p className="small muted">{t('Решений по комментарию ещё не было.')}</p> : (
        <ol className="small" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
          {history.map(h => <li key={h.id}>{formatDate(h.createdAt)}: {t(statusLabel[h.fromStatus])} → {t(statusLabel[h.toStatus])} — «{h.reason}»</li>)}
        </ol>
      ))}
    </li>
  );
}
