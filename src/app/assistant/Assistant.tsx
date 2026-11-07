'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AssistantAnswer } from '@/contracts/api';
import { ApiClientError, apiSend, errorText } from '@/lib/api';
import { useSession } from '@/lib/session';
import { DemoBadge, Loading, Notice, Ru } from '@/components/ui';
import { useI18n } from '@/lib/lang';
import type { Translate } from '@/lib/i18n';

const MAX = 1000;
const STORE = 'aleteam-assistant-history-v1';
type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; noAnswer: boolean; sources: AssistantAnswer['sources'] }
  | { role: 'error'; content: string; retry?: string };

const examples = ['Есть ли материалы о библиотеке?', 'Что означает архивный шифр?', 'Найди документы о железной дороге'];

function isMessage(v: unknown): v is Message {
  const m = v as Message;
  if (!m || typeof m.content !== 'string') return false;
  if (m.role === 'user') return true;
  return m.role === 'assistant' && typeof m.noAnswer === 'boolean' && Array.isArray(m.sources)
    && m.sources.every(s => typeof s?.id === 'string' && typeof s.title === 'string');
}

function errorMessage(error: unknown, t: Translate): string {
  if (!(error instanceof ApiClientError)) return errorText(error, t);
  if (error.status === 503) return t('Помощник сейчас недоступен: сервис ИИ не подключён или не ответил вовремя. Ответ не сформирован.');
  if (error.status === 502) return t('Ответ помощника не прошёл проверку источников и не показан. Попробуйте переформулировать вопрос.');
  if (error.status === 429) return `${t('Лимит вопросов исчерпан.')} ${error.retryAfter ? errorText(error, t) : t('Повторите позже.')}`;
  return errorText(error, t);
}

export function Assistant() {
  const { state, user } = useSession();
  const { t } = useI18n();
  const params = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState(() => (params.get('q') ?? '').slice(0, MAX));
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  // History lives only for the current browser tab session.
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(STORE) ?? '[]');
      if (Array.isArray(saved)) setMessages(saved.filter(isMessage).slice(-30));
    } catch { /* ignore broken storage */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30))); } catch { /* storage unavailable */ }
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || q.length > MAX || pending) return;
    const history = messages.filter((m): m is Exclude<Message, { role: 'error' }> => m.role !== 'error')
      .slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, MAX) }));
    setMessages(m => [...m.filter(x => x.role !== 'error'), { role: 'user', content: q }]);
    setQuestion(''); setPending(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const r = await Promise.race([
        apiSend<AssistantAnswer>('/assistant', 'POST', { question: q, history }),
        new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
      ]);
      setMessages(m => [...m, { role: 'assistant', content: r.answer, noAnswer: r.noAnswer, sources: r.sources }]);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') setMessages(m => [...m, { role: 'error', content: t('Запрос отменён.'), retry: q }]);
      else setMessages(m => [...m, { role: 'error', content: errorMessage(error, t), retry: error instanceof ApiClientError && error.status !== 429 ? q : undefined }]);
    } finally {
      setPending(false); controller.current = null;
      input.current?.focus();
    }
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void ask(question); }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(question); }
  }
  function clear() { setMessages([]); try { sessionStorage.removeItem(STORE); } catch { /* ignore */ } }

  if (state.status === 'loading') return <Loading rows={1} label={t('Проверка входа…')} />;
  if (!user) return (
    <Notice tone="info" title={t('Войдите, чтобы задать вопрос')}>
      <p>{t('ИИ-помощник доступен участникам после входа — это защищает сервис от злоупотреблений.')}</p>
      <Link className="btn btn-primary btn-sm" href={`/login?returnTo=${encodeURIComponent('/assistant')}`}>{t('Войти')}</Link>
    </Notice>
  );

  const over = question.length > MAX;
  return (
    <div className="chat">
      {messages.length === 0 ? (
        <div className="panel">
          <p style={{ fontWeight: 600 }}>{t('Примеры вопросов')}</p>
          <div className="row">
            {examples.map(x => <button key={x} type="button" className="btn btn-secondary btn-sm" onClick={() => void ask(t(x))}>{t(x)}</button>)}
          </div>
          <p className="small muted" style={{ margin: 'var(--space-3) 0 0' }}>{t('Не отправляйте персональные данные. Помощник может ошибаться: решения принимайте по самим документам.')}</p>
        </div>
      ) : (
        <div className="row spread">
          <span className="small muted">{t('История хранится только до закрытия вкладки.')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={pending}>{t('Очистить историю')}</button>
        </div>
      )}

      <ol className="chat-log" aria-label={t('Диалог с помощником')} aria-live="polite" aria-relevant="additions">
        {messages.map((m, i) => (
          <li key={i} className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'error' ? 'msg-error' : `msg-assistant${m.noAnswer ? ' msg-noanswer' : ''}`}`}>
            <span className="visually-hidden">{m.role === 'user' ? t('Вы:') : t('Помощник:')} </span>
            {m.role === 'error' ? (
              <Notice tone="error" title={t('Ответ не получен')}>
                <p>{m.content}</p>
                {m.retry && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ask(m.retry!)}>{t('Повторить вопрос')}</button>}
              </Notice>
            ) : m.role === 'assistant' ? <>
              {m.noAnswer && <strong className="notice-title">{t('В материалах архива ответа не найдено')}</strong>}
              {m.content}
              {m.sources.length > 0 && (
                <div className="sources small">
                  <strong>{t('Источники:')}</strong>
                  <ul>
                    {m.sources.map(s => (
                      <li key={s.id}><Link href={`/documents/${encodeURIComponent(s.id)}`}><Ru>{s.title}</Ru></Link> <DemoBadge show={s.isDemo} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </> : m.content}
          </li>
        ))}
        {pending && (
          <li className="msg msg-assistant row" role="status">
            <span className="spinner" aria-hidden="true" /> {t('Ищу в материалах архива…')}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => controller.current?.abort()}>{t('Отменить')}</button>
          </li>
        )}
      </ol>
      <div ref={logEnd} />

      <form className="chat-form" onSubmit={onSubmit}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={id} className="visually-hidden">{t('Ваш вопрос')}</label>
          <textarea ref={input} id={id} className="textarea" rows={2} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={onKey}
            placeholder={t('Задайте вопрос об архиве или материалах…')} aria-invalid={over} aria-describedby={`${id}-hint`} />
          <span id={`${id}-hint`} className="hint counter" data-over={over}>{question.length} / {MAX} · {t('Enter — отправить, Shift+Enter — новая строка')}</span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending || !question.trim() || over}>{t('Спросить')}</button>
      </form>
    </div>
  );
}
