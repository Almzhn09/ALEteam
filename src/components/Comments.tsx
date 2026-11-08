'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { CreatedComment, OwnComment, Page, PublicComment } from '@/contracts/api';
import { ApiClientError, apiGet, apiSend, errorText } from '@/lib/api';
import { reasonText, statusLabel } from '@/lib/labels';
import { useI18n } from '@/lib/lang';
import { useSession } from '@/lib/session';
import { ErrorNotice, Loading, Notice } from './ui';

const MAX = 2000;
const PAGE = 20;

export function Comments({ documentId }: { documentId: string }) {
  const { state, user } = useSession();
  const { t, formatDate } = useI18n();
  const [list, setList] = useState<PublicComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ownData, setOwn] = useState<{ ownerId?: string; items: OwnComment[] }>({ items: [] });
  const own = ownData.ownerId === user?.id ? ownData.items : [];
  const activeUser = useRef(user?.id); activeUser.current = user?.id;

  const load = useCallback(async (p: number) => {
    setLoading(true); setError(null);
    try {
      const r = await apiGet<Page<PublicComment>>(`/documents/${encodeURIComponent(documentId)}/comments?page=${p}&pageSize=${PAGE}`);
      setList(prev => p === 1 ? r.items : [...prev, ...r.items.filter(c => !prev.some(x => x.id === c.id))]);
      setTotal(r.total); setPage(p);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [documentId]);

  const loadOwn = useCallback(async () => {
    try {
      const r = await apiGet<Page<OwnComment> & { ownerId: string }>('/me/comments?pageSize=50');
      if (r.ownerId !== activeUser.current) return;
      setOwn({ ownerId: r.ownerId, items: r.items.filter(c => c.documentId === documentId && c.status !== 'PUBLISHED') });
    } catch { setOwn({ items: [] }); }
  }, [documentId, user?.id]);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => { if (user) void loadOwn(); else setOwn({ items: [] }); }, [user, loadOwn]);

  return (
    <section id="comments" aria-labelledby="comments-title" className="stack">
      <h2 id="comments-title">{t('Обсуждение')}{total ? ` (${total})` : ''}</h2>
      <p className="muted small">{t('Комментарии проходят автоматическую проверку на сервере. Сообщения с ненормативной лексикой и оскорблениями не публикуются, спорные — ждут решения модератора.')}</p>

      {state.status === 'loading' ? null : user ? (
        <CommentForm documentId={documentId} onCreated={() => { void loadOwn(); void load(1); }} />
      ) : (
        <Notice tone="info" title={t('Войдите, чтобы оставить комментарий')}>
          <p>{t('Комментировать и отправлять жалобы могут зарегистрированные участники.')}</p>
          <Link className="btn btn-primary btn-sm" href={`/login?returnTo=${encodeURIComponent(`/documents/${documentId}#comments`)}`}>{t('Войти')}</Link>
        </Notice>
      )}

      {own.length > 0 && (
        <div className="panel">
          <h3>{t('Ваши комментарии, не видимые другим')}</h3>
          <ul className="comment-list">
            {own.map(c => (
              <li key={c.id} className="comment">
                <div className="comment-head">
                  <span className={`badge badge-${c.status}`}>{t(statusLabel[c.status])}</span>
                  <time className="muted small" dateTime={c.createdAt}>{formatDate(c.createdAt)}</time>
                </div>
                <p className="pre-wrap">{c.body}</p>
                <p className="small muted" style={{ margin: 0 }}>{t(c.status === 'HIDDEN' ? 'Комментарий скрыт модератором.' : reasonText[c.reason] ?? statusLabel[c.status])}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && list.length === 0 ? <ErrorNotice error={error} onRetry={() => void load(1)} title={t('Не удалось загрузить комментарии')} />
        : loading && list.length === 0 ? <Loading rows={2} label={t('Загрузка комментариев')} />
        : list.length === 0 ? <p className="muted">{t('Пока нет опубликованных комментариев.')}</p>
        : (
          <>
            <ul className="comment-list">
              {list.map(c => <CommentItem key={c.id} comment={c} documentId={documentId} canReport={!!user} onCreated={() => { void loadOwn(); void load(1); }} />)}
            </ul>
            {error && <ErrorNotice error={error} onRetry={() => void load(page + 1)} title={t('Не удалось загрузить ещё')} />}
            {list.length < total && !error && (
              <button type="button" className="btn btn-secondary" onClick={() => void load(page + 1)} disabled={loading}>
                {loading ? t('Загрузка…') : t('Показать ещё ({n})', { n: total - list.length })}
              </button>
            )}
          </>
        )}
    </section>
  );
}

function CommentForm({ documentId, parentId, onCreated }: { documentId: string; parentId?: string; onCreated(): void }) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'warn' | 'error' | 'info'; title: string; text: string } | null>(null);
  // One key per logical submission: kept for retries of the same text, replaced when the text changes.
  const attempt = useRef<{ key: string; body: string } | null>(null);
  const id = useId();
  const trimmed = body.trim();
  const over = body.length > MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending || !trimmed || over) return;
    if (!attempt.current || attempt.current.body !== trimmed) attempt.current = { key: crypto.randomUUID(), body: trimmed };
    setSending(true); setResult(null);
    try {
      const { item } = await apiSend<{ item: CreatedComment }>(`/documents/${encodeURIComponent(documentId)}/comments`, 'POST',
        { body: trimmed, ...(parentId ? { parentId } : {}) }, { 'Idempotency-Key': attempt.current.key });
      attempt.current = null;
      if (item.status === 'REJECTED') {
        setResult({ tone: 'error', title: t('Комментарий отклонён'), text: t(reasonText[item.reason] ?? reasonText.PROFANITY) });
      } else {
        setBody('');
        setResult(item.status === 'PUBLISHED'
          ? { tone: 'success', title: t('Комментарий опубликован'), text: t('Спасибо за участие в обсуждении.') }
          : { tone: 'info', title: t('Комментарий отправлен на проверку'), text: t(reasonText.REVIEW_REQUIRED) });
      }
      onCreated();
    } catch (error) {
      if (error instanceof ApiClientError && error.network) {
        setResult({ tone: 'warn', title: t('Нет соединения'), text: t('Комментарий мог не дойти до сервера. Нажмите «Отправить» ещё раз — повтор не создаст дубликат.') });
      } else {
        if (error instanceof ApiClientError && error.status === 409) attempt.current = null;
        setResult({ tone: 'error', title: t('Не удалось отправить комментарий'), text: errorText(error, t) });
      }
    } finally { setSending(false); }
  }

  return (
    <form className="card card-flat stack" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={id}>{parentId ? t('Ваш ответ') : t('Ваш комментарий')}</label>
        <textarea id={id} className="textarea" value={body} onChange={e => setBody(e.target.value)} aria-invalid={over}
          aria-describedby={`${id}-counter`} rows={4} />
        <span id={`${id}-counter`} className="hint counter" data-over={over} aria-live={over ? 'polite' : 'off'}>
          {body.length} / {MAX}{over ? ` — ${t('превышение на {n}', { n: body.length - MAX })}` : ''}
        </span>
      </div>
      {result && <Notice tone={result.tone} title={result.title} live><p>{result.text}</p></Notice>}
      <div>
        <button type="submit" className="btn btn-primary" disabled={sending || !trimmed || over}>
          {sending ? <><span className="spinner" aria-hidden="true" /> {t('Отправка…')}</> : t('Отправить')}
        </button>
      </div>
    </form>
  );
}

function CommentItem({ comment, documentId, canReport, onCreated }: { comment: PublicComment; documentId: string; canReport: boolean; onCreated(): void }) {
  const { t, formatDate } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [reply, setReply] = useState(false);
  const id = useId();
  const valid = reason.trim().length >= 3 && reason.trim().length <= 500;

  async function report(e: FormEvent) {
    e.preventDefault();
    if (!valid) return setError(t('Опишите причину: от 3 до 500 символов.'));
    setState('sending'); setError('');
    try {
      await apiSend(`/comments/${encodeURIComponent(comment.id)}/reports`, 'POST', { reason: reason.trim() });
      setState('sent'); dialog.current?.close();
    } catch (err) { setState('idle'); setError(errorText(err, t)); }
  }

  return (
    <li className="comment" id={`comment-${comment.id}`}>
      <div className="comment-head">
        <strong>{comment.author.name}</strong>
        <time className="muted small" dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
      </div>
      <p className="pre-wrap">{comment.body}</p>
      {comment.parentId && <p className="small muted">{t('Ответ на комментарий')} · <a href={`#comment-${comment.parentId}`}>{t('Перейти к исходному комментарию')}</a></p>}
      {canReport && <button type="button" className="btn btn-ghost btn-sm" aria-expanded={reply} onClick={() => setReply(v => !v)}>{reply ? t('Отменить ответ') : t('Ответить')}</button>}
      {canReport && reply && <CommentForm documentId={documentId} parentId={comment.id} onCreated={onCreated} />}
      {canReport && (state === 'sent'
        ? <p className="small muted" role="status" style={{ margin: 0 }}>{t('Жалоба отправлена модератору.')}</p>
        : <button ref={opener} type="button" className="btn btn-ghost btn-sm" onClick={() => { setError(''); dialog.current?.showModal(); }}>{t('Пожаловаться')}</button>)}
      <dialog ref={dialog} aria-labelledby={`${id}-title`} onClose={() => opener.current?.focus()}>
        <form onSubmit={report} className="stack" noValidate>
          <h3 id={`${id}-title`}>{t('Жалоба на комментарий')}</h3>
          <p className="muted small">{t('Модератор проверит комментарий автора «{name}» и примет решение.', { name: comment.author.name })}</p>
          <div className="field">
            <label htmlFor={`${id}-reason`}>{t('Причина жалобы')}</label>
            <textarea id={`${id}-reason`} className="textarea" value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
              aria-invalid={!!error} aria-describedby={`${id}-hint`} rows={3} />
            <span id={`${id}-hint`} className="hint">{reason.trim().length} / 500, {t('минимум 3 символа')}</span>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? t('Отправка…') : t('Отправить жалобу')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>{t('Отмена')}</button>
          </div>
        </form>
      </dialog>
    </li>
  );
}
