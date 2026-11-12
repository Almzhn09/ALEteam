'use client';
// R-F02: rows of the fonds and newspaper directories. A row is a source line, never a digital copy of a file,
// so it carries its own kind label and the source edition instead of a viewer.
import Link from 'next/link';
import type { FundDirectoryEntry, NewspaperEntry, RegistrySource } from '@/contracts/real-content';
import { useI18n } from '@/lib/lang';

export function KindBadge({ kind }: { kind: 'material' | 'document' | 'fund' | 'newspaper' }) {
  const { t } = useI18n();
  const label = { material: 'Материал сайта', document: 'Архивный документ', fund: 'Справочник фондов', newspaper: 'Перечень газет' }[kind];
  return <span className={`badge kind-badge kind-${kind}`}>{t(label)}</span>;
}

export function SourceEdition({ source }: { source: RegistrySource }) {
  const { t } = useI18n();
  return <p className="small muted" lang="ru">{source.title} · {source.edition}{source.asOf ? ` · ${t('на')} ${source.asOf.slice(0, 10)}` : ''}</p>;
}

export function FundRow({ entry, showKind = false }: { entry: FundDirectoryEntry; showKind?: boolean }) {
  const { t } = useI18n();
  const [first, ...rest] = entry.names;
  return (
    <li className="registry-row">
      <div className="registry-head">
        {showKind && <KindBadge kind="fund" />}
        <span className="registry-number mono" aria-label={t('Номер фонда')}>{entry.number}</span>
      </div>
      <h3 className="registry-title" lang="ru"><Link href={`/directories/funds/${entry.id}`}>{first?.name ?? entry.number}</Link></h3>
      {first?.periodOriginal && <p className="small" lang="ru">{first.periodOriginal}</p>}
      {rest.length > 0 && <p className="small muted">{t('Другие названия в источнике')}: {rest.length}</p>}
    </li>
  );
}

export function NewspaperRow({ entry, showKind = false }: { entry: NewspaperEntry; showKind?: boolean }) {
  const { t } = useI18n();
  return (
    <li className="registry-row">
      {showKind && <div className="registry-head"><KindBadge kind="newspaper" /></div>}
      <h3 className="registry-title" lang="ru"><Link href={`/directories/newspapers/${entry.id}`}>{entry.title}</Link></h3>
      <dl className="registry-facts small">
        {entry.yearsOriginal && <div><dt>{t('Годы')}</dt><dd lang="ru">{entry.yearsOriginal}</dd></div>}
        {entry.volumesOriginal && <div><dt>{t('Единиц хранения')}</dt><dd lang="ru">{entry.volumesOriginal}</dd></div>}
      </dl>
      {entry.publisherOriginal && <p className="small muted" lang="ru">{entry.publisherOriginal}</p>}
    </li>
  );
}
