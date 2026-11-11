// Shared by the server page and the client list: a plain module, not 'use client'.
export const directoryKey = (q: string, page: number, sort: string) => `${q}\u0000${page}\u0000${sort}`;
