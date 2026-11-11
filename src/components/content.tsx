// Server-rendered building blocks for CMS publications. Bodies are plain text and are never parsed as HTML.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PublicContentItem } from '@/contracts/cms';
import { dayFormatter, langName, type Lang, type Translate } from '@/lib/i18n';
import { Breadcrumbs, DemoBadge } from '@/components/ui';
import { contentHref } from '@/server/public-read';
import { sectionOf } from '@/lib/sections';

/** Source note for readers: internal codes, storage paths and English technical remarks stay in the admin data. */
export function readerSourceNote(note: string | null | undefined) {
  if (!note) return '';
  return note.split(';').map(part => part.trim()).filter(part => part && !/^S\d{2}\b/.test(part) && !/sources\/|originals|verbatim|transcription|sourceKey|sha/i.test(part) && /[а-яёәіңғүұқөһ]/i.test(part)).join('; ');
}

const isHttp = (url?: string | null): url is string => !!url && /^https?:\/\//i.test(url);
export function period(p: PublicContentItem['payload']) {
  if (p.yearFrom && p.yearTo) return p.yearFrom === p.yearTo ? String(p.yearFrom) : `${p.yearFrom}–${p.yearTo}`;
  return p.yearFrom ? String(p.yearFrom) : p.yearTo ? String(p.yearTo) : '';
}

export function ContentCard({ item, lang, t, href }: { item: PublicContentItem; lang: Lang; t: Translate; href?: string }) {
  const p = item.payload;
  const day = dayFormatter(lang);
  return (
    <article className="card card-flat">
      <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
        {p.date && <time className="small muted" dateTime={p.date}>{day(p.date)}</time>}
        {period(p) && <span className="small muted">{period(p)}</span>}
        {sectionOf(p.category) && <span className="badge badge-neutral">{t(sectionOf(p.category)!.title)}</span>}
        <DemoBadge show={item.isDemo} />
      </div>
      <h2 style={{ fontSize: '1.1rem', marginBottom: 'var(--space-2)' }}><Link href={href ?? contentHref(item)}>{p.title}</Link></h2>
      <p className="small muted clamp-2" style={{ margin: 0 }}>{p.seoDescription ?? p.body}</p>
    </article>
  );
}

export function Provenance({ item, t }: { item: PublicContentItem; t: Translate }) {
  const p = item.payload;
  return (
    <dl className="props">
      <dt>{t('Права')}</dt><dd>{p.rights}</dd>
      {readerSourceNote(p.sourceNote) && <><dt>{t('Происхождение')}</dt><dd>{readerSourceNote(p.sourceNote)}</dd></>}
      {isHttp(p.sourceUrl) && <><dt>{t('Источник')}</dt><dd><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Открыть источник')}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a></dd></>}
      {period(p) && <><dt>{t('Период')}</dt><dd>{period(p)}</dd></>}
    </dl>
  );
}

export function RelatedLinks({ links, t }: { links: { label: string; url: string }[]; t: Translate }) {
  const safe = links.filter(l => isHttp(l.url));
  if (!safe.length) return null;
  return <ul>{safe.map(l => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a></li>)}</ul>;
}

export function Related({ documents, content, t }: { documents: { id: string; title: string; reference: string }[]; content: PublicContentItem[]; t: Translate }) {
  if (!documents.length && !content.length) return null;
  return (
    <section aria-labelledby="related-title" className="stack">
      <h2 id="related-title" style={{ fontSize: '1.15rem' }}>{t('Связанные материалы')}</h2>
      <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
        {documents.map(d => <li key={d.id}><Link href={`/documents/${encodeURIComponent(d.id)}`}>{d.title}</Link> <span className="mono small muted">{d.reference}</span></li>)}
        {content.map(c => <li key={c.id}><Link href={contentHref(c)}>{c.payload.title}</Link></li>)}
      </ul>
    </section>
  );
}

type Block = { type: 'p'; text: string } | { type: 'ul'; items: string[] } | { type: 'table'; rows: string[][] };
/** Plain-text body into paragraphs, lists and tables (lines with " | "). Text is never parsed as HTML. */
export function bodyBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    if (!line) { if (last?.type === 'p') blocks.push({ type: 'p', text: '' }); continue; }
    if (line.includes(' | ') || line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim());
      if (cells.every(c => !c)) continue;
      if (last?.type === 'table') last.rows.push(cells); else blocks.push({ type: 'table', rows: [cells] });
    } else if (/^[-•–](\s+|(?=[«"A-ZА-ЯЁӘІҢҒҮҰҚӨҺ]))/u.test(line)) {
      // "- item" and source lists written as "-Item" (a dash before a capital or quote; "-5" stays text).
      const text = line.replace(/^[-•–]\s*/, '');
      if (last?.type === 'ul') last.items.push(text); else blocks.push({ type: 'ul', items: [text] });
    } else if (last?.type === 'p' && last.text && !/[.!?:;»)]$/.test(last.text) && line.length < 80 && last.text.length < 80) {
      last.text += '\n' + line;
    } else blocks.push({ type: 'p', text: line });
  }
  return blocks.filter(b => b.type !== 'p' || b.text);
}

