import type { MaterialRef } from '@/contracts/discovery';
import { getT } from '@/lib/i18n-server';
import { related } from '@/server/discovery-places';
import { MaterialCards } from './DiscoveryMaterials';

/** Related materials rendered on the server (same handler as /api/discovery/materials/:kind/:id/related). */
export async function RelatedServer({ id, kind, locale }: { id: string; kind: 'cms' | 'document'; locale: string }) {
  const t = await getT();
  let items: MaterialRef[] = [];
  try {
    const response = await related(new Request(`http://internal.invalid/api/discovery/materials/${kind}/${id}/related?locale=${locale}&limit=5`), id, kind);
    items = ((await response.json()) as { items: MaterialRef[] }).items;
  } catch (error) { console.error('archive_related_failed', (error as Error).name); return null; }
  return (
    <section className="stack" aria-labelledby={`related-${id}`}>
      <h2 id={`related-${id}`}>{t('Связанные материалы')}</h2>
      {items.length ? <MaterialCards items={items} /> : <p className="muted">{t('Связанные открытые материалы пока не найдены.')}</p>}
    </section>
  );
}
