'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DocumentSummary, Favorite, Page } from '@/contracts/api';
import { apiGet, apiSend } from './api';
import { useSession } from './session';

export type { Favorite } from '@/contracts/api';
const KEY = 'aleteam-favorites-v1';
function readLocal(): Favorite[] {
  const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((f): f is Favorite => !!f && /^[a-zA-Z0-9_-]{1,80}$/.test(f.id) && typeof f.title === 'string'
    && typeof f.reference === 'string' && Number.isInteger(f.year) && typeof f.savedAt === 'string').slice(0, 1000);
}
function writeLocal(items: Favorite[]) { localStorage.setItem(KEY, JSON.stringify(items)); }
interface FavoritesApi {
  items: Favorite[]; hydrated: boolean; available: boolean; busy: boolean; server: boolean; guestCount: number; error: unknown;
  has(id: string): boolean; add(doc: DocumentSummary): Promise<void>; remove(id: string): Promise<void>;
  clear(): Promise<void>; importGuest(): Promise<void>; refresh(): Promise<void>;
}
const FavoritesContext = createContext<FavoritesApi | null>(null);
type Store = { owner: string; items: Favorite[]; available: boolean; guestCount: number; error: unknown };

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { state, user, refresh: refreshSession } = useSession();
  const owner = user?.id ?? (state.status === 'guest' ? 'guest' : 'loading');
  const active = useRef(owner); active.current = owner;
  const [store, setStore] = useState<Store | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const ensureOwner = useCallback(() => { if (active.current !== owner || owner === 'loading') throw new Error('SESSION_CHANGED'); }, [owner]);
  const refresh = useCallback(async () => {
    if (owner === 'loading') return;
    let guest: Favorite[] = []; let available = true;
    try { guest = readLocal(); } catch { available = false; }
    if (owner === 'guest') {
      setStore({ owner, items: guest, available, guestCount: guest.length, error: null }); return;
    }
    try {
      const items: Favorite[] = [];
      for (let page = 1; page <= 20; page++) {
        ensureOwner();
        const result = await apiGet<Page<Favorite> & { ownerId: string }>(`/me/favorites?page=${page}&pageSize=50`);
        if (result.ownerId !== owner) { await refreshSession(); return; }
        items.push(...result.items);
        if (page * 50 >= result.total) break;
      }
      ensureOwner();
      setStore({ owner, items: [...new Map(items.map(f => [f.id, f])).values()], available: true, guestCount: guest.length, error: null });
    } catch (error) {
      if (active.current === owner) setStore(old => ({ owner, items: old?.owner === owner ? old.items : [], available: true, guestCount: guest.length, error }));
    }
  }, [owner, ensureOwner, refreshSession]);
  useEffect(() => {
    void refresh();
    const update = () => { if (!locked.current) void refresh(); };
    window.addEventListener('focus', update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('focus', update); window.removeEventListener('storage', update); };
  }, [refresh]);
  async function mutate(work: () => Promise<void>) {
    ensureOwner();
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { await work(); if (active.current === owner) await refresh(); }
    finally { locked.current = false; setBusy(false); }
  }
  // An account's list is never persisted in localStorage or shown while identity changes.
  const current = store?.owner === owner ? store : null;
  const items = current?.items ?? [];
  const server = owner !== 'guest' && owner !== 'loading';
  return <FavoritesContext value={{ items, hydrated: !!current, available: current?.available ?? true, busy, server,
    guestCount: current?.guestCount ?? 0, error: state.status === 'error' ? new Error(state.message) : current?.error,
    refresh: () => owner === 'loading' ? refreshSession() : refresh(), has: id => items.some(f => f.id === id),
    add: doc => mutate(async () => {
      if (server) await apiSend(`/me/favorites/${encodeURIComponent(doc.id)}`, 'PUT', {});
      else {
        const saved = readLocal();
        if (saved.some(f => f.id === doc.id)) return;
        const { id, title, reference, year, type, isDemo } = doc;
        writeLocal([{ id, title, reference, year, type, isDemo, savedAt: new Date().toISOString() }, ...saved].slice(0, 1000));
      }
    }),
    remove: id => mutate(async () => {
      if (server) await apiSend(`/me/favorites/${encodeURIComponent(id)}`, 'DELETE', {});
      else writeLocal(readLocal().filter(f => f.id !== id));
    }),
    clear: () => mutate(async () => { if (server) await apiSend('/me/favorites', 'DELETE', {}); else writeLocal([]); }),
    importGuest: () => mutate(async () => {
      if (!server) return;
      const guest = readLocal();
      for (let offset = 0; offset < guest.length; offset += 100) {
        ensureOwner();
        await apiSend('/me/favorites/import', 'POST', { documentIds: guest.slice(offset, offset + 100).map(f => f.id) });
      }
      ensureOwner();
      writeLocal(readLocal().filter(f => !guest.some(g => g.id === f.id)));
    }),
  }}>{children}</FavoritesContext>;
}
export function useFavorites() {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error('useFavorites outside FavoritesProvider');
  return value;
}
