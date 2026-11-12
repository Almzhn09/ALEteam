import type { Metadata } from 'next';
import type { PublicContentItem } from '@/contracts/cms';
import { LANGS } from './i18n';

export const siteUrl = () => (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const withLang = (path: string, lang: string) => `${path}${path.includes('?') ? '&' : '?'}lang=${lang}`;

export function languageAlternates(path: string, languages: readonly string[] = LANGS): NonNullable<Metadata['alternates']> {
  return { canonical: path, languages: Object.fromEntries([...languages.map(l => [l, withLang(path, l)]), ['x-default', path]]) };
}
export function contentMetadata(item: PublicContentItem, path: string): Metadata {
  const p = item.payload;
  const description = p.seoDescription ?? p.body.slice(0, 160);
  return {
    title: p.title, description, keywords: p.seoKeywords.length ? p.seoKeywords : undefined,
    alternates: languageAlternates(path, item.availableLocales),
    openGraph: { title: p.title, description, type: item.kind === 'NEWS' ? 'article' : 'website', locale: item.locale, url: path },
  };
}
