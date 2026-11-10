import type { MetadataRoute } from 'next';
import type { DocumentSummary, Page } from '@/contracts/api';
import type { ContentKind } from '@/contracts/cms';
import { LANGS } from '@/lib/i18n';
import { siteUrl } from '@/lib/seo';
import { documentList } from '@/server/catalog';
import { contentHref, listContent } from '@/server/public-read';

export const dynamic = 'force-dynamic';
const pages = ['/', '/catalog', '/exhibitions', '/memory', '/branches', '/news', '/about', '/help', '/timeline'];
const kinds: ContentKind[] = ['PAGE', 'NEWS', 'COLLECTION', 'PERSON', 'EVENT', 'MEMOIR', 'EXHIBITION', 'BRANCH_PROFILE'];
const MAX_DOCUMENT_PAGES = 20;

// Only published material: list handlers already exclude drafts, closed documents and hidden branches.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entry = (path: string, languages: readonly string[]) => ({
    url: `${base}${path}`,
    alternates: { languages: Object.fromEntries(languages.map(l => [l, `${base}${path}${path.includes('?') ? '&' : '?'}lang=${l}`])) },
  });
  const result: MetadataRoute.Sitemap = pages.map(p => entry(p, LANGS));
  const seen = new Set<string>();
  for (const locale of LANGS) for (const kind of kinds) for (const item of await listContent(locale, kind)) {
    const path = contentHref(item);
    if (!seen.has(path)) { seen.add(path); result.push(entry(path, item.availableLocales)); }
  }
  try {
    for (let page = 1; page <= MAX_DOCUMENT_PAGES; page++) {
      const list: Page<DocumentSummary & { availableLocales?: string[] }> = await (await documentList(new Request(`http://internal.invalid/api/documents?pageSize=50&page=${page}`))).json();
      result.push(...list.items.map(d => entry(`/documents/${encodeURIComponent(d.id)}`, d.availableLocales ?? ['ru'])));
      if (page * 50 >= list.total) break;
    }
  } catch (error) { console.error('archive_sitemap_documents_failed', (error as Error).name); }
  return result;
}
