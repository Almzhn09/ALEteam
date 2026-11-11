// Shared by the server page and the client search: a plain module, not 'use client'.
export const SEARCH_SCOPES = ['all', 'cms', 'fund', 'newspaper'] as const;
export const searchKey = (q: string, scope: string, page: number, lang: string) => [q, scope, page, lang].join('\u0000');
