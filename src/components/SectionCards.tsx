import Link from 'next/link';
import type { Translate } from '@/lib/i18n';
import { materialHref, type ListedItem } from '@/lib/sections-server';

/** First readable sentence(s) of a CMS body, without its repeated title line or table rows. */
export function excerpt(body: string, title: string, max = 220) {
  const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.includes(' | ') && l !== title && !title.startsWith(l));
  const text = lines.join(' ').replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[,;:–—-]\s*$/, '') + '…';
}

export function SectionCards({ items, t, headingLevel = 3, showExcerpt = true }: { items: ListedItem[]; t: Translate; headingLevel?: 2 | 3; showExcerpt?: boolean }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <ul className="material-grid">
      {items.map(entry => {
        const p = entry.item.payload;
        return (
          <li key={entry.item.id} className="material-card reveal">
            <H className="material-card-title"><Link href={materialHref(entry)} lang={entry.item.locale}>{p.title}</Link></H>
            {showExcerpt && <p className="material-card-text" lang={entry.item.locale}>{excerpt(p.body, p.title)}</p>}
            {entry.original && <p className="small muted">{t('Материал на языке источника')}</p>}
          </li>
        );
      })}
    </ul>
  );
}
