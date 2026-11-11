import type { SearchResult } from '@/contracts/real-content';
import { getLang, getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { materialSearch } from '@/server/material-search';
import { SearchPage } from './SearchPage';
import { SEARCH_SCOPES, searchKey } from './shared';

type Props = { searchParams: Promise<{ q?: string; scope?: string; page?: string }> };
export async function generateMetadata() { return { title: (await getT())('Поиск'), alternates: languageAlternates('/search') }; }

// First result page is rendered on the server through the same handler as /api/search; no Suspense, nothing shifts.
export default async function Page({ searchParams }: Props) {
  const [p, lang] = await Promise.all([searchParams, getLang()]);
  const q = (p.q ?? '').trim().slice(0, 100);
  const scope = SEARCH_SCOPES.includes(p.scope as typeof SEARCH_SCOPES[number]) ? p.scope! : 'all';
  const page = Math.max(1,Math.min(10000,Math.floor(Number(p.page))||1));
  let initial: SearchResult | null = null;
  if (q) {
    try {
      const query = new URLSearchParams({ q, scope, locale: lang, page: String(page), pageSize: '20' });
      initial = await (await materialSearch(new Request(`http://internal.invalid/api/search?${query}`))).json();
    } catch { initial = null; }
  }
  return <SearchPage initial={initial} initialKey={searchKey(q, scope, page, lang)} />;
}
