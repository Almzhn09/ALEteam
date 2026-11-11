import { cache } from 'react';
import type { ContentKind, ContentLocale, PublicContentItem } from '@/contracts/cms';
import { listContent } from '@/server/public-read';

export interface ListedItem { item: PublicContentItem; original: boolean }

/**
 * Published items of a kind (and optional category) for the reader's language. A publication that exists only in
 * another language is listed once in its source language and marked as such; nothing is presented as translated.
 */
export const listWithSource = cache(async (lang: ContentLocale, kind: ContentKind, category?: string): Promise<ListedItem[]> => {
  const order: ContentLocale[] = [lang, ...(['ru', 'kk', 'en'] as const).filter(l => l !== lang)];
  const lists = await Promise.all(order.map(l => listContent(l, kind)));
  const seen = new Set<string>();
  const out: ListedItem[] = [];
  lists.forEach((list, index) => {
    for (const item of list) {
      if (seen.has(item.id) || (category && item.payload.category !== category)) continue;
      seen.add(item.id);
      out.push({ item, original: index > 0 });
    }
  });
  return out.sort((a, b) => a.item.slug.localeCompare(b.item.slug, 'ru', { numeric: true }));
});

/** Link to the generic material page in the language the item is actually published in. */
export function materialHref({ item, original }: ListedItem) {
  return `/materials/${item.slug}${original ? `?contentLang=${item.locale}` : ''}`;
}

/** Link to the first published page of a category (in its real language), or a fallback when none exists. */
export async function firstHref(lang: ContentLocale, category: string, fallback: string) {
  const [first] = await listWithSource(lang, 'PAGE', category);
  return first ? materialHref(first) : fallback;
}
