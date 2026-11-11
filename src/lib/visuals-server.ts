import { cache } from 'react';
import type { AttachmentRef } from '@/contracts/real-content';
import { materialAttachments } from '@/server/material-attachments';
import { allContentById } from '@/server/public-read';
import { visuals, visualSlots, type Visual, type VisualSlot } from './visuals';

export interface PublishedVisual extends Visual { src: string; material: { slug: string } }

/** Every published image attachment on public CMS pages, keyed by the SHA-256 of its original bytes. */
const publishedImages = cache(async (): Promise<Map<string, { ref: AttachmentRef; slug: string }>> => {
  const out = new Map<string, { ref: AttachmentRef; slug: string }>();
  try {
    const items = [...(await allContentById('ru')).values()].filter(i => i.kind === 'PAGE');
    const lists = await Promise.all(items.map(async item => ({ item, refs: await materialAttachments({ kind: 'cms', id: item.id }, 'ru').catch(() => []) })));
    for (const { item, refs } of lists) for (const ref of refs) {
      if (ref.variant === 'master' && /^image\/(png|jpeg)$/.test(ref.mimeType) && !out.has(ref.sha256)) out.set(ref.sha256, { ref, slug: item.slug });
    }
  } catch (error) { console.error('archive_visuals_failed', (error as Error).name); }
  return out;
});

/** The first image of a slot whose attachment is currently published; null keeps the page text-only. */
export async function slotVisual(slot: VisualSlot): Promise<PublishedVisual | null> {
  const published = await publishedImages();
  for (const id of visualSlots[slot]) {
    const visual = visuals.find(v => v.id === id);
    const hit = visual && published.get(visual.sha256);
    if (visual && hit) return { ...visual, src: hit.ref.href, material: { slug: hit.slug } };
  }
  return null;
}
