import { cache } from 'react';
import type { DocumentSummary, Page } from '@/contracts/api';
import type { ContentKind, ContentLocale, PublicContentItem } from '@/contracts/cms';
import { documentList, publicDocument } from './catalog';
import { publicContent } from './cms';
import { ApiError } from './http';

// Server-rendered pages read through the same validated public handlers as /api, so visibility rules stay in one place.
const base = 'http://internal.invalid/api';
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

async function page(query: URLSearchParams): Promise<Page<PublicContentItem>> {
  return (await publicContent(new Request(`${base}/content?${query}`))).json();
}
// The public API has no category/date filters yet: lists read up to 500 records and filter them on the server.
export const listContent = cache(async (locale: ContentLocale, kind: ContentKind): Promise<PublicContentItem[]> => {
  const items: PublicContentItem[] = [];
  try {
    for (let n = 1; n <= MAX_PAGES; n++) {
      const result = await page(new URLSearchParams({ locale, kind, page: String(n), pageSize: String(PAGE_SIZE) }));
      items.push(...result.items);
      if (items.length >= result.total || !result.items.length) break;
    }
  } catch (error) { console.error('archive_public_content_failed', (error as Error).name); }
  return items;
});

export const getContent = cache(async (slug: string, locale: ContentLocale): Promise<PublicContentItem | null> => {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) return null;
  try { return (await (await publicContent(new Request(`${base}/content/${slug}?locale=${locale}`), slug)).json()).item; }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
});

/** Public editions only. Readers may show a source edition with an explicit language notice. */
export async function getLocalized(slug: string, locale: ContentLocale, kinds: readonly ContentKind[], allowSource = false) {
  const others = (['ru', 'kk', 'en'] as const).filter(l => l !== locale);
  const item = await getContent(slug, locale);
  if (item) return kinds.includes(item.kind) ? { item, available: item.availableLocales } : { item: null, available: [] };
  const found = (await Promise.all(others.map(l => getContent(slug, l)))).filter((v): v is PublicContentItem => !!v && kinds.includes(v.kind));
  return { item: allowSource ? found[0] ?? null : null, available: found.map(v => v.locale) };
}

export const allContentById = cache(async (locale: ContentLocale) => {
  const kinds = ['PAGE', 'NEWS', 'COLLECTION', 'PERSON', 'EVENT', 'MEMOIR', 'EXHIBITION', 'EXHIBIT', 'BRANCH_PROFILE'] as const;
  const lists = await Promise.all(kinds.map(kind => listContent(locale, kind)));
  return new Map(lists.flat().map(item => [item.id, item]));
});

export const getDocument = cache(async (id: string, locale: ContentLocale) => {
  try { return await publicDocument(id, new Request(`${base}/documents/${id}?locale=${locale}`)); }
  catch (error) { if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null; if ((error as Error).name === 'ZodError') return null; throw error; }
});

export async function latestDocuments(locale: ContentLocale, pageSize: number): Promise<DocumentSummary[]> {
  try { return (await (await documentList(new Request(`${base}/documents?locale=${locale}&sort=year_desc&pageSize=${pageSize}`))).json()).items; }
  catch (error) { console.error('archive_public_documents_failed', (error as Error).name); return []; }
}

export function contentHref(item: Pick<PublicContentItem, 'kind' | 'slug'>) {
  const path = { NEWS: 'news', EXHIBITION: 'exhibitions', BRANCH_PROFILE: 'branches', COLLECTION: 'memory', PERSON: 'memory', EVENT: 'memory', MEMOIR: 'memory' }[item.kind as string];
  return `/${path ?? 'pages'}/${item.slug}`;
}
