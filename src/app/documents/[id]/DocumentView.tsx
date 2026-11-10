import Link from 'next/link';
import type { ArchiveFile, DocumentType } from '@/contracts/api';
import { fileUrl } from '@/lib/api';
import { formatSize, typeLabel } from '@/lib/labels';
import {getT} from '@/lib/i18n-server';
import { Breadcrumbs, DemoBadge, Notice } from '@/components/ui';
import { FavoriteButton } from '@/components/DocumentCard';
import { ScanViewer } from '@/components/ScanViewer';
import { PdfViewer } from '@/components/PdfViewer';
import { Comments } from '@/components/Comments';
import { CopyButton, Share } from '@/components/Share';
import { RecognizedText } from '@/components/DocumentDiscovery';
import {RelatedMaterials,ExplainDocument} from '@/components/DiscoveryMaterials';
import {RememberDocument} from '@/components/HomeDiscovery';

const isImage = (mime: string) => mime === 'image/png' || mime === 'image/jpeg';
const isPdf = (mime: string) => mime === 'application/pdf';
const isAv = (mime: string) => mime.startsWith('audio/') || mime.startsWith('video/');

export interface PublicDocument {
  id: string; title: string; description: string; reference: string; year: number; yearTo: number | null; type: DocumentType; isDemo: boolean;
  fundId: string; locale: string; availableLocales: string[]; originalLanguage: string | null; leafCount: number | null; allowDigitalCopy: boolean;
  rights: string; sourceUrl: string | null; sourceNote: string | null; authorName: string | null; organization: string | null; locality: string | null;
  storageLocation: string | null; accessConditions: string | null; category: string | null; tags: string[];
  fund: { id: string; name: string; description: string; number: string | null };
  archivalCase: { id: string; number: string; title: string; inventory: { id: string; number: string; title: string } } | null;
  files: ArchiveFile[];
}

