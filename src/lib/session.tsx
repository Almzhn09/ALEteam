'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CurrentUser } from '@/contracts/api';
import { ApiClientError, apiGet, apiSend } from './api';

type SessionState = { status: 'loading' } | { status: 'guest' } | { status: 'user'; user: CurrentUser } | { status: 'error'; message: string };
interface SessionApi {
  state: SessionState;
  user: CurrentUser | null;
  refresh(): Promise<void>;
  signIn(email: string, password: string): Promise<CurrentUser>;
  signOut(): Promise<void>;
}
const SessionContext = createContext<SessionApi | null>(null);

// UI hint only: every protected action is re-checked by the server.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const refresh = useCallback(async () => {
    try { setState({ status: 'user', user: (await apiGet<{ item: CurrentUser }>('/me')).item }); }
    catch (error) {
      if (error instanceof ApiClientError && error.status === 401) setState({ status: 'guest' });
      else setState({ status: 'error', message: 'Не удалось проверить вход.' });
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const signIn = useCallback(async (email: string, password: string) => {
    await apiSend('/auth/sign-in/email', 'POST', { email, password });
    const { item } = await apiGet<{ item: CurrentUser }>('/me');
    setState({ status: 'user', user: item });
    return item;
  }, []);
  const signOut = useCallback(async () => {
    await apiSend('/auth/sign-out', 'POST', {});
    setState({ status: 'guest' });
  }, []);
  const user = state.status === 'user' ? state.user : null;
  return <SessionContext value={{ state, user, refresh, signIn, signOut }}>{children}</SessionContext>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession outside SessionProvider');
  return value;
}

// Only same-site relative paths are accepted as a post-login destination.
export function safeReturnTo(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}
