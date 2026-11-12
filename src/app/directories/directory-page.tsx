import { directory } from '@/server/reference-directory';
import { DirectoryList, type Result } from './DirectoryList';
import { directoryKey, directoryPage } from './shared';

const PAGE_SIZE = 20;
type Search = { q?: string; page?: string; sort?: string };

/** Server-rendered first page of a directory, read through the same handler as /api/directories. */
export async function DirectoryPage({ kind, searchParams }: { kind: 'funds' | 'newspapers'; searchParams: Promise<Search> }) {
  const p = await searchParams;
  const q = (p.q ?? '').trim().slice(0, 200);
  const page = directoryPage(p.page);
  const sort = p.sort === 'title' ? 'title' : 'source';
  let initial: Result | null = null;
  try {
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (q) query.set('q', q);
    const response = await directory(new Request(`http://internal.invalid/api/directories/${kind}?${query}`), kind === 'funds' ? 'fund' : 'newspaper');
    initial = await response.json();
  } catch { initial = null; }
  // No Suspense: the page is dynamic, so the list renders in the first HTML and nothing shifts when it streams.
  return <DirectoryList kind={kind} initial={initial} initialKey={directoryKey(q, page, sort)} />;
}
