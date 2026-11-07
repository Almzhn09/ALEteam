'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { CommentStatus, ModerationInput, ModerationQueueItem, Page } from '@/contracts/api';
import { ApiClientError, apiGet, apiSend, errorText } from '@/lib/api';
import { formatDate, reasonText, statusLabel } from '@/lib/labels';
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

  if (state.status === 'loading') return <Loading rows={1} label="Проверка входа" />;
  if (!user || (error instanceof ApiClientError && error.status === 401)) return (
    <Notice tone="info" title="Требуется вход">
      <p>Кабинет доступен только модераторам.</p>
      <Link className="btn btn-primary btn-sm" href="/login?returnTo=%2Fmoderation">Войти</Link>
    </Notice>
  );
  if (user.role !== 'MODERATOR' || (error instanceof ApiClientError && error.status === 403)) return (
    <Notice tone="error" title="Нет доступа">
      <p>У вашей учётной записи нет роли модератора. Если роль была отозвана, обратитесь к администратору.</p>
      <Link href="/">На главную</Link>
    </Notice>
  );

  return (
    <div className="stack">
      <nav aria-label="Фильтр очереди">
        <div className="tabs">
          {tabs.map(t => <Link key={t.label} href={href(t.status)} aria-current={t.status === status ? 'page' : undefined}>{t.label}</Link>)}
        </div>
      </nav>
      <p className="muted small">{status ? `Все комментарии со статусом «${statusLabel[status]}».` : 'Комментарии, ожидающие проверки, и опубликованные комментарии с незакрытыми жалобами.'} Причина решения обязательна и сохраняется в журнале; публично она не показывается.</p>
      {notice && <Notice tone="success" live><p>{notice}</p></Notice>}
      <div className="row spread">
        <p role="status" style={{ margin: 0 }}>{data ? <>Записей: <strong>{data.total}</strong></> : ''}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setNotice(''); void load(); }}>Обновить</button>
      </div>
      {error ? <ErrorNotice error={error} onRetry={() => void load()} />
        : !data ? <Loading label="Загрузка очереди" />
        : data.items.length === 0 ? <div className="card card-flat empty"><h2>Очередь пуста</h2><p className="muted">Новых комментариев и жалоб нет.</p></div>
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
  const [target, setTarget] = useState<ModerationInput['status'] | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Decision[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  const id = useId();

  async function decide(e: FormEvent) {
    e.preventDefault();
    if (!target) return setError('Выберите решение.');
    if (reason.trim().length < 3 || reason.trim().length > 500) return setError('Укажите причину: от 3 до 500 символов.');
    setBusy(true); setError('');
    try {
      await apiSend(`/moderation/comments/${encodeURIComponent(item.id)}`, 'PATCH',
        { status: target, reason: reason.trim(), expectedUpdatedAt: item.updatedAt } satisfies ModerationInput);
      onDecided(`Решение сохранено: ${statusLabel[target].toLowerCase()} — комментарий автора «${item.author.name}».`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) { setError('Комментарий уже изменён другим модератором. Очередь обновлена — проверьте запись ещё раз.'); onStale(); }
      else setError(errorText(err));
    } finally { setBusy(false); }
  }

  async function loadHistory() {
    if (history) return setHistory(null);
    setHistoryError('');
    try { setHistory((await apiGet<Page<Decision>>(`/moderation/comments/${encodeURIComponent(item.id)}/history?pageSize=20`)).items); }
    catch (err) { setHistoryError(errorText(err)); }
  }

  const options = actions.filter(a => a.status !== item.status);
  return (
    <li className="card card-flat queue-item stack" aria-labelledby={`${id}-head`}>
      <div className="comment-head" id={`${id}-head`}>
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <span className={`badge badge-${item.status}`}>{statusLabel[item.status]}</span>
          <strong>{item.author.name}</strong>
        </span>
        <span className="small muted"><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time> · <Link href={`/documents/${encodeURIComponent(item.documentId)}#comments`} target="_blank">документ {item.documentId}<span className="visually-hidden"> (новая вкладка)</span></Link></span>
      </div>
      <div className="body">{item.body}</div>
      <p className="small muted" style={{ margin: 0 }}>Автоматическая проверка: {reasonText[item.reason] ?? item.reason} <span className="mono">({item.moderationVersion})</span></p>
      {item.reports.length > 0 && (
        <div className="notice notice-warn">
          <div>
            <strong className="notice-title">Жалобы ({item.reports.length})</strong>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
              {item.reports.map(r => <li key={r.id} className="pre-wrap">{r.reason} <span className="muted small">— {formatDate(r.createdAt)}</span></li>)}
            </ul>
          </div>
        </div>
      )}
      <form className="decision" onSubmit={decide} noValidate>
        <fieldset>
          <legend className="label">Решение</legend>
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            {options.map(a => (
              <label key={a.status} className="btn btn-secondary btn-sm" style={target === a.status ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined} title={a.hint}>
                <input type="radio" name={`${id}-target`} value={a.status} checked={target === a.status} onChange={() => setTarget(a.status)} />
                {item.status === 'HIDDEN' && a.status === 'PUBLISHED' ? 'Восстановить' : a.label}
              </label>
            ))}
          </div>
          {target && <p className="hint" style={{ margin: 'var(--space-2) 0 0' }}>{actions.find(a => a.status === target)?.hint}</p>}
        </fieldset>
        <div className="field">
          <label htmlFor={`${id}-reason`}>Причина решения</label>
          <input id={`${id}-reason`} className="input" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="Например: оскорбление участника" aria-invalid={!!error} />
        </div>
        {error && <p className="field-error" role="alert" style={{ margin: 0 }}>{error}</p>}
        <div className="row">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить решение'}</button>
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={!!history} onClick={() => void loadHistory()}>{history ? 'Скрыть журнал' : 'Журнал решений'}</button>
        </div>
      </form>
      {historyError && <p className="field-error" role="alert">{historyError}</p>}
      {history && (history.length === 0 ? <p className="small muted">Решений по комментарию ещё не было.</p> : (
        <ol className="small" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
          {history.map(h => <li key={h.id}>{formatDate(h.createdAt)}: {statusLabel[h.fromStatus]} → {statusLabel[h.toStatus]} — «{h.reason}»</li>)}
        </ol>
      ))}
    </li>
  );
}
