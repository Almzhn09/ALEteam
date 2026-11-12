import { cache } from 'react';
import { directory } from '@/server/reference-directory';

/** Totals of the public reference directories, read through the same handler as /api/directories. */
export const directoryTotals = cache(async (): Promise<{ funds: number | null; newspapers: number | null }> => {
  const total = async (kind: 'fund' | 'newspaper') => {
    try {
      const path = kind === 'fund' ? 'funds' : 'newspapers';
      const response = await directory(new Request(`http://internal.invalid/api/directories/${path}?pageSize=1`), kind);
      return ((await response.json()) as { total: number }).total;
    } catch (error) { console.error('archive_directory_totals_failed', (error as Error).name); return null; }
  };
  const [funds, newspapers] = await Promise.all([total('fund'), total('newspaper')]);
  return { funds, newspapers };
});
