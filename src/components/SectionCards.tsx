import Link from 'next/link';
import type { Translate } from '@/lib/i18n';
import { materialHref, type ListedItem } from '@/lib/sections-server';
import { cmsAttachmentRefs } from '@/server/cms-attachments';

/** P0-F2: whether a listed material has a published readable original (PDF/DOCX), checked with the same visibility rules as its page. */
export async function readableOriginals(items: ListedItem[]) {
  const refs = await Promise.all(items.map(e => cmsAttachmentRefs(e.item.id, e.item.locale as 'ru' | 'kk' | 'en').catch(() => [])));
  return new Set(items.filter((_, i) => refs[i].some(f => f.variant === 'master' && !f.mimeType.startsWith('image/'))).map(e => e.item.id));
}

export function ReadOriginalLink({ href, t }: { href: string; t: Translate }) {
  return <a className="read-original-link" href={href + '#material-originals'}>{t('Читать документ')}<span aria-hidden="true"> →</span></a>;
}

/** First readable sentence(s) of a CMS body, without its repeated title line or table rows. */
export function excerpt(body: string, title: string, max = 220) {
  const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.includes(' | ') && l !== title && !title.startsWith(l));
  const text = lines.join(' ').replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[,;:–—-]\s*$/, '') + '…';
}

export async function SectionCards({ items, t, headingLevel = 3, showExcerpt = true }: { items: ListedItem[]; t: Translate; headingLevel?: 2 | 3; showExcerpt?: boolean }) {
  const withOriginal = await readableOriginals(items);
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
            {withOriginal.has(entry.item.id) && <ReadOriginalLink href={materialHref(entry)} t={t} />}
          </li>
        );
      })}
    </ul>
  );
}
