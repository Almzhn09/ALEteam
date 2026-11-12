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

import {assistantReadingLink,assistantSearchLink} from '@/lib/assistant-source-link';
import {researchLink} from '@/lib/discovery-links';

const MAX = 1000;

const STORE = 'aleteam-assistant-history-v1';
type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; noAnswer: boolean; sources: AssistantAnswer['sources']; mode?: AssistantAnswer['mode']; researchSteps?:AssistantAnswer['researchSteps']; actions?:AssistantAnswer['actions']; nameExpansion?:AssistantAnswer['nameExpansion']; researchLimitations?:AssistantAnswer['researchLimitations']; suggestions?:string[]; talk?:boolean; searchHref?:string }
  | { role: 'error'; content: string; retry?: string };

const examples = ['Когда был образован архив?', 'Какие часы работы читального зала?', 'Что такое архивный фонд?'];

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
  const { t,lang } = useI18n();
  const params = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageOwner, setMessageOwner] = useState<string | null>(null);
  const activeUser = useRef(user?.id); activeUser.current = user?.id;
  const [question, setQuestion] = useState(() => (params.get('q') ?? '').slice(0, MAX));
  const [pending, setPending] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  // History lives only for the current browser tab session.
  useEffect(() => {
    controller.current?.abort(); setPending(false);
    setMessages([]); setMessageOwner(user?.id ?? null);
    if (!user) return;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(`${STORE}:${user.id}:${lang}`) ?? '[]');
      if (Array.isArray(saved)) setMessages(saved.filter(isMessage).slice(-30).map(m=>m.role==='assistant'?{role:m.role,content:m.content,noAnswer:m.noAnswer,sources:m.sources,mode:m.mode,talk:m.talk===true,searchHref:assistantSearchLink(m.searchHref)}:m));
    } catch { /* ignore broken storage */ }
  }, [user?.id, lang]);
  useEffect(() => {
    if (!user || messageOwner !== user.id) return;
    try { sessionStorage.setItem(`${STORE}:${user.id}:${lang}`, JSON.stringify(messages.slice(-30))); } catch { /* storage unavailable */ }
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, user?.id, messageOwner]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || q.length > MAX || pending || !user || messageOwner !== user.id) return;
    const owner = user.id;
    const history = messages.filter((m): m is Exclude<Message, { role: 'error' }> => m.role !== 'error')
      .slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, MAX) }));
    setMessages(m => [...m.filter(x => x.role !== 'error'), { role: 'user', content: q }]);
    setQuestion(''); setPending(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const r = await Promise.race([
        apiSend<AssistantAnswer>('/assistant', 'POST', { question: q, history,locale:lang }, {}, abort.signal),
        new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
      ]);
      if (activeUser.current === owner) setMessages(m => [...m, { role: 'assistant', content: r.answer, noAnswer: r.noAnswer, sources: r.sources, mode: r.mode,researchSteps:r.researchSteps,actions:r.actions,nameExpansion:r.nameExpansion,researchLimitations:r.researchLimitations,suggestions:r.suggestions,talk:r.talk,searchHref:assistantSearchLink(r.searchHref) }]);
    } catch (error) {
      if (activeUser.current !== owner) return;
      if ((error as Error)?.name === 'AbortError') setMessages(m => [...m, { role: 'error', content: t('Запрос отменён.'), retry: q }]);
      else setMessages(m => [...m, { role: 'error', content: errorMessage(error, t), retry: error instanceof ApiClientError && error.status !== 429 ? q : undefined }]);
    } finally {
      if (activeUser.current === owner) { setPending(false); controller.current = null; input.current?.focus(); }
    }
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); void ask(question); }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(question); }
  }
  function clear() { setMessages([]); try { if (user) sessionStorage.removeItem(`${STORE}:${user.id}:${lang}`); } catch { /* ignore */ } }

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
          <div className="row chat-examples">
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
        {(messageOwner === user.id ? messages : []).map((m, i) => (
          <li key={i} className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'error' ? 'msg-error' : `msg-assistant${m.noAnswer ? ' msg-noanswer' : ''}`}`}>
            <span className="visually-hidden">{m.role === 'user' ? t('Вы:') : t('Помощник:')} </span>
            {m.role === 'error' ? (
              <Notice tone="error" title={t('Ответ не получен')}>
                <p>{m.content}</p>
                {m.retry && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ask(m.retry!)}>{t('Повторить вопрос')}</button>}
              </Notice>
            ) : m.role === 'assistant' ? <>
              <span className="badge badge-neutral" data-assistant-mode={m.mode ?? 'external'}>{m.mode === 'local-model' ? t('Локальная модель ALEteam') : m.mode === 'retrieval' ? t('Поиск по источникам') : m.mode === 'llm' ? t('LLM: выбор цитат') : t('Внешний сервис')}</span>
              {m.noAnswer && <strong className="notice-title">{t('В материалах архива ответа не найдено')}</strong>}
              <span className="msg-text">{m.content}</span>
              {m.nameExpansion?.applied&&<p className="small muted">{t('Учтены названия:')} {m.nameExpansion.variants.join(', ')}</p>}
              {!!m.researchSteps?.length&&<details className="research-steps" open><summary>{t('Шаги исследования')}</summary><ol>{m.researchSteps.map(step=><li key={step.id}>{step.text}</li>)}</ol><div className="row">{m.actions?.map((action,i)=><Link className="btn btn-secondary" key={i} href={researchLink(action)}>{t('Открыть предложенный поиск')}</Link>)}</div>{m.researchLimitations?.map(s=><p className="small muted" key={s}>{s}</p>)}</details>}
              {assistantSearchLink(m.searchHref)&&<div><Link className="btn btn-secondary" href={assistantSearchLink(m.searchHref)!}>{t('Открыть все результаты')}</Link></div>}
              {m.sources.length > 0 && !m.talk && (
                <div className="sources small">
                  <strong>{t('Источники:')}</strong>
                  <ul>
                    {m.sources.map(s => (
                      <li key={s.id}>{s.kind === 'cms' || s.kind === 'fund' || s.kind === 'newspaper' || (s.kind === 'document' && s.locale && s.locale !== 'ru') ? <a href={assistantReadingLink(s)}><span lang={s.locale}>{s.title}</span></a> : <Link href={assistantReadingLink(s)}>{s.locale === 'en' ? <span lang="en">{s.title}</span> : <Ru>{s.title}</Ru>}</Link>} <DemoBadge show={s.isDemo} /></li>
                    ))}
                  </ul>
                </div>
              )}
              {i === messages.length - 1 && !pending && !!m.suggestions?.length && (
                <div className="chat-suggestions" role="group" aria-label={t('Можно спросить')}>
                  {m.suggestions.map(s => <button key={s} type="button" className="btn btn-secondary btn-sm" onClick={() => void ask(s)}>{s}</button>)}
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
