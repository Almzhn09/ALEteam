import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { FundDirectoryEntry, NewspaperEntry } from '@/contracts/real-content';
import { Breadcrumbs } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { directory } from '@/server/reference-directory';

async function load(kind: 'fund' | 'newspaper', id: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return null;
  try {
    const path = kind === 'fund' ? 'funds' : 'newspapers';
    const response = await directory(new Request(`http://internal.invalid/api/directories/${path}/${id}`), kind, id);
    return ((await response.json()) as { item: FundDirectoryEntry | NewspaperEntry }).item;
  } catch { return null; }
}
export async function entryTitle(kind: 'fund' | 'newspaper', id: string) {
  const item = await load(kind, id);
  return item ? (item.kind === 'fund' ? `${item.number} · ${item.names[0]?.name ?? ''}` : item.title) : null;
}

/** One directory entry with every source row; the row numbers are provenance, not archival references. */
export async function Entry({ kind, id }: { kind: 'fund' | 'newspaper'; id: string }) {
  const [t, item] = await Promise.all([getT(), load(kind, id)]);
  if (!item) notFound();
  const listHref = kind === 'fund' ? '/directories/funds' : '/directories/newspapers';
  const listTitle = kind === 'fund' ? 'Справочник фондов' : 'Перечень хранения газет';
  const s = item.source;
  return (
    <div className="container page stack-lg measure-wide">
      <Breadcrumbs items={[{ href: '/directories', label: t('Справочники фондов') }, { href: listHref, label: t(listTitle) }, { label: item.kind === 'fund' ? item.number : item.title }]} />
      {item.kind === 'fund' ? <>
        <header className="page-head">
          <p className="eyebrow">{t('Номер фонда')}: <span className="mono">{item.number}</span></p>
          <h1 lang="ru">{item.names[0]?.name ?? item.number}</h1>
        </header>
        <section className="stack" aria-labelledby="names-title">
          <h2 id="names-title">{t('Названия в источнике')}</h2>
          <p className="small muted">{t('Строки приведены как в источнике. Разные названия одного номера не обязательно означают переименование.')}</p>
          <ol className="timeline-list">{item.names.map(n => <li key={n.sourceRow}>
            <span className="timeline-period" lang="ru">{n.periodOriginal ?? t('Период не указан')}</span>
            <span lang="ru">{n.name}</span>
            <span className="small muted">{t('Строка источника')} {n.sourceRow}</span>
          </li>)}</ol>
        </section>
      </> : <>
        <header className="page-head"><h1 lang="ru">{item.title}</h1></header>
        <dl className="props">
          {item.yearsOriginal && <><dt>{t('Годы')}</dt><dd lang="ru">{item.yearsOriginal}</dd></>}
          {item.volumesOriginal && <><dt>{t('Единиц хранения')}</dt><dd lang="ru">{item.volumesOriginal}</dd></>}
          {item.publisherOriginal && <><dt>{t('Издатель')}</dt><dd lang="ru">{item.publisherOriginal}</dd></>}
          {item.notes && <><dt>{t('Примечание')}</dt><dd lang="ru">{item.notes}</dd></>}
          <dt>{t('Строка источника')}</dt><dd>{item.sourceRow}</dd>
        </dl>
      </>}
      <aside className="source-note small" aria-label={t('Источник')}>
        <strong>{t('Источник')}</strong>
        <p lang="ru">{s.title} · {s.edition}{s.asOf ? ` · ${s.asOf.slice(0, 10)}` : ''}</p>
        {s.notes && <p lang="ru">{s.notes}</p>}
        {!s.holder && <p>{t('Держатель фонда в источнике не указан.')}</p>}
        <p>{t('Цифровая копия дела пока не добавлена. Доступные материалы и справочники можно найти в поиске.')}</p>
      </aside>
      <p><Link href={listHref}>← {t(listTitle)}</Link></p>
    </div>
  );
}
