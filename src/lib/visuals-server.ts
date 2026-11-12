import { cache } from 'react';
import type { AttachmentRef } from '@/contracts/real-content';
import { materialAttachments } from '@/server/material-attachments';
import {db} from '@/server/db';
import manifest from '../../sources/archive-visual-20261111/manifest.json';
import { visuals, visualSlots, type Visual, type VisualSlot } from './visuals';

export interface PublishedVisual extends Visual { src: string; material: { slug: string } }

/** Every published image attachment on public CMS pages, keyed by the SHA-256 of its original bytes. */
const publishedImages = cache(async (): Promise<Map<string, { ref: AttachmentRef; slug: string }>> => {
  const out = new Map<string, { ref: AttachmentRef; slug: string }>();
  try {
    const keys=[...new Set(manifest.images.flatMap(image=>image.origin==='official_archive_site'&&image.publicationParentSourceKey?[image.publicationParentSourceKey]:[]))];
    for(const sourceKey of keys){
      const binding=await db.realContentBinding.findUnique({where:{namespace_sourceKey_locale:{namespace:'real-content-20261111',sourceKey,locale:'ru'}}});
      if(!binding||binding.targetKind!=='cms')continue;
      // The ordinary resolver still checks the live parent and each published
      // attachment. No corpus scan or cached public copy bypasses revocation.
      const refs=await materialAttachments({kind:'cms',id:binding.targetId},'ru');
      const item=refs.length?await db.contentItem.findUnique({where:{id:binding.targetId},select:{slug:true}}):null;
      if(!item)continue;
      for(const ref of refs)if(ref.variant==='master'&&/^image\/(png|jpeg)$/.test(ref.mimeType)&&!out.has(ref.sha256))out.set(ref.sha256,{ref,slug:item.slug});
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
