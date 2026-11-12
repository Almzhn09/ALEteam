'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CurrentUser } from '@/contracts/api';
import { ApiClientError, apiGet, apiSend } from './api';
export {safeReturnTo} from './return-to';

type SessionState = { status: 'loading' } | { status: 'guest' } | { status: 'user'; user: CurrentUser } | { status: 'error'; message: string };
interface SessionApi {
  state: SessionState;
  user: CurrentUser | null;
  refresh(): Promise<void>;
  signIn(email: string, password: string): Promise<CurrentUser>;
  signUp(name: string, email: string, password: string): Promise<CurrentUser>;
  signOut(): Promise<void>;
}
const SessionContext = createContext<SessionApi | null>(null);

// UI hint only: every protected action is re-checked by the server.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const channel = useRef<BroadcastChannel | null>(null);
  const generation = useRef(0);
  const mutating = useRef(false);
  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const request = ++generation.current;
    try { const {item} = await apiGet<{ item: CurrentUser }>('/me'); if (request === generation.current) setState({ status: 'user', user: item }); }
    catch (error) {
      if (request !== generation.current) return;
      if (error instanceof ApiClientError && error.status === 401) setState({ status: 'guest' });
      else setState({ status: 'error', message: 'Не удалось проверить вход.' });
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('aleteam-session');
      channel.current.onmessage = () => { if (!mutating.current) { setState({ status: 'loading' }); void refresh(); } };
    }
    return () => { ++generation.current; window.removeEventListener('focus', onFocus); channel.current?.close(); channel.current = null; };
  }, [refresh]);
  const authenticate = useCallback(async (path: string, body: Record<string,string>) => {
    if (mutating.current) throw new Error('AUTH_OPERATION_IN_PROGRESS');
    mutating.current = true; ++generation.current;
    try {
      await apiSend(path, 'POST', body);
      const {item} = await apiGet<{item:CurrentUser}>('/me');
      setState({status:'user',user:item});
      channel.current?.postMessage('changed');
      return item;
    } finally { mutating.current = false; }
  }, []);
  const signIn = useCallback((email: string, password: string) => authenticate('/auth/sign-in/email', {email,password}), [authenticate]);
  const signUp = useCallback((name: string, email: string, password: string) => authenticate('/auth/sign-up/email', {name,email,password}), [authenticate]);
  const signOut = useCallback(async () => {
    if (mutating.current) throw new Error('AUTH_OPERATION_IN_PROGRESS');
    mutating.current = true; ++generation.current;
    try {
      await apiSend('/auth/sign-out', 'POST', {});
      setState({status:'guest'});
      channel.current?.postMessage('changed');
    } finally { mutating.current = false; }
  }, []);
  const user = state.status === 'user' ? state.user : null;
  return <SessionContext value={{ state, user, refresh, signIn, signUp, signOut }}>{children}</SessionContext>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}