export async function DocumentView({ doc, translated }: { doc: PublicDocument; translated: boolean }) {
  const t=await getT();
  const scans = doc.files.filter(f => isImage(f.mimeType));
  const period = doc.yearTo && doc.yearTo !== doc.year ? `${doc.year}–${doc.yearTo}` : String(doc.year);
  const inventory = doc.archivalCase?.inventory;
  const filter = (query: Record<string, string>) => `/catalog?${new URLSearchParams(query)}`;
  const row = (label: string, value: string | number | null | undefined) => value || value === 0 ? <><dt>{t(label)}</dt><dd>{value}</dd></> : null;
  return (
    <div className="container page">
      <RememberDocument documentId={doc.id}/>
      <Breadcrumbs items={[{ href: '/catalog', label: t('Каталог') }, { label: doc.title }]} />
      <div className="doc-layout">
        <article className="stack" aria-labelledby="doc-title">
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="badge badge-neutral">{t(typeLabel[doc.type])}</span>
            <DemoBadge show={doc.isDemo} />
          </div>
          <h1 id="doc-title" lang={doc.locale} style={{ marginBottom: 0 }}>{doc.title}</h1>
          {!translated && <p className="small muted" style={{ margin: 0 }}>{t('Материал показан на языке источника.')}</p>}
          {doc.isDemo && <Notice tone="warn" title={t('Демонстрационная запись')}>{t('Материал вымышлен для проверки интерфейса и не является историческим источником.')}</Notice>}
          <section aria-labelledby="desc-title">
            <h2 id="desc-title" className="visually-hidden">{t('Описание')}</h2>
            <p className="prose pre-wrap" lang={doc.locale}>{doc.description}</p>
          </section>

          {!doc.allowDigitalCopy ? <Notice tone="info" title={t('Цифровая копия закрыта')}><p>{doc.accessConditions ?? t('Карточка открыта, но доступ к цифровой копии не предоставляется.')}</p></Notice>
            : scans.length > 0 ? <ScanViewer files={scans} title={doc.title} />
            : <div className="panel muted small">{t('Для этого документа нет опубликованных изображений сканов.')}</div>}
          {scans.filter(f => /^demo-scan-[1-5]$/.test(f.id)).map(f => <RecognizedText key={f.id} fileId={f.id} />)}
          {doc.allowDigitalCopy&&<ExplainDocument documentId={doc.id}/>}
          <RelatedMaterials documentId={doc.id}/>

          {doc.files.length > 0 && (
            <section aria-labelledby="files-title">
              <h2 id="files-title">{t('Файлы')}</h2>
              <ul className="result-list">
                {doc.files.map(f => (
                  <li key={f.id} className="card card-flat" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <div className="row spread">
                      <span lang={doc.locale}>{f.name} <span className="muted small">· {isPdf(f.mimeType) ? 'PDF' : isImage(f.mimeType) ? t('изображение') : f.mimeType} · {formatSize(f.size)}</span></span>
                      <span className="row" style={{ gap: 'var(--space-2)' }}>
                        {isPdf(f.mimeType) && <PdfViewer file={f} title={doc.title} />}
                        <a className="btn btn-secondary btn-sm" href={fileUrl(f.id)} target="_blank" rel="noopener noreferrer">
                          {t('Открыть')}<span className="visually-hidden"> {f.name} {t('(откроется в новой вкладке)')}</span>
                        </a>
                        {f.downloadable
                          ? <a className="btn btn-secondary btn-sm" href={fileUrl(f.id, true)} download>{t('Скачать')}<span className="visually-hidden"> {f.name}</span></a>
                          : <span className="small muted">{t('Скачивание не разрешено')}</span>}
                      </span>
                    </div>
                    {isAv(f.mimeType) && (f.mimeType.startsWith('audio/') ? <audio controls preload="none" src={fileUrl(f.id)} /> : <video controls preload="none" src={fileUrl(f.id)} style={{ width: '100%' }} />)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <aside className="card stack" aria-labelledby="props-title">
          <h2 id="props-title" style={{ fontSize: '1.15rem' }}>{t('Реквизиты')}</h2>
          <dl className="props" lang={doc.locale}>
            <dt>{t('Архивный шифр')}</dt><dd className="mono">{doc.reference}</dd>
            <dt>{t('Период')}</dt><dd>{period}</dd>
            <dt>{t('Тип')}</dt><dd>{t(typeLabel[doc.type])}</dd>
            <dt>{t('Фонд')}</dt><dd><Link href={filter({ fundId: doc.fund.id })}>{doc.fund.number ? `№ ${doc.fund.number}. ` : ''}{doc.fund.name}</Link></dd>
            {inventory && <><dt>{t('Опись')}</dt><dd><Link href={filter({ fundId: doc.fund.id, inventoryId: inventory.id })}>№ {inventory.number}. {inventory.title}</Link></dd></>}
            {doc.archivalCase && <><dt>{t('Дело')}</dt><dd><Link href={filter({ fundId: doc.fund.id, caseId: doc.archivalCase.id })}>№ {doc.archivalCase.number}. {doc.archivalCase.title}</Link></dd></>}
            {row('Автор', doc.authorName)}{row('Организация', doc.organization)}{row('Населённый пункт', doc.locality)}
            {row('Язык оригинала', doc.originalLanguage)}{row('Количество листов', doc.leafCount)}{row('Категория', doc.category)}{row('Место хранения', doc.storageLocation)}
            {doc.tags.length > 0 && <><dt>{t('Темы')}</dt><dd>{doc.tags.map((tag, i) => <span key={tag}>{i > 0 && ', '}<Link href={filter({ tag })}>{tag}</Link></span>)}</dd></>}
            <dt>{t('Права')}</dt><dd>{doc.rights}</dd>
            {row('Происхождение', doc.sourceNote)}
            <dt>{t('Источник')}</dt>
            <dd>{doc.sourceUrl && /^https?:\/\//i.test(doc.sourceUrl)
              ? <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Открыть источник')}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>
              : <span className="muted">{t('Не указан')}</span>}</dd>
          </dl>
          <div className="row" style={{ gap: 'var(--space-2)' }}><CopyButton text={doc.reference} label={t('Копировать шифр')} done={t('Шифр скопирован')} /></div>
          <Share title={doc.title} path={`/documents/${encodeURIComponent(doc.id)}`} />
          <FavoriteButton doc={doc} />
          <Link className="btn btn-secondary" href={`/assistant?q=${encodeURIComponent(t('Расскажи о документе {ref}', { ref: doc.reference }))}`}>{t('Спросить ИИ о документе')}</Link>
        </aside>
      </div>

      <div className="section prose" style={{ maxWidth: 820 }}>
        <Comments documentId={doc.id} />
      </div>
    </div>
  );
}