export function Body({ item }: { item: PublicContentItem }) {
  const blocks = bodyBlocks(item.payload.body);
  return <div className="prose body-text" lang={item.locale}>{blocks.map((b, i) => {
    if (b.type === 'p') return <p key={i} className="pre-wrap">{b.text}</p>;
    if (b.type === 'ul') return <ul key={i}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>;
    const width = Math.max(...b.rows.map(r => r.length));
    const rows = b.rows.map(r => r.length === width ? r : [...r, ...Array(width - r.length).fill('')]);
    // Drop columns that are empty in every row (source tables keep layout spacers).
    const keep = Array.from({ length: width }, (_, c) => rows.some(r => r[c]));
    return <div key={i} className="table-wrap body-table" tabIndex={0}><table className="table"><tbody>{rows.map((r, j) => <tr key={j}>{r.filter((_, c) => keep[c]).map((cell, c) => c === 0 ? <th key={c} scope="row">{cell}</th> : <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>;
  })}</div>;
}

export function NoTranslation({ available, t, crumbs, path }: { available: string[]; t: Translate; crumbs: { href?: string; label: string }[]; path: string }) {
  return (
    <div className="container page">
      <Breadcrumbs items={crumbs} />
      <div className="card card-flat empty">
        <h1>{t('Нет перевода на выбранный язык')}</h1>
        <p className="muted">{t('Материал опубликован на других языках. Автоматическая подмена не выполняется.')}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {available.map(l => <a key={l} className="btn btn-secondary" lang={l} href={`${path}?lang=${l}`}>{langName[l as Lang] ?? l}</a>)}
        </div>
      </div>
    </div>
  );
}

// Server counterpart of the client Pagination: hrefs are computed here, so no function crosses into a client component.
export function Pager({ page, pageSize, total, href, t }: { page: number; pageSize: number; total: number; href(page: number): string; t: Translate }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={t('Страницы результатов')}>
      {page > 1 && <Link className="btn btn-secondary btn-sm" href={href(page - 1)} rel="prev">← {t('Назад')}</Link>}
      {Array.from({ length: pages }, (_, i) => i + 1).map(p => <Link key={p} className="btn btn-secondary btn-sm" href={href(p)} aria-current={p === page ? 'page' : undefined} aria-label={t('Страница {n}', { n: p })}>{p}</Link>)}
      {page < pages && <Link className="btn btn-secondary btn-sm" href={href(page + 1)} rel="next">{t('Вперёд')} →</Link>}
    </nav>
  );
}

export function FilterBar({ action, children, t, reset }: { action: string; children: ReactNode; t: Translate; reset: boolean }) {
  return (
    <form className="card card-flat filter-grid" action={action} method="get" role="search">
      {children}
      <div className="row filter-actions">
        <button type="submit" className="btn btn-primary">{t('Применить')}</button>
        {reset && <Link href={action} className="btn btn-ghost">{t('Сбросить')}</Link>}
      </div>
    </form>
  );
}

export function EmptyList({ t, filtered }: { t: Translate; filtered: boolean }) {
  return (
    <div className="card card-flat empty">
      <h2>{filtered ? t('Ничего не найдено') : t('Пока ничего не опубликовано')}</h2>
      {!filtered && <p className="muted">{t('На выбранном языке публикаций нет. Переводы появляются после проверки редактором.')}</p>}
    </div>
  );
}

export const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
export const yearOf = (v: string) => (/^\d{1,4}$/.test(v) && +v >= 1 && +v <= 2100 ? +v : undefined);
export const includes = (text: string | undefined, q: string) => !!text && text.toLocaleLowerCase().includes(q.toLocaleLowerCase());
export function pageHref(action: string, query: Record<string, string>, page: number) {
  const p = new URLSearchParams(Object.entries(query).filter(([, v]) => v));
  if (page > 1) p.set('page', String(page));
  return p.size ? `${action}?${p}` : action;
}
export function inPeriod(p: PublicContentItem['payload'], from?: number, to?: number) {
  if (from === undefined && to === undefined) return true;
  const start = p.yearFrom ?? p.yearTo ?? (p.date ? +p.date.slice(0, 4) : undefined);
  if (start === undefined) return false;
  const end = p.yearTo ?? start;
  return (from === undefined || end >= from) && (to === undefined || start <= to);
}
