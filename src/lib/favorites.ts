'use client';
import { useSyncExternalStore } from 'react';
import type { DocumentSummary } from '@/contracts/api';

// Browser-only favorites (F06). Server sync is E01, after P0.
export type Favorite = Pick<DocumentSummary, 'id' | 'title' | 'reference' | 'year' | 'type' | 'isDemo'> & { savedAt: string };
const KEY = 'aleteam-favorites-v1';
const listeners = new Set<() => void>();
let cache: { raw: string | null; items: Favorite[] } = { raw: null, items: [] };
let available: boolean | null = null;

function storage(): Storage | null {
  try {
    const s = window.localStorage; const probe = `${KEY}-probe`;
    s.setItem(probe, '1'); s.removeItem(probe); available = true; return s;
  } catch { available = false; return null; }
}

function isFavorite(v: unknown): v is Favorite {
  const f = v as Favorite;
  return !!f && typeof f.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(f.id) && typeof f.title === 'string'
    && typeof f.reference === 'string' && typeof f.year === 'number' && typeof f.savedAt === 'string';
}

function read(): Favorite[] {
  const raw = storage()?.getItem(KEY) ?? null;
  if (raw === cache.raw) return cache.items;
  let items: Favorite[] = [];
  try { const parsed: unknown = raw ? JSON.parse(raw) : []; items = Array.isArray(parsed) ? parsed.filter(isFavorite) : []; }
  catch { items = []; }
  cache = { raw, items };
  return items;
}

function write(items: Favorite[]) {
  const s = storage();
  if (!s) throw new Error('STORAGE_UNAVAILABLE');
  s.setItem(KEY, JSON.stringify(items));
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY || e.key === null) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

const empty: Favorite[] = [];
export function useFavorites() {
  const items = useSyncExternalStore(subscribe, read, () => empty);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return {
    items, hydrated,
    available: hydrated ? available !== false : true,
    has: (id: string) => items.some(f => f.id === id),
    add(doc: DocumentSummary) {
      if (items.some(f => f.id === doc.id)) return;
      const { id, title, reference, year, type, isDemo } = doc;
      write([{ id, title, reference, year, type, isDemo, savedAt: new Date().toISOString() }, ...items]);
    },
    remove(id: string) { write(items.filter(f => f.id !== id)); },
    clear() { write([]); },
  };
}
