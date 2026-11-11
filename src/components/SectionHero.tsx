import type { ReactNode } from 'react';
import { getT } from '@/lib/i18n-server';
import type { VisualSlot } from '@/lib/visuals';
import { slotVisual } from '@/lib/visuals-server';

/** Page opening: large title and lead beside one real image. Without a published image it stays text-only. */
export async function SectionHero({ title, lead, image, children, level = 1 }: { title: string; lead: string; image?: VisualSlot; children?: ReactNode; level?: 1 | 2 }) {
  const [t, visual] = await Promise.all([getT(), image ? slotVisual(image) : Promise.resolve(null)]);
  const H = level === 1 ? 'h1' : 'h2';
  const hint = t('(откроется в новой вкладке)');
  return (
    <section className={`hero${visual ? ' hero-with-image' : ''}`}>
      <div className="hero-text">
        <H id="hero-title" className="hero-title">{title}</H>
        <p className="hero-lead">{lead}</p>
        {children}
      </div>
      {visual && <figure className="hero-figure">
        {/* Plain img: no optimizer cache may outlive a withdrawn attachment. Dimensions reserve the space. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={visual.src} width={visual.width} height={visual.height} alt={t(visual.alt)} decoding="async" fetchPriority="high" />
        <figcaption className="small">
          {t(visual.caption)} <span className="muted">{t('Фото:')} <a href={visual.sourceUrl} target="_blank" rel="noopener noreferrer">{t(visual.credit)}<span className="visually-hidden"> {hint}</span></a></span>
        </figcaption>
      </figure>}
    </section>
  );
}
