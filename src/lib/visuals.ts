// R-F04: descriptions of the verified images from sources/archive-visual-20261111/manifest.json (Artur, R-A02).
// The bytes are never copied into public/: a visual appears only while its CMS attachment is published, and it is
// recognised by the SHA-256 of the original. Captions and alt texts are dictionary keys (RU source).
export interface Visual { id: string; sha256: string; width: number; height: number; caption: string; alt: string; credit: string; sourceUrl: string }

import manifest from '../../sources/archive-visual-20261111/manifest.json';

// The validated source manifest is authoritative. Replacing an incomplete transfer must not leave a stale UI hash.
export const visuals: Visual[] = manifest.images.flatMap(image=>{
  if(!image.sourceUrl||image.decoderValidation.status!=='complete_decode')return [];
  return [{id:image.id,sha256:image.sha256,width:image.width,height:image.height,caption:image.caption,alt:image.alt,credit:image.credit,sourceUrl:image.sourceUrl}];
});

/** Which image may lead which page: the manifest's `usage` (the poster is a past event, so it never leads a page). */
export const visualSlots = {
  home: ['archive-next-generation-ridder', 'thematic-exhibition-altay'],
  about: ['reading-room-researcher', 'archive-next-generation-ridder'],
  reading: ['reading-room-researcher'],
} as const;
export type VisualSlot = keyof typeof visualSlots;
