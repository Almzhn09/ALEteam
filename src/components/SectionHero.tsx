import type { ReactNode } from 'react';
import type { VisualSlot } from '@/lib/visuals';

/** A lightweight section introduction. The legacy image prop stays compatible,
 * but a section heading never scans CMS attachments. Editorial illustrations
 * are explicit ArchivePhoto components; restricted files use their own viewer. */
export function SectionHero({ title, lead, children, level = 1 }: { title: string; lead: string; image?: VisualSlot; children?: ReactNode; level?: 1 | 2 }) {
  const H = level === 1 ? 'h1' : 'h2';
  return <header className="section-intro">
    <H>{title}</H>
    <p className="lead">{lead}</p>
    {children}
  </header>;
}
