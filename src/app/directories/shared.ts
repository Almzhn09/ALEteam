// Shared by the server page and the client list: a plain module, not 'use client'.
export const directoryKey = (q: string, page: number, sort: string) => `${q}\u0000${page}\u0000${sort}`;

/** Match the directory API's bounded integer page even for a hand-edited URL. */
export function directoryPage(value: string | null | undefined): number {
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.min(10000, Math.max(1, Math.trunc(raw))) : 1;
}
